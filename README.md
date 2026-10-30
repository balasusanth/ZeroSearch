# ZeroSearch — Innovative Usability Upgrade

A runnable starter implementation of ZeroSearch: a privacy-conscious predictive usability assistant with a Chrome extension, Flask API, SQLite analytics, and a modern dashboard.

## Included capabilities
- Predictive next-action recommendations with explainable reasons and confidence.
- Website-scoped behavior learning and simple sequence/frequency fallback.
- Navigation recovery: recent destinations and quick return to a previous page.
- Quick workflow shortcuts / saved destinations.
- Opt-in form draft recovery using Chrome local storage (password, payment, and sensitive fields are excluded).
- Search intent helper and dead-end friction signals.
- Accessibility controls: text scale, high contrast, reduced motion, keyboard shortcuts.
- Undo-friendly recent navigation history.
- Personal usability scorecard and UX Usability Radar with friction indicators.
- Feedback controls for recommendations.
- Modern responsive dashboard UI.
- Settings and tracking pause toggle.

## Stack
- Python 3.10+
- Flask
- SQLite
- Chrome Extension Manifest V3 (vanilla JavaScript / HTML / CSS)

## Run the backend (Windows PowerShell)
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```
Open `http://127.0.0.1:5000`.

## Load the Chrome extension
1. Start the backend first.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the `extension` folder.
5. After loading the unpacked extension, **refresh any website tab that was already open** (or close and reopen it). The floating ZeroSearch ✦ button should appear at the bottom-right of normal HTTP/HTTPS pages.
6. Click the floating ✦ button to open the assistant. Choose **Predict my next destination** to request suggestions from the local browsing-history sequence model.
6. The extension will attempt to send events to `http://127.0.0.1:5000`.

## What powers the predictions?
The current build uses a **lightweight adaptive sequence/frequency model**: it ranks pages using observed page visits and transitions, then gives a transparent reason for each suggestion. This is behavior-based statistical learning, **not a trained deep-learning/neural-network model**. It needs browsing history before it can make useful suggestions; the displayed confidence is a ranking score, not a calibrated probability. A future version could add a trained model once enough opt-in, representative feedback data exists.

## If the floating button does not appear
- Reload the extension at `chrome://extensions` after replacing its files.
- Refresh the website tab after reloading the extension.
- Test on a normal `https://` or `http://` webpage. Chrome blocks content scripts on internal pages such as `chrome://extensions`, the Chrome Web Store, and some browser-owned pages.
- Open the extension's **Errors** section on `chrome://extensions` if it still does not appear.

## Notes
- This is the ZeroSearch academic project package with Flask, SQLite, Chrome Extension Manifest V3, ML-assisted next-step ranking, and optional AI summaries. The local development setup is intended for demonstration and evaluation; a public deployment still requires a full security and privacy review.
- Form draft recovery is opt-in and stored locally in the browser. It skips password, payment, and sensitive inputs. Drafts are never sent to the Flask backend.
- Tracking can be paused from the extension popup. Browser-internal pages and restricted pages are not accessible to extensions.
- Predictions are heuristic, based on observed local event sequences; confidence is a ranking score, not a calibrated probability.


## 2.2 interface upgrade
The extension now includes a redesigned smooth light-glass copilot, local page clarity scan, focus mode, link discovery, `Alt+Shift+Z` toggle, and privacy-first controls. See `docs/FEATURES.md` for limitations and the current ML status.


## Dashboard UI refresh (v2.3)
The dashboard now uses a polished light-glass visual system, stronger typography, refined sidebar navigation, gradient hero section, modern metric cards, improved empty states, hover feedback, and responsive layouts. Existing dashboard views and API functionality are preserved.


## Version 3.0 — Aurora Experience
A fresh dark aurora redesign for the dashboard, floating copilot, and toolbar popup. Adds reversible Reading Mode while retaining page scanning, Focus Mode, link discovery, next-step suggestions, keyboard access, and privacy controls. See `docs/EXPERIENCE_V3.md`.


## Aurora v3.1: accounts and machine learning

### Sign-in
Run the backend and open `http://127.0.0.1:5000`. First-time users can choose **Create an account**. Passwords are stored as Werkzeug password hashes, not plain text. The current version includes CSRF-protected account forms, session renewal, password hashing, a 12-character registration minimum, baseline security headers, and in-process sign-in throttling. Set a strong `ZEROSEARCH_SECRET_KEY` and enable HTTPS before hosting. Event ingestion remains a local academic workflow and must be scoped to authenticated users before multi-user hosting.

### Train the machine-learning model
From the `backend` folder, install dependencies:

```powershell
python -m pip install -r requirements.txt
python app.py
```

