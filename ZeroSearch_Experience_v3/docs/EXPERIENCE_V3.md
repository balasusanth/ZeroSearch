# ZeroSearch 3.0 — Aurora Experience

## UI
- Dashboard redesigned with a deep-ink aurora theme, mint/indigo accents, glass-like surfaces, refined typography, responsive cards, and clearer focus states.
- Floating extension assistant and toolbar popup now share a dark aurora visual system.
- Existing dashboard navigation and data hooks are preserved.

## Usability tools
- Local page clarity snapshot (heuristic, not a formal accessibility audit).
- Predictive next-step suggestions from the existing backend's navigation-pattern ranking.
- Focus mode to soften common navigation/ad regions.
- Interactive element discovery to outline links and controls.
- **Reading mode**: a reversible local style layer that improves line spacing and reading width where page structure supports it.
- Quick backtrack, pause/resume tracking, opt-in form recovery for eligible non-sensitive fields.
- Keyboard shortcut `Alt+Shift+Z`, Escape-to-close, visible focus styles, reduced-motion support.

## AI/ML transparency
This release does not add a trained machine-learning model or LLM. Page checks are rule-based heuristics; predictions use the existing backend's history/transition ranking. A later ML version should train/test on opt-in sequences and report accuracy rather than claim AI without evaluation.
