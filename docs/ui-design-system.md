# Albion Guild Manager UI Design System

StyleSeed is used here as a design review framework, not as a copied theme or UI
kit. The product keeps its existing dark Albion SaaS identity and Tailwind v4
tokens from `src/app/globals.css`.

## Product Bias

- Domain: B2B/SaaS operations dashboard for Albion Online guilds.
- Density: high, but grouped. Operators should scan actions, counts, and status
  without decorative delays.
- Motion: quick and functional. Custom motion must respect
  `prefers-reduced-motion`.
- Visual identity: dark surfaces, amber product accent, restrained status tones.

## Token Rules

- Use semantic project tokens first: `bg-background`, `bg-surface`,
  `bg-surface-2`, `text-foreground`, `text-muted`, `text-subtle`,
  `border-border`, `shadow-card`.
- Use `accent` for primary actions, active state, and product emphasis.
- Use `success`, `warning`, `danger`, and `info` only for state, not decoration.
- Albion tier colors are data visualization colors only. Do not use them as
  general UI chrome.
- New shared components must not introduce a second theme vocabulary such as
  `brand`, `card`, or external skin tokens.

## Component Rules

- Prefer shared local patterns for recurring dashboard surfaces:
  `SectionCard`, `ValueDisplay`, and `EmptyState`.
- Cards use one shape language: `rounded-xl`, `border-border`, `bg-surface`,
  and `shadow-card` unless a local parent already provides the surface.
- Numeric values should have a clear hierarchy:
  label -> value -> unit/detail. Units should be smaller than the value.
- Data surfaces need a useful empty state with a next action when there is a
  reasonable action to offer.
- Status should not rely on color alone. Pair color with text and, where useful,
  an icon.

## Page Rules

### Marketing

- First viewport must answer what the product is, why it matters, and what to do
  next.
- Screenshots or demo links should show actual product state, not abstract art.
- One primary CTA should be visually dominant. Secondary actions stay neutral.

### Demo

- Demo pages should feel like a real operational snapshot.
- Put the strongest guild health or activity signal first, then drill down into
  lists and scenario tabs.
- Avoid repeatedly stacking identical cards without a visual hierarchy.

### Admin Dashboard

- Top section should answer "what needs attention now?" within a few seconds.
- Show one priority state first, then supporting KPIs, then action rows.
- Use compact typography and tabular numbers for operational counts.

## Adoption Plan

1. Add shared local UI patterns without external dependencies.
2. Apply them to low-risk public and demo surfaces.
3. Apply the same hierarchy to admin dashboard readiness cards.
4. Expand to number-heavy screens such as member detail, guild profile,
   leaderboard, battles, regear, and shop after visual verification.

## Non-goals

- Do not import StyleSeed skins or theme CSS.
- Do not add Radix/shadcn/class-variance-authority just for this rollout.
- Do not replace the existing Tailwind v4 token contract.
- Do not change database, tenant, auth, or RLS behavior as part of UI polish.
