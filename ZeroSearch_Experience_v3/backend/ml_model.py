"""Explainable next-page ML training and chronological holdout evaluation.

Uses only locally recorded visit transitions. Page titles are retained for readable
recommendations, while URL structure and navigation context provide model features.
"""
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote
import re
import joblib
from sklearn.feature_extraction import DictVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline


def _url_info(url):
    parsed = urlparse(str(url or ""))
    host = (parsed.hostname or "").lower()
    path = unquote(parsed.path or "/").strip("/") or "home"
    parts = [p for p in path.split("/") if p]
    lower_parts = [p.lower() for p in parts]
    query = parse_qs(parsed.query)
    # Stable page-type features generalize better than memorizing arbitrary paths.
    if re.search(r"/(?:dp|gp/product)/", "/" + path.lower() + "/") or "dp" in lower_parts:
        page_type = "product"
    elif lower_parts and lower_parts[0] in {"s", "search", "search-results"}:
        page_type = "search"
    elif "b" in lower_parts or "category" in lower_parts or "collections" in lower_parts:
        page_type = "category"
    elif not parts:
        page_type = "home"
    else:
        page_type = "content"
    tokens = []
    for part in lower_parts:
        if re.fullmatch(r"[a-z0-9]{8,}", part) and any(ch.isdigit() for ch in part):
            continue
        tokens.extend(t for t in re.split(r"[^a-z0-9]+", part) if t)
    return parsed, host, path, parts, query, page_type, tokens


def _features(url, previous_url=""):
    parsed, host, path, parts, query, page_type, tokens = _url_info(url)
    prev, prev_host, prev_path, prev_parts, prev_query, prev_type, prev_tokens = _url_info(previous_url)
    features = {
        "domain": host,
        "page_type": page_type,
        "path_depth": str(len(parts)),
        "first_path_segment": parts[0].lower() if parts else "home",
        "second_path_segment": parts[1].lower() if len(parts) > 1 else "none",
        "query_present": str(bool(parsed.query)),
        "is_home": str(not parts),
        "previous_page_type": prev_type if previous_url else "unknown",
        "previous_first_segment": prev_parts[0].lower() if prev_parts else "unknown",
        "same_domain_as_previous": str(bool(previous_url) and host == prev_host),
    }
    # Keep useful human-readable URL terms; exclude long opaque IDs.
    for token in set(tokens[:18]):
        features["path_token_" + token] = 1
    for key in list(query)[:8]:
        features["query_key_" + key.lower()] = 1
    if previous_url:
        for token in set(prev_tokens[:12]):
            features["previous_token_" + token] = 1
    return features


def _examples(rows):
    """Create same-domain next-visit examples from chronological visit events only."""
    visits = []
    for row in rows:
        event_type = str(row["event_type"] or "visit") if "event_type" in row.keys() else "visit"
        if event_type != "visit":
            continue
        page = str(row["page"] or "")
        parsed = urlparse(page)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            continue
        domain = str(row["domain"] or parsed.hostname).lower()
        if not domain:
            continue
        label = str(row["label"] or "") if "label" in row.keys() else ""
        # Skip consecutive duplicate visits, but preserve a better title if available.
        if visits and visits[-1]["page"] == page:
            if label and not visits[-1]["label"]:
                visits[-1]["label"] = label
            continue
        visits.append({"page": page, "domain": domain, "label": label})

    X, y = [], []
    title_by_url = {}
    for visit in visits:
        if visit["label"]:
            title_by_url[visit["page"]] = visit["label"]
    for previous, current in zip(visits, visits[1:]):
        if previous["domain"] == current["domain"] and previous["page"] != current["page"]:
            X.append(_features(previous["page"]))
            y.append(current["page"])
    # The model's feature vector represents the page being viewed; transition
    # sequence context is not always available at inference time, so avoid leakage.
    return X, y, title_by_url


def _topk_accuracy(model, X_test, y_test, k=3):
    if not X_test:
        return None
    probabilities = model.predict_proba(X_test)
    classes = list(model.named_steps["classifier"].classes_)
    correct = 0
    for probs, actual in zip(probabilities, y_test):
        ranked = sorted(range(len(probs)), key=lambda i: probs[i], reverse=True)[:k]
        if actual in [classes[i] for i in ranked]:
            correct += 1
    return correct / len(y_test)


def _new_model():
    return Pipeline([
        ("vectorizer", DictVectorizer(sparse=False)),
        ("classifier", RandomForestClassifier(
            n_estimators=180, max_depth=12, min_samples_leaf=1,
            class_weight="balanced", random_state=42
        ))
    ])


