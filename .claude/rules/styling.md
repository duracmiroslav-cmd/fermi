---
paths:
  - "app/**/*.vue"
---

# Styling Rules

Fermi uses a dark-mode-only design system. Apricot is primary; Zinc is neutral.

## Decision tree for any UI task

1. Token swap, copy tweak, or single-class fix → write directly. Follow Token Rules below.
2. New page, new non-trivial component, redesign, or open-ended visual request → invoke `frontend-design:frontend-design` skill first, then write.
3. Unclear → ask the user which path.

## When to invoke `frontend-design:frontend-design`

Invoke before writing for:
- New page or layout
- New non-trivial component
- Redesigning an existing page
- Open-ended visual requests ("make this nicer", "redo this section")

Do NOT invoke for:
- Pure token replacement (e.g., `text-gray-500` → `text-muted`)
- Single-class fixes
- Copy, prop, or logic changes

## Token Rules

### Colors

Use semantic tokens. Never use raw color classes.

- ✗ `text-gray-500`, `bg-white`, `border-gray-200`
- ✓ `text-muted`, `bg-default`, `border-default`

Text intensity (high to low):
`text-highlighted` > `text-default` (omit class) > `text-toned`

`text-toned` is the only gray shade. Do NOT use `text-muted` or `text-dimmed` — all secondary/tertiary text collapses to a single tier. Hierarchy below `text-default` is signaled by size or weight, not by additional gray shades.

Background elevation (low to high):
`bg-default` (page) → `bg-muted` (hover/selected) → `bg-elevated` (cards) → `bg-accented` (modals/popovers)

Border: `border-default` for visible separation, `border-muted` for subtle dividers.

### Brand color (primary = apricot)

- `color="primary"` — CTAs and positive brand actions (Continue, Upgrade, Submit)
- `color="neutral"` — secondary/meta actions (Cancel, Sign out, View history)
- `color="error"` — destructive actions (Delete, Reset)

### Sizing

Use Tailwind scale: `text-sm`, `text-base`, `text-2xl`, `mt-1`, `p-4`.
Never use arbitrary values: ✗ `text-[13px]`, `mt-[7px]`, `p-[15px]`.

### Components

- `<UButton>`: do not pass `color` / `variant` props unless intentionally overriding defaults.
- Use Nuxt UI components first. Build custom only when no UI component fits.

### Dark mode

Single-mode project. Never write `dark:` prefix. Color mode is forced to dark in `nuxt.config.ts`.

### Fonts

- Body: Inter (default, via `--font-sans`).
- Headlines, labels, code, metric numbers: JetBrains Mono (`font-mono` class).
- Never use mono for long-form body text.

### Component extraction

If the same layout class string appears in ≥3 pages, extract to a `BaseXxx` component in `app/components/`.
