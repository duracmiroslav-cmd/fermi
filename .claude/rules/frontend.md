---
paths:
  - "app/**/*.vue"
---

# Frontend Rules

Fermi uses a dark-mode-only design system. Apricot is primary; Zinc is neutral.

## When to invoke `frontend-design:frontend-design`

Invoke before writing for new pages, new non-trivial components, redesigns, or open-ended visual requests ("make this nicer"). For pure token swaps, single-class fixes, or copy/prop/logic changes, write directly. Ask the user when unclear.

## Token Rules

### Colors

Use semantic tokens. Never use raw color classes.

- ✗ `text-gray-500`, `bg-white`, `border-gray-200`
- ✓ `text-muted`, `bg-default`, `border-default`

Text intensity (high to low):
`text-highlighted` > `text-default` (omit class) > `text-toned` > `text-muted`

`text-muted` is **not** "softer toned" — it is a distinct semantic tier reserved for **absence**: empty-state characters (`—`), placeholder hints in inputs, disabled-look indicators. Reach for it only when the text represents "there is nothing here," not "this text is less important." General secondary copy (descriptions, metadata, helper text) stays on `text-toned`. Do not introduce additional shades like `text-dimmed` or opacity-tuned grays (`text-toned/60`); for hierarchy below `text-toned`, use size or weight, not new gray tiers.

Background elevation (dark mode):
`bg-default` (page) → `bg-muted/50` (card / list resting surface) → `bg-muted` (area hover) → `bg-accented` (modals / popovers)

Dark mode collapses `bg-muted` and `bg-elevated` to the same value, and `bg-accented` is the only token strictly brighter than `bg-muted`. Stay on `bg-muted/*` for surfaces; reach for `bg-accented` only when you really need a tier of pop (modal, popover, an accented chip).

Outlines split by purpose:

- **Card outline** (self-contained surface, paired with `bg-muted/50` + `rounded-md`): `ring ring-inset ring-muted`. Matches Nuxt UI's component convention (Empty, Alert, Popover, etc. all use `ring`). Ring is box-shadow inside the box (`ring-inset`), so it aligns horizontally with `<UInput>` and other form controls that sit in the same column, and hover/focus state changes don't shift layout.
- **Structural divider** (separating layout regions, e.g. sidebar/header/footer edges): `border-{side} border-default`. Borders carry semantic "this side is the edge"; ring would draw a full box.

Avoid `border border-muted` for cards — it works but is out of sync with the Nuxt UI components rendered next to it.

### Interactive surface states

Two hover idioms, picked by primitive:

- **Object surface** (standalone card with its own outline) — ring on hover. Use `<UCard variant="interactive">`.
- **Area surface** (row inside a shared container) — bg on hover. Use `hover:bg-muted` on the row.

Three-tier state pattern for area surfaces (nav items, dropdown options, list rows):

| State | Text | Background |
|---|---|---|
| Idle | `text-toned` | (none) |
| Hover | `text-highlighted` | `bg-muted` |
| Selected / Active | `text-primary` | `bg-primary/10` |

Single-line items (nav, dropdown option) apply the full pattern. Multi-line rows with internal text hierarchy (name + subtitle) apply only the **background** portion — keep the text hierarchy as-is.

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

### Cards

Use `<UCard>` directly. Two variants, both `bg-muted/50 rounded-md ring ring-inset ring-muted divide-y divide-muted`:

- `static` (default) — info panel, no hover.
- `interactive` — same plus `hover:ring-primary transition-shadow`. Opt in (`<UCard variant="interactive">`) when the card is navigable.

For navigable cards, also wrap with `<NuxtLink class="block">`. For conditional navigation (linkable vs static in a list), resolve via `resolveComponent('NuxtLink')` in script and use `<component :is="isLinkable ? NuxtLink : 'div'">`.

For multiple rows that should read as one grouping (rather than separate cards), use a list container: `rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden`, with each row a `flex items-center gap-4 p-4 hover:bg-muted transition-colors` (drop the hover on non-linkable rows).

## Skeletons

Skeletons mirror the real component's **structure**, not just its silhouette. The goal is zero layout shift when content loads — same outer shape, same inner positions.

### Line-box pattern

Text has two heights: **font size** (the ink) and **line-height** (the box the line occupies). Skeleton bars represent the ink; wrap each bar in a div sized to the line-height:

```vue
<!-- Mimics <p class="text-base font-medium"> -->
<div class="h-6 flex items-center">
  <USkeleton class="h-3.5 w-40" />
</div>

<!-- Mimics <p class="text-sm"> -->
<div class="h-5 flex items-center">
  <USkeleton class="h-3 w-24 bg-muted/70" />
</div>
```

Line-box reference (Tailwind default line-heights):

| Text class | Line-height | Line box | Bar inside (≈60%) |
|---|---|---|---|
| `text-base` | 24px | `h-6` | `h-3.5` |
| `text-sm` | 20px | `h-5` | `h-3` |
| `text-xs` | 16px | `h-4` | `h-2.5` |

Stacked bars (e.g. title + subtitle) get line-box totals equal to the real content's intrinsic height, so swap has no vertical jump.

### Mirror the real container

Use the real component's classes for outer shape and padding, so horizontal positions don't shift either:

| Real element | Skeleton equivalent |
|---|---|
| `<UCard>` outer | `rounded-md ring ring-inset ring-muted bg-muted/50 divide-y divide-muted` |
| `<UCard>` header padding | `p-4 sm:px-6` |
| `<UCard>` body padding | `p-4 sm:p-6` |
| List container | `rounded-md border border-muted bg-muted/50 divide-y divide-default` |
| List row | `flex items-center gap-4 p-4` |
| `<UAvatar size="lg">` | `<USkeleton class="size-9 rounded-full" />` |
| `<UInput>` md | `<USkeleton class="h-9 rounded-md bg-muted/40" />` |
| `<UButton>` md | `<USkeleton class="h-9 w-X rounded-md bg-muted/60" />` |

### Deterministic widths for variety

Vary bar widths via cycled tokens (`['w-40', 'w-32', 'w-48']` indexed by row number), not `Math.random`. Random widths break SSR/CSR hydration.

### Biasing across uncertain final states

When the loaded content can render at different sizes (connected vs disconnected card, has-data vs empty), bias the skeleton toward the **larger** state. Shrinking on load reads better than growing.

### Existing patterns

- `app/components/DashboardListSkeleton.vue` — list row with avatar + 2-line text + trailing meta

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

Group all refs/reactives before any computed — ordering wins over locality.

## Booleans and event handlers

- `is<Subject?><State>` for booleans. Add the subject only to disambiguate when multiple states coexist in scope (`isModelPickerOpening`, not `isOpening`).
- `on<Verb>` for event handlers. Prepend a subject only to disambiguate against another handler in the same scope (`onLineSubmit` alongside `onSubmit`).
