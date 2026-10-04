# SubFaber — Apple Human Interface Guidelines Audit Report

**Date:** 2026-10-04
**Scope:** Configure page (`public/css/*.css`, `public/partials/*.html`, `public/js/*`)
**Lens:** Apple HIG core themes — Aesthetic Integrity, Consistency, Direct Manipulation, Feedback, User Control, Clarity, Deference, Depth, Accessibility
**Constraint honored:** Presentation-only audit. Every JS hook (`id`, `class`, `data-*`) is preserved. SubFaber keeps its flat Shadcn/Linear identity; Apple HIG is applied as a *quality gate*, not a reskin.

---

## 1. Executive Summary

SubFaber's redesign is already **~60–65% aligned** with Apple HIG principles. The foundation is genuinely strong:

| Strength | Evidence |
|---|---|
| Vibrancy / material | Sticky navbar uses `backdrop-filter: saturate(180%) blur(12px)` — the exact macOS toolbar recipe (`subfaber-theme.css:166`) |
| Deference | Flat calm canvas; decorative glow wash killed via `body::before { display: none }` (`subfaber-theme.css:138`) |
| Semantic theming | Proper light/dark token sets + `color-scheme` so native controls adapt (`subfaber-theme.css:66`) |
| Typography stack | `'Inter', 'Segoe UI Variable Text', -apple-system…` resolves to SF on Apple devices (`subfaber-theme.css:123`) |
| Reduced-motion coverage | `prefers-reduced-motion` blocks present in **all 5 style layers** (`rootify`, `configure`, `app-shell`, `subfaber-theme`, `quick-setup`) |
| ARIA hygiene | Modals use `role="dialog"` + `aria-modal="true"` + `aria-labelledby`; controls carry `aria-label` / `aria-expanded` |

The remaining gap is a set of **concrete, low-risk refinements** clustered in five areas: **hit targets, affordance, contrast, motion curves, and icon consistency**. None requires structural change; all are CSS/HTML-surface tweaks.

---

## 2. Findings — Ranked by Severity

> **Severity model:**
> 🔴 **P0** — breaks HIG accessibility contract / real user harm
> 🟠 **P1** — clear HIG violation, visible polish gap
> 🟡 **P2** — refinement; elevates fit & finish
> ⚪ **P3** — nice-to-have alignment

---

### 🔴 P0 — Accessibility contract violations

| # | Finding | Evidence | HIG / WCAG Principle | Fix |
|---|---------|----------|----------------------|-----|
| P0-1 | **Nested nav hit targets below 44pt.** Sidebar children at `min-height: 34px` (`app-shell.css:205`) and grandchildren at `min-height: 30px` (`app-shell.css:227`). | Apple pointer guidance: **44×44pt** minimum. WCAG 2.5.5 AAA concurs. | Consistency / Accessibility | Raise nested nav `min-height` to 44px (or add 5px vertical padding). |
| P0-2 | **Bottom-nav hit area compressed.** Mobile bottom nav items use `padding: 10px 4px` (`app-shell.css:554`), yielding ≈ 38px tall tap zone on a 56px bar. | Apple tab-bar minimum target 44pt; iOS HIG explicitly warns against shrinking tab targets. | Accessibility | Increase vertical padding to ≥12px or set `min-height: 48px` per item. |
| P0-3 | **Focus outline globally suppressed on inputs.** `input:focus, select:focus, textarea:focus { outline: none !important }` appears in **three layers**: `configure.css:2421`, `subfaber-theme.css:617`, and Quick Setup. The violet `box-shadow` glow replaces it, but glow is **not** a WCAG-recognized focus indicator for keyboard-only users with low vision (low contrast vs. background). | HIG Accessibility: "Always provide a visible focus indicator." WCAG 2.4.7 Focus Visible (AA). | Accessibility | Keep the glow *and* restore a `2px solid var(--primary)` outline on `:focus-visible` (mouse users still get the clean glow). |

---

### 🟠 P1 — Clear HIG violations / visible polish gaps

