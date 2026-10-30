from flask import Flask, jsonify, request, render_template, redirect, url_for, session, flash
from pathlib import Path
import sqlite3, json, re
from datetime import datetime, timedelta
import os, secrets, time
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
from urllib.parse import urlparse

BASE = Path(__file__).resolve().parent
DB_PATH = BASE / "zeros earch.db".replace(" ", "")
app = Flask(__name__, template_folder="templates", static_folder="static")
def _load_secret_key():
    configured = os.environ.get("ZEROSEARCH_SECRET_KEY")
    if configured:
        return configured
    # Keep a stable local secret between restarts so sessions do not randomly expire.
    key_file = BASE / ".session_secret"
    try:
        if key_file.exists():
            key = key_file.read_text(encoding="utf-8").strip()
            if len(key) >= 32:
                return key
        import secrets
        key = secrets.token_urlsafe(48)
        key_file.write_text(key, encoding="utf-8")
        try:
            os.chmod(key_file, 0o600)
        except OSError:
            pass
        return key
    except OSError:
        # Local fallback only; configure ZEROSEARCH_SECRET_KEY for deployment.
        import secrets
        return secrets.token_urlsafe(48)

app.secret_key = _load_secret_key()
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("ZEROSEARCH_COOKIE_SECURE", "0").lower() in {"1", "true", "yes"},
    PERMANENT_SESSION_LIFETIME=timedelta(hours=12),
    SESSION_REFRESH_EACH_REQUEST=True,
    MAX_CONTENT_LENGTH=2 * 1024 * 1024,
)
_LOGIN_ATTEMPTS = {}
_LOGIN_WINDOW_SECONDS = 900
_LOGIN_MAX_ATTEMPTS = 8

def csrf_token():
    token = session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token
    return token

app.jinja_env.globals["csrf_token"] = csrf_token

@app.before_request
def security_headers_and_csrf():
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.endpoint in {"login", "register", "logout"}:
        supplied = request.form.get("csrf_token", "")
        expected = session.get("csrf_token", "")
        if not expected or not supplied or not secrets.compare_digest(supplied, expected):
            return render_template("auth.html", mode=("register" if request.endpoint == "register" else "login"), error="Your form expired. Refresh the page and try again.", next_url=request.form.get("next", "")), 400