Sign in, open **Smart predictions**, and click **Train model**. The Random Forest classifier learns a next-page label from same-domain navigation transitions and stores `navigation_model.joblib` locally. It requires at least 8 transitions and 2 distinct destination classes. If the data is insufficient, the dashboard explains that more browsing examples are needed. Before enough examples exist, prediction uses the previous transparent frequency-based fallback. This is a small prototype model—not a claim of production-grade prediction accuracy. Evaluate it with held-out sequences and metrics before making performance claims.

### Dashboard controls
- **Personal workspace** opens a menu for selecting a local workspace label.
- **Profile** opens account details and sign-out controls.
- Accessibility preferences remain saved in the browser.


## v3.2 usability updates
- Predictions now load automatically at the top of the floating assistant when it opens.
- Each suggestion includes 👍 Yes / 👎 No feedback controls connected to `/api/feedback`.
- Global shortcut command is registered as **Alt+Shift+Z**. If the browser or another extension owns that shortcut, open `chrome://extensions/shortcuts` and assign a free shortcut to “Toggle the ZeroSearch floating assistant”.
- On Chrome internal pages (such as `chrome://`), the extension cannot inject its assistant; test on a normal `https://` website.


## v3.3 — ML evaluation dashboard

Open **Smart predictions** and click **Train & evaluate**. The backend creates a chronological holdout: earlier navigation transitions are used to fit an evaluation model, and the later transitions are held out. It reports:
- **Top-1 accuracy:** the actual next page was the first-ranked candidate.
- **Top-3 accuracy:** the actual next page appeared among the first three candidates.
- **Baseline accuracy:** comparison against a simple most-frequent-destination baseline.
- **Train/holdout counts:** helps show how much data the estimate uses.

The deployment model is then retrained on all currently available transitions and saved to `backend/navigation_model.joblib`. The evaluation result is saved with that model and is available from the dashboard after reload.

Important interpretation notes:
- Small or repetitive navigation logs can make metrics unstable or optimistic.
- Top-k accuracy is meaningful only when the true next page is represented among candidate classes.
- The baseline comparison is a useful reference, not proof of generalization.
- For a stronger academic evaluation, collect more varied sessions, split by session/user rather than adjacent rows, and compare against a popularity baseline on a held-out set that was not used for training or feature decisions.


## v4.1 reliability and UI polish
- Destination labels in the floating extension now wrap inside a constrained grid, keeping confidence badges aligned even for long URLs or page names.
- Prediction cards and dashboard/auth surfaces use restrained entrance and hover motion, with `prefers-reduced-motion` support.
- Local session signing uses a stable `.session_secret` file so Flask restarts do not invalidate every login. Set `ZEROSEARCH_SECRET_KEY` explicitly for deployment; use HTTPS and set `ZEROSEARCH_COOKIE_SECURE=1` when serving over HTTPS.
- Expired or stale dashboard sessions now return a clear `401 AUTH_REQUIRED` response to API clients. The extension background service reports HTTP errors instead of treating all responses as success.
- The ZIP intentionally excludes the local SQLite database and model artifact. Keep your existing database/model files when replacing the code; if using a clean folder, create an account again.

### Page navigator (v4.4)
The extension includes a local **Page navigator** instead of AI summaries. It estimates reading time from visible paragraphs/list items, builds a clickable outline from visible headings, lets users jump directly to a section, copies the current page URL, and offers a back-to-top shortcut. Reading time is approximate and depends on page structure. This feature runs in the current tab and does not send page text to the backend or require an AI provider.

### Version 4.4 — Page navigator and AI summary removal
The optional AI-summary endpoint and Ollama/API-provider configuration have been removed. ZeroSearch's navigation predictions, usability scan, focus mode, reading mode, link highlighting, authentication, and ML evaluation remain available. Ollama is no longer required for this project version.

### Authentication/security controls
Account forms now use session-bound CSRF tokens; sign-in attempts are throttled per client IP in the running process; registration requires a 12-character password; successful authentication rotates the session; sessions expire after 12 hours; and baseline browser security headers are set. Set `ZEROSEARCH_SECRET_KEY` to a long random secret and enable `ZEROSEARCH_COOKIE_SECURE=1` behind HTTPS for hosted use. The extension event/feedback ingestion APIs remain designed for a local single-user academic setup, not multi-tenant hosting; before public deployment, bind every event and prediction to an authenticated user, add durable distributed rate limiting, and run a full security review.

### ML predictions
The next-step recommender continues to use the existing trained scikit-learn model when available and its sequence/frequency fallback when not. Displayed match scores are ranking scores, not calibrated probabilities. Use varied, consented navigation history and held-out sessions for a meaningful evaluation.


### ML data quality note (v4.4.1)

- Model training now uses only chronological `visit` events. Click events remain available for interaction analytics but are not misinterpreted as page transitions.
- Repeated visits to the same URL in a row are ignored as transitions.
- The extension also records URL changes made by common single-page-app navigation through Chrome’s `webNavigation` events (history-state and fragment changes).
- After replacing the project files, reload the extension and restart Flask. Existing database records are preserved; old click records are simply excluded from ML training.
