---
paths:
  - "app/**/*.vue"
---

# Frontend Rules

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

### Interactive surface states

Three-tier state pattern for nav items, dropdown options, list cards, and any selectable/actionable surface:

| State | Text | Background |
|---|---|---|
| Idle | `text-toned` | (none) |
| Hover | `text-highlighted` | `bg-elevated` |
| Selected / Active | `text-primary` | `bg-primary/10` |

Single-line items (nav, dropdown option) apply the full pattern. Multi-line cards with internal text hierarchy (name + subtitle) apply only the **background** portion of the pattern — keep the text hierarchy as-is.

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

### Theming via `app.config.ts`

Nuxt UI's `tv()` (tailwind-variants) merges slot values by **type**:

- **CSS class strings** (e.g. `base: 'rounded-md font-bold'`) — tailwind-merge resolves conflicts. Override globally in `app.config.ts` freely.
- **Size / enum tokens** (e.g. `itemLeadingAvatarSize: 'lg'`, `itemLeadingChipSize: 'md'`) — values are **concatenated with a space** (`'2xs lg'`), which the child component reads as invalid and falls back to default. Global overrides silently do nothing.

For non-class tokens, override per-instance via `:ui="{ tokenName: 'value' }"` or per-item via `item.ui = { ... }`.

### Dark mode

Single-mode project. Never write `dark:` prefix. Color mode is forced to dark in `nuxt.config.ts`.

### Fonts

- Body: Inter (default, via `--font-sans`).
- Headlines, labels, code, metric numbers: JetBrains Mono (`font-mono` class).
- Never use mono for long-form body text.

### Component extraction

If the same layout class string appears in ≥3 pages, extract to a `BaseXxx` component in `app/components/`.

## `<script setup>` ordering

Vue Composition API blocks should follow this order. Don't interleave categories.

1. Imports
2. Type interfaces
3. `defineProps` / `defineEmits`
4. Data fetching (`useFetch`, `useLazyFetch`)
5. Pure helpers (functions with no reactive dependencies)
6. State (`ref`, `reactive`)
7. Computed (derived from state)
8. Watchers
9. Event handlers (`onSubmit`, `onClick`, etc.)
10. Lifecycle hooks (`onMounted`, etc.)

Refs and reactives belong together as a group BEFORE any computed, even if a particular ref is only used by a later computed — ordering wins over locality.