| # | Finding | Evidence | HIG Principle | Fix |
|---|---------|----------|---------------|-----|
| P1-1 | **Collapse affordance is a raw text glyph.** The `▼/▲` section toggles are `::before { content: '▼' }` / `content: '▲'` (`configure.css:2228-2233`). | HIG Icons: glyphs must be "simple, recognizable, drawn on a consistent grid." A Unicode triangle is not a control; it has no hover, no rotation animation, no 44pt hit area, and renders inconsistently across platforms/fonts. | Consistency / Feedback | Replace with an inline SVG chevron (12px), `transition: transform .18s ease`, rotate 180° on expand, and bump `.collapse-btn` from `32×32px` (`configure.css:2204`) to `40×40px`. |
| P1-2 | **Sidebar group labels at 10px.** `.app-nav-label { font-size: 10px }` (`app-shell.css:109`). | Apple type ramp bottoms out at 11pt (Caption 2). 10px uppercase + 0.06em tracking is borderline illegible, especially at 125% OS scaling. | Clarity / Legibility | Raise to 11px minimum; 12px preferred. |
| P1-3 | **Hairline border contrast ≈ 1.1:1.** `--border: #f1f5f9` on white surface (`subfaber-theme.css:56`). | HIG Clarity: subtle is fine, but structure must remain *perceivable*. 1.1:1 fails WCAG 1.4.11 non-text contrast (3:1 required for UI components). | Clarity | Darken light-theme `--border` to `#e2e8f0` (≈1.4:1) and rely on `--border-strong` for interactive elements. |
| P1-4 | **Toggle switches lack state semantics.** `.toggle-slider` off-state is `var(--border-strong)` (flat gray) with no inner shadow or unchecked icon; on-state is flat violet (`subfaber-theme.css:659-666`). | HIG Switches: "Use switches to toggle a state on or off; the on position must be clearly indicated with a system color." Apple switches use a green on-color and a subtle inner shadow for depth. | Feedback / Depth | Add `box-shadow: inset 0 0 0 2px rgba(0,0,0,0.06)` off-state; keep violet on-state (brand) but add a white thumb shadow for lift. Consider `--success` green for destructive-avoidance clarity. |
| P1-5 | **Mixed icon languages.** Emoji (⚡ 💾 🚀 📋 ⭐ ✓ ✗) coexist with monoline SVGs and text triangles (`main.html:1952-1961, 2134-2144, 4279-4288`). | HIG Icons: "Use one icon style consistently throughout your app." | Consistency | Migrate quick-action chips + primary buttons to a single monoline SVG set (e.g., Lucide/Feather, 18px, 2px stroke) to match existing card icons. |

---

### 🟡 P2 — Refinement / fit & finish

| # | Finding | Evidence | HIG Principle | Fix |
|---|---------|----------|---------------|-----|
| P2-1 | **Motion curves are all `ease`.** Every transition is `0.15s ease` or `0.2s ease` (`app-shell.css:127`, `subfaber-theme.css:673`). | Apple motion favors **ease-out / spring** (fast attack, gentle settle) for UI that responds to direct manipulation. `ease` (slow start) feels sluggish by comparison. | Feedback / Direct Manipulation | Swap hover/press transitions to `cubic-bezier(0.16, 1, 0.3, 1)` (the existing badge `scaleIn` curve at `configure.css:2199` is already perfect — reuse it). |
| P2-2 | **No `prefers-contrast` support.** Tokens are fixed; no `@media (prefers-contrast: more)` override exists. | HIG Accessibility: support Increase Contrast. | Accessibility | Add a small media query bumping `--border` and `--text-secondary` when `prefers-contrast: more`. |
| P2-3 | **Primary button hover is a flat color swap.** `.btn-primary:hover { background: var(--primary-dark) }` with `transform: none !important` (`subfaber-theme.css:685-689`). | HIG Feedback: direct-manipulation controls should give a *physical* cue (subtle lift or press-down). Flat color-only hover is neutral; a 1px `translateY(-1px)` + shadow reads as more tactile. | Feedback / Depth | Re-introduce `transform: translateY(-1px)` on hover, `translateY(0)` on active, with `box-shadow: 0 2px 8px var(--glow)`. |
| P2-4 | **Quick Setup banner lacks pressed state.** `role="button" tabindex="0"` (`main.html:100-103`) but only `:hover` is styled; no `:active` depression. | HIG Direct Manipulation: "Respond to touch immediately with visual feedback." | Feedback | Add `:active { transform: scale(0.98) }`. |
| P2-5 | **Card icon hover is a bounce.** `.section-icon:hover { transform: translateY(-2px) scale(1.02) }` (`configure.css:1895`). Decorative icons shouldn't demand attention. | HIG Deference: ornamentation must not compete with content. | Deference | Remove hover transform on `.section-icon` (non-interactive); keep it only on actual controls. |