def train_from_events(rows, model_path):
    X, y, title_by_url = _examples(rows)
    counts = Counter(y)
    if len(X) < 10 or len(counts) < 2:
        return {"ok": False, "trained": False, "examples": len(X), "classes": len(counts),
                "message": "Collect at least 10 same-domain transitions and 2 different destination pages before evaluation."}

    split = max(1, int(len(X) * 0.8))
    X_train, y_train, X_test, y_test = X[:split], y[:split], X[split:], y[split:]
    evaluation = {
        "holdout_transitions": len(y_test), "train_transitions": len(y_train),
        "top1_accuracy": None, "top3_accuracy": None,
        "baseline_top1_accuracy": None, "baseline_top3_accuracy": None,
        "evaluation_note": "Chronological holdout; later transitions were not used to fit the evaluation model."
    }
    if X_test and len(set(y_train)) >= 2:
        evaluator = _new_model()
        evaluator.fit(X_train, y_train)
        evaluation["top1_accuracy"] = round(evaluator.score(X_test, y_test), 4)
        top3 = _topk_accuracy(evaluator, X_test, y_test, 3)
        evaluation["top3_accuracy"] = round(top3, 4) if top3 is not None else None
        baseline_top = [url for url, _ in Counter(y_train).most_common(3)]
        evaluation["baseline_top1_accuracy"] = round(sum(
            1 for actual in y_test if baseline_top and actual == baseline_top[0]
        ) / len(y_test), 4)
        evaluation["baseline_top3_accuracy"] = round(sum(
            1 for actual in y_test if actual in baseline_top
        ) / len(y_test), 4)
    else:
        evaluation["evaluation_note"] = "Not enough distinct training classes for a meaningful holdout comparison. Metrics are unavailable."

    final_model = _new_model()
    final_model.fit(X, y)
    path = Path(model_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "model": final_model, "examples": len(X), "classes": len(counts),
        "evaluation": evaluation, "algorithm": "RandomForestClassifier",
        "title_by_url": title_by_url
    }, path)
    return {"ok": True, "trained": True, "examples": len(X), "classes": len(counts),
            "algorithm": "RandomForestClassifier", "message": "Model trained and holdout evaluation completed.",
            "evaluation": evaluation}


def load_model_info(model_path):
    path = Path(model_path)
    if not path.exists():
        return {"trained": False, "message": "No trained model found yet."}
    try:
        saved = joblib.load(path)
        return {"trained": True, "algorithm": saved.get("algorithm", "RandomForestClassifier"),
                "examples": saved.get("examples", 0), "classes": saved.get("classes", 0),
                "evaluation": saved.get("evaluation", {}),
                "message": "Trained model found locally."}
    except Exception:
        return {"trained": False, "message": "The saved model could not be read. Train it again."}


def _display_title(url, title_by_url):
    title = str(title_by_url.get(url, "") or "").strip()
    if title:
        return title[:100]
    parsed, host, path, parts, query, page_type, tokens = _url_info(url)
    # Avoid raw route fragments such as "electronics/b" in the popup.
    if page_type == "product":
        return "Previously visited product"
    if page_type == "search":
        return "Search results"
    if page_type == "category":
        meaningful = [p.replace("-", " ").replace("_", " ") for p in parts if p.lower() not in {"b", "gp", "new-releases"}]
        return " / ".join(meaningful[-2:]).title() or "Category page"
    if not parts:
        return host
    return " / ".join(p.replace("-", " ").replace("_", " ") for p in parts[-2:]).title()[:100]


def predict_next(current_url, rows, model_path):
    path = Path(model_path)
    if not path.exists():
        return []
    saved = joblib.load(path)
    model = saved["model"]
    domain = (urlparse(current_url).hostname or "").lower()
    if not domain:
        return []
    probabilities = model.predict_proba([_features(current_url)])[0]
    classes = model.named_steps["classifier"].classes_
    title_by_url = saved.get("title_by_url", {})
    scores = []
    for label, probability in zip(classes, probabilities):
        target_domain = (urlparse(label).hostname or "").lower()
        if target_domain == domain and label != current_url:
            scores.append((label, float(probability)))
    scores.sort(key=lambda item: item[1], reverse=True)
    return [{
        "title": _display_title(url, title_by_url),
        "url": url,
        "confidence": round(min(.99, max(.01, score)), 2),
        "reason": "Predicted from your local browsing history"
    } for url, score in scores[:3]]
