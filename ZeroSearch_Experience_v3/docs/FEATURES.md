# ZeroSearch 2.2 — usability-first upgrade

## Extension UI
- Refined light-glass interface with soft gradients, responsive cards, animated floating launcher, and keyboard shortcut `Alt+Shift+Z`.
- Outside-click and Escape-to-close behavior.
- Persistent floating launcher on ordinary HTTP/HTTPS webpages.

## Innovative usability features
- **Page clarity snapshot:** local heuristic scan of visible form fields, accessible names, heading hierarchy, vague actions, empty links, and long-page content. It gives actionable observations and a rough score. It is not a certified accessibility audit.
- **Focus mode:** softens common navigation/ad regions and can be toggled off.
- **Link discovery:** outlines links and interactive controls to make clickable regions easier to spot.
- **Next best step:** ranks likely destinations from browsing sequences through the existing backend prediction endpoint.
- **Quick backtrack:** return to the previous page.
- **Privacy controls:** pause/resume event tracking; opt-in local form draft recovery with sensitive fields skipped.
- **Keyboard accessibility:** `Alt+Shift+Z` toggles the assistant; Escape closes it; controls have visible focus rings; reduced-motion preference is respected.

## AI / machine learning status
The page clarity scan is a rule-based heuristic. Next-destination suggestions use the existing backend's history/transition-based ranking. This release does **not** add a trained ML model, neural network, or LLM. The project can be extended with a train/test-evaluated next-action model later.