---

### ⚪ P3 — Nice-to-have alignment

| # | Finding | Evidence | HIG Principle | Fix |
|---|---------|----------|---------------|-----|
| P3-1 | **Modal close uses `&times;` text.** `&times;` inside a `div[role="button"]` (`overlays.html:234`). | HIG Icons: use SF Symbols-style glyphs. | Consistency | Swap to inline SVG ×. |
| P3-2 | **No `prefers-reduced-transparency` fallback.** Backdrop blur always on; some users disable transparency. | HIG Accessibility: honor Reduce Transparency. | Accessibility | `@media (prefers-reduced-transparency: reduce) { .app-navbar { backdrop-filter: none; background: var(--surface) } }` |
| P3-3 | **Footer uses `&#10084;&#65039;` emoji heart.** (`footer.html:4`) | HIG Icons: single style. | Consistency | Optional: swap to SVG heart in brand violet. |
| P3-4 | **Missing `aria-live` region for Save success.** Install URL box appears via `hidden` toggle (`main.html:4295`); screen readers get no announcement. | HIG Accessibility: dynamic state changes must be announced. | Accessibility | Add `aria-live="polite"` to the install-url-box or a dedicated status region. |

---

## 3. Prioritized Fix Plan (Quick Wins First)

| Phase | Items | Effort | Risk | Impact |
|-------|-------|--------|------|--------|
| **Phase 1 — Accessibility contract** | P0-1, P0-2, P0-3 | 1–2 h | Low | High |
| **Phase 2 — Affordance & consistency** | P1-1, P1-2, P1-3, P1-4, P1-5 | 3–4 h | Low | High |
| **Phase 3 — Motion & tactility** | P2-1, P2-2, P2-3, P2-4, P2-5 | 2 h | Low | Medium |
| **Phase 4 — Polish** | P3-1, P3-2, P3-3, P3-4 | 1 h | Very low | Low |

**Total estimated effort:** ~1 working day.
**Total risk:** Minimal — all changes are presentation-layer; every JS hook (`id`, `class`, `data-*`) remains untouched per the redesign contract (`app-shell.css:12-16`, `subfaber-theme.css:11-12`).

---

## 4. What NOT to change (preserve SubFaber identity)

| Element | Verdict |
|---|---|
| Flat Shadcn/Linear surface language | ✅ Keep — HIG's "Deference" endorses flat, content-first design |
| Violet `#7c3aed` accent | ✅ Keep — brand token already works in light + dark |
| `Inter` / `-apple-system` font stack | ✅ Keep — resolves to SF on Apple devices automatically |
| Sidebar + bottom-nav shell | ✅ Keep — matches Apple's split-view / tab-bar mental models |
| `backdrop-filter` navbar | ✅ Keep — textbook macOS vibrancy |
| `prefers-reduced-motion` coverage | ✅ Keep — already exemplary across all 5 layers |

**Bottom line:** SubFaber does **not** need an Apple costume. It needs ~20 surgical refinements to satisfy the same quality bar Apple applies to its own apps. The result will feel *more premium* without losing its own face.