@app.after_request
def apply_security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if request.path in {"/auth", "/register"} or request.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with connect() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS events(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL, label TEXT, page TEXT, domain TEXT,
            href TEXT, element TEXT, source TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS feedback(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction TEXT NOT NULL, domain TEXT, useful INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS predictions(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction TEXT NOT NULL, url TEXT, domain TEXT,
            confidence REAL, reason TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings(
            key TEXT PRIMARY KEY, value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS shortcuts(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL, url TEXT NOT NULL, created_at TEXT NOT NULL
        );
        """)

def login_required(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        user_id = session.get("user_id")
        if not user_id:
            if request.path.startswith("/api/"):
                return jsonify(error="Your session has expired. Please sign in again.", code="AUTH_REQUIRED"), 401
            return redirect(url_for("login", next=request.full_path.rstrip("?") ))
        # Remove stale sessions if the associated account no longer exists.
        with connect() as c:
            exists = c.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone()
        if not exists:
            session.clear()
            if request.path.startswith("/api/"):
                return jsonify(error="Your account session is no longer valid. Please sign in again.", code="AUTH_REQUIRED"), 401
            return redirect(url_for("login"))
        return fn(*args, **kwargs)
    return wrapped

def current_user():
    if not session.get("user_id"):
        return None
    with connect() as c:
        row = c.execute("SELECT id,name,email FROM users WHERE id=?", (session["user_id"],)).fetchone()
    return dict(row) if row else None

@app.route("/auth", methods=["GET", "POST"])
def login():
    if session.get("user_id"):
        return redirect(url_for("index"))
    error = ""
    if request.method == "POST":
        client = request.remote_addr or "unknown"
        now_ts = time.time()
        attempts = [t for t in _LOGIN_ATTEMPTS.get(client, []) if now_ts - t < _LOGIN_WINDOW_SECONDS]
        if len(attempts) >= _LOGIN_MAX_ATTEMPTS:
            _LOGIN_ATTEMPTS[client] = attempts
            return render_template("auth.html", mode="login", error="Too many sign-in attempts. Wait 15 minutes and try again.", next_url=request.form.get("next", "")), 429
        attempts.append(now_ts); _LOGIN_ATTEMPTS[client] = attempts
        email = str(request.form.get("email", "")).strip().lower()[:254]
        password = str(request.form.get("password", ""))
        with connect() as c:
            user = c.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if user and check_password_hash(user["password_hash"], password):
            _LOGIN_ATTEMPTS.pop(client, None)
            session.clear()
            session["csrf_token"] = secrets.token_urlsafe(32)
            session["user_id"] = user["id"]
            session.permanent = True
            target = request.form.get("next", "") or request.args.get("next", "")
            # Only allow local relative redirects to prevent open redirects.
            if target.startswith("/") and not target.startswith("//"):
                return redirect(target)
            return redirect(url_for("index"))
        error = "Email or password is incorrect."
    return render_template("auth.html", mode="login", error=error, next_url=request.args.get("next", ""))

@app.route("/register", methods=["GET", "POST"])
def register():
    if session.get("user_id"):
        return redirect(url_for("index"))
    error = ""
    if request.method == "POST":
        name = str(request.form.get("name", "")).strip()[:80]
        email = str(request.form.get("email", "")).strip().lower()[:254]
        password = str(request.form.get("password", ""))
        if not name or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(password) < 12:
            error = "Enter your name, a valid email, and a password with at least 12 characters."
        else:
            try:
                with connect() as c:
                    c.execute("INSERT INTO users(name,email,password_hash,created_at) VALUES(?,?,?,?)",
                              (name, email, generate_password_hash(password), now()))
                with connect() as c:
                    user = c.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
                session.clear()
                session["csrf_token"] = secrets.token_urlsafe(32)
                session["user_id"] = user["id"]
                session.permanent = True
                return redirect(url_for("index"))
            except sqlite3.IntegrityError:
                error = "An account with that email already exists."
    return render_template("auth.html", mode="register", error=error, next_url=request.args.get("next", ""))

@app.post("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

@app.get("/api/me")
@login_required
def api_me():
    return jsonify(user=current_user())

def now():
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"

def safe_domain(url):
    try:
        return (urlparse(url).hostname or "").lower()
    except Exception:
        return ""

def valid_http_url(url):
    try:
        p = urlparse(url)
        return p.scheme in ("http", "https") and bool(p.netloc)
    except Exception:
        return False

def navigation_rows():
    with connect() as c:
        return c.execute("SELECT page,domain,label,created_at,event_type FROM events ORDER BY id ASC").fetchall()

@app.get("/api/model/status")
@login_required
def model_status():
    try:
        from ml_model import load_model_info
        return jsonify(load_model_info(BASE / "navigation_model.joblib"))
    except ImportError:
        return jsonify(trained=False, message="ML dependencies missing. Run pip install -r requirements.txt"), 500
    except Exception as exc:
        return jsonify(trained=False, message=f"Could not read model status: {exc}"), 500

@app.post("/api/model/train")
@login_required
def train_model():
    try:
        from ml_model import train_from_events
        result = train_from_events(navigation_rows(), BASE / "navigation_model.joblib")
        return jsonify(result)
    except ImportError:
        return jsonify(error="ML dependencies are missing. Run pip install -r requirements.txt"), 500
    except Exception as exc:
        return jsonify(error=f"Training failed: {exc}"), 500

@app.route("/")
@login_required
def index():
    return render_template("index.html", user=current_user())

@app.get("/api/health")
def health():
    return jsonify(ok=True, service="ZeroSearch API")

@app.post("/api/events")
def add_event():
    data = request.get_json(silent=True) or {}
    event_type = str(data.get("event_type", "visit"))[:40]
    page = str(data.get("page", ""))[:2000]
    href = str(data.get("href", ""))[:2000]
    domain = str(data.get("domain") or safe_domain(page))[:255]
    label = str(data.get("label", ""))[:300]
    element = str(data.get("element", ""))[:200]
    source = str(data.get("source", "extension"))[:40]
    if not page or not valid_http_url(page):
        return jsonify(error="A valid http/https page URL is required"), 400
    with connect() as c:
        c.execute("""INSERT INTO events(event_type,label,page,domain,href,element,source,created_at)
                     VALUES(?,?,?,?,?,?,?,?)""",
                  (event_type,label,page,domain,href,element,source,now()))
    return jsonify(ok=True)

@app.post("/api/feedback")
def add_feedback():
    data = request.get_json(silent=True) or {}
    prediction = str(data.get("prediction", ""))[:500]
    domain = str(data.get("domain", ""))[:255]
    useful = 1 if data.get("useful") else 0
    if not prediction:
        return jsonify(error="prediction is required"), 400
    with connect() as c:
        c.execute("INSERT INTO feedback(prediction,domain,useful,created_at) VALUES(?,?,?,?)",
                  (prediction,domain,useful,now()))
    return jsonify(ok=True)

@app.get("/api/predict")
def predict():
    page = request.args.get("url", "")
    domain = safe_domain(page)
    if not valid_http_url(page):
        return jsonify(predictions=[])
    # Prefer the trained scikit-learn model when enough navigation examples exist.
    model_path = BASE / "navigation_model.joblib"
    if model_path.exists():
        try:
            from ml_model import predict_next
            ml_results = predict_next(page, navigation_rows(), model_path)
            if ml_results:
                with connect() as c:
                    for item in ml_results:
                        c.execute("INSERT INTO predictions(prediction,url,domain,confidence,reason,created_at) VALUES(?,?,?,?,?,?)",
                                  (item["title"], item["url"], domain, item["confidence"], item["reason"], now()))
                return jsonify(predictions=ml_results, model="trained-scikit-learn")
        except Exception:
            pass
    with connect() as c:
        rows = c.execute("""SELECT page, domain, label, event_type, created_at
                            FROM events WHERE domain=? ORDER BY id DESC LIMIT 300""",
                         (domain,)).fetchall()
    # Cold-start fallback: transparent transition-frequency heuristics.
    sequence_counts = {}
    recent = list(reversed(rows))
    for i in range(len(recent)-1):
        if recent[i]["page"] == page and recent[i+1]["page"] != page:
            nxt = recent[i+1]["page"]
            sequence_counts[nxt] = sequence_counts.get(nxt, 0) + 2
    for row in rows:
        if row["page"] != page:
            sequence_counts[row["page"]] = sequence_counts.get(row["page"], 0) + 1
    ranked = sorted(sequence_counts.items(), key=lambda x: x[1], reverse=True)[:3]
    total = sum(v for _,v in ranked) or 1
    results = []
    for url, score in ranked:
        confidence = round(min(0.96, 0.35 + (score / total) * 0.55), 2)
        reason = "Often visited on this website"
        if any(recent[i]["page"] == page and recent[i+1]["page"] == url for i in range(len(recent)-1)):
            reason = "Previously visited after this page"
        results.append({"title": urlparse(url).path.strip("/") or safe_domain(url),
                        "url": url, "confidence": confidence, "reason": reason})
    with connect() as c:
        for item in results:
            c.execute("INSERT INTO predictions(prediction,url,domain,confidence,reason,created_at) VALUES(?,?,?,?,?,?)",
                      (item["title"], item["url"], domain, item["confidence"], item["reason"], now()))
    return jsonify(predictions=results)

@app.get("/api/analytics")
@login_required
def analytics():
    with connect() as c:
        total = c.execute("SELECT COUNT(*) n FROM events").fetchone()["n"]
        visits = c.execute("SELECT COUNT(*) n FROM events WHERE event_type='visit'").fetchone()["n"]
        clicks = c.execute("SELECT COUNT(*) n FROM events WHERE event_type='click'").fetchone()["n"]
        domains = c.execute("SELECT domain, COUNT(*) n FROM events GROUP BY domain ORDER BY n DESC LIMIT 8").fetchall()
        feedback = c.execute("SELECT COUNT(*) n, COALESCE(SUM(useful),0) useful FROM feedback").fetchone()
        predictions = c.execute("SELECT COUNT(*) n FROM predictions").fetchone()["n"]
        recent = c.execute("SELECT event_type,label,page,domain,created_at FROM events ORDER BY id DESC LIMIT 12").fetchall()
        pages = c.execute("SELECT page, COUNT(*) n FROM events GROUP BY page ORDER BY n DESC LIMIT 100").fetchall()
    # Friction indicators are heuristics, not definitive judgments about a website.
    backtracks = 0
    seq = [r["page"] for r in reversed(recent) if r["page"]]
    for i in range(2, len(seq)):
        if seq[i] == seq[i-2] and seq[i] != seq[i-1]:
            backtracks += 1
    return jsonify(
        metrics={"events":total,"visits":visits,"clicks":clicks,"predictions":predictions,
                 "feedback_total":feedback["n"],"useful_feedback":feedback["useful"]},
        domains=[dict(r) for r in domains],
        recent=[dict(r) for r in recent],
        friction={"backtrack_signals":backtracks,
                  "repeat_page_signals":sum(1 for _,n in [(r["page"],r["n"]) for r in pages] if n >= 4),
                  "note":"Signals are heuristic and should be validated with user testing."}
    )

@app.get("/api/shortcuts")
@login_required
def get_shortcuts():
    with connect() as c:
        rows = c.execute("SELECT id,title,url FROM shortcuts ORDER BY id DESC").fetchall()
    return jsonify(shortcuts=[dict(r) for r in rows])

@app.post("/api/shortcuts")
@login_required
def add_shortcut():
    data = request.get_json(silent=True) or {}
    title = str(data.get("title", "")).strip()[:100]
    url = str(data.get("url", "")).strip()[:2000]
    if not title or not valid_http_url(url):
        return jsonify(error="Provide a title and a valid http/https URL"), 400
    with connect() as c:
        cur = c.execute("INSERT INTO shortcuts(title,url,created_at) VALUES(?,?,?)",(title,url,now()))
        ident = cur.lastrowid
    return jsonify(ok=True,id=ident)

@app.delete("/api/shortcuts/<int:shortcut_id>")
@login_required
def delete_shortcut(shortcut_id):
    with connect() as c:
        c.execute("DELETE FROM shortcuts WHERE id=?",(shortcut_id,))
    return jsonify(ok=True)

@app.get("/api/scorecard")
@login_required
def scorecard():
    with connect() as c:
        events = c.execute("SELECT event_type,page,created_at FROM events ORDER BY id DESC LIMIT 500").fetchall()
        useful = c.execute("SELECT COUNT(*) n FROM feedback WHERE useful=1").fetchone()["n"]
        totalfb = c.execute("SELECT COUNT(*) n FROM feedback").fetchone()["n"]
    repeated = {}
    for e in events:
        if e["page"]:
            repeated[e["page"]] = repeated.get(e["page"],0)+1
    repeat_count = sum(1 for n in repeated.values() if n > 2)
    # Transparent heuristic score: more useful feedback and fewer repeated-page signals improve score.
    score = 70
    score += min(15, useful * 2)
    score -= min(25, repeat_count * 3)
    score = max(0, min(100, score))
    return jsonify(score=score, label="Early signal, not a site quality rating",
                   details={"useful_recommendations":useful,"feedback_count":totalfb,
                            "repeated_page_groups":repeat_count,
                            "events_in_window":len(events)})

@app.post("/api/settings")
@login_required
def save_settings():
    data = request.get_json(silent=True) or {}
    with connect() as c:
        for key,value in data.items():
            if key in {"tracking_paused","radar_enabled"}:
                c.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                          (key, json.dumps(value)))
    return jsonify(ok=True)

if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=5000, debug=False)
