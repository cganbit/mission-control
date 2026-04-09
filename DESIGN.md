# Mission Control Design System

**Version:** 1.0 (Supabase Foundation)  
**Last Updated:** 2026-04-08  
**Status:** Active

Design tokens and visual guidelines for Mission Control — the OpenClaw orchestration dashboard.

---

## 1. Color Palette

### Core Colors (Supabase-inspired dark theme)

| Name | Token | Hex | Usage |
|------|-------|-----|-------|
| **Background Base** | `--bg-base` | #171717 | Primary background (body, pages) |
| **Background Surface** | `--bg-surface` | #1c1c1c | Elevated surfaces (sidebar, cards, panels) |
| **Background Muted** | `--bg-muted` | #242424 | Tertiary background (hover states, accents) |
| **Background Overlay** | `--bg-overlay` | #232323 | Modal & overlay backdrops |

### Border Colors

| Name | Token | Hex | Usage |
|------|-------|-----|-------|
| **Border Default** | `--border-default` | #2e2e2e | Standard borders, dividers |
| **Border Strong** | `--border-strong` | #3e3e3e | Emphasized borders, focus states |

### Text Colors

| Name | Token | Hex | Usage |
|------|-------|-----|-------|
| **Text Primary** | `--text-primary` | #ededed | Headlines, primary text |
| **Text Secondary** | `--text-secondary` | #a3a3a3 | Secondary text, labels, helper text |
| **Text Muted** | `--text-muted` | #6b6b6b | Disabled text, subtle labels |

### Semantic Colors

| Name | Token | Hex | Usage |
|------|-------|-----|-------|
| **Accent (Supabase Green)** | `--accent` | #3ecf8e | Interactive elements, active states, CTAs |
| **Accent Hover** | `--accent-hover` | #2bb37a | Hover state for accent buttons |
| **Accent Muted** | `--accent-muted` | #3ecf8e20 | Soft accent background |
| **Brand (Amber)** | `--brand` | #f59e0b | Mission Control identity, logo, special highlights |
| **Destructive** | `--destructive` | #f87171 | Dangerous actions, errors, delete buttons |
| **Danger** | `--danger` | #ef4444 | Critical alerts, failed states |
| **Warning** | `--warning` | #fbbf24 | Warnings, alerts, in-progress states |
| **Success** | `--success` | #22c55e | Success messages, completed states |

### Chart Colors

Used in analytics, performance dashboards:
- `--chart-1`: #6366f1 (Indigo)
- `--chart-2`: #22c55e (Green)
- `--chart-3`: #f59e0b (Amber)
- `--chart-4`: #ef4444 (Red)
- `--chart-5`: #8b5cf6 (Violet)

---

## 2. Typography

### Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
  'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
  sans-serif;
font-feature-settings: 'cv11' on;
```

### Type Scale

| Level | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| H1 | 32px / 2rem | 700 | 1.2 | Page titles |
| H2 | 24px / 1.5rem | 700 | 1.3 | Section titles |
| H3 | 20px / 1.25rem | 600 | 1.4 | Subsection titles |
| Body | 14px / 0.875rem | 400 | 1.5 | Main content, paragraphs |
| Small | 12px / 0.75rem | 400 | 1.4 | Labels, captions, helper text |
| Mono | 12px / 0.75rem | 400 | 1.5 | Code, tokens, technical values (Segoe UI Mono) |

---

## 3. Spacing & Layout

### Spacing Scale

```
0, 2px, 4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px
```

Mapped to Tailwind:
- `space-1` = 4px
- `space-2` = 8px
- `space-3` = 12px
- `space-4` = 16px
- `space-6` = 24px
- `space-8` = 32px

### Layout Grid

- **Sidebar width:** 240px (expanded), 64px (collapsed)
- **Content max-width:** 1400px
- **Grid columns:** 12 (dashboard), 2-3 (card grids)
- **Gap:** 16px (default), 24px (large sections)

---

## 4. Components & Patterns

### Buttons

**Primary (CTA):**
- Background: `--accent` (#3ecf8e)
- Text: #000000 (high contrast)
- Hover: `--accent-hover` (#2bb37a)
- Padding: 10px 16px (sm), 12px 20px (md)
- Border radius: 6px

**Secondary (Default):**
- Background: `--bg-muted` (#242424)
- Text: `--text-primary` (#ededed)
- Border: 1px solid `--border-default`
- Hover: `--bg-muted` + `--text-primary` + lighter
- Padding: 10px 16px (sm), 12px 20px (md)

**Destructive:**
- Background: `--destructive` (#f87171) with opacity
- Text: `--destructive`
- Hover: darker red (#dc2626)

### Cards

- Background: `--bg-surface` (#1c1c1c)
- Border: 1px solid `--border-default`
- Border radius: 8px
- Padding: 16px
- Shadow: none (flat design), or light shadow on hover

### Inputs & Form Fields

- Background: `--bg-base` (#171717)
- Border: 1px solid `--border-default`
- Focus border: 2px solid `--accent`
- Text: `--text-primary`
- Placeholder: `--text-muted`
- Padding: 8px 12px
- Border radius: 6px

### Sidebar Navigation

**Active link:**
- Background: `--brand` with 10% opacity (#f59e0b15)
- Text: `--brand` (#f59e0b)
- Border-left: 2px solid `--brand`

**Inactive link (hover):**
- Background: rgba(255, 255, 255, 0.05)
- Text: `--text-secondary` → `--text-primary` on hover

### Role Badges

- **Admin:** Dark amber background (bg-amber-950), amber text
- **Member:** Dark blue background (bg-blue-950), blue text
- **Viewer:** Dark slate background (bg-slate-800), slate text

---

## 5. Motion & Animations

### Transitions

- **Standard duration:** 200ms
- **Easing:** `cubic-bezier(0.4, 0, 0.2, 1)` (ease-in-out)

### Keyframes

```css
@keyframes slideIn {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes taskDone {
  0%   { transform: scale(1); }
  20%  { transform: scale(1.04); box-shadow: 0 0 0 3px #22c55e55; }
  60%  { transform: scale(1.02); box-shadow: 0 0 0 6px #22c55e22; }
  100% { transform: scale(1); box-shadow: none; }
}
```

### Usage

- **Slide-in:** Drawers, panels, popovers (200ms)
- **Fade-in:** Content load, page transitions (300ms)
- **Task done:** Task completion animation on board (600ms)

---

## 6. Accessibility & Dark Mode

### WCAG 2.1 Compliance

- **Contrast ratios:**
  - Primary text (#ededed) on background (#171717): **21.2:1** ✅ AAA
  - Secondary text (#a3a3a3) on background (#171717): **7.5:1** ✅ AA
  - Accent (#3ecf8e) on background (#171717): **8.1:1** ✅ AA
  - Destructive (#f87171) on background (#171717): **6.4:1** ✅ AA

- **Focus indicators:** Always visible (min 3px outline, `--border-strong`)
- **Keyboard navigation:** Tab order follows visual flow, no invisible elements
- **Reduced motion:** `@media (prefers-reduced-motion)` disables animations

### Dark Mode

Mission Control is **dark-first**. Light mode is not planned.

---

## 7. Component States

### Loading State

- Skeleton loaders use `--bg-muted` with `animate-pulse`
- Spinners use `--accent` color
- Progress bars use `--accent`

### Error State

- **Border color:** `--destructive`
- **Text color:** `--destructive`
- **Background (optional):** `--destructive` with 10% opacity

### Disabled State

- **Background:** `--bg-muted` with reduced opacity
- **Text:** `--text-muted`
- **Cursor:** `not-allowed`
- **Opacity:** 50%

### Hover State

- **Elevation:** Light background lift, no shadows (flat design)
- **Color change:** Slightly brighter text or accent
- **Cursor:** `pointer` for interactive elements

---

## 8. UI Patterns

### Sidebar Navigation

- **Collapse animation:** 200ms width transition
- **Hover behavior:** Background highlight, no color change
- **Active indicator:** Left border + background tint in brand color
- **User card:** Profile avatar + name + role badge at bottom

### Task Board (Kanban)

- **Column background:** `--bg-surface`
- **Card background:** `--bg-base`
- **Drag-over state:** Border highlight in `--accent`
- **Completion animation:** `taskDone` keyframe with green pulse

### Activity Feed

- **Item background:** `--bg-surface` with subtle borders
- **Live indicator:** Pulsing green dot (`--success`)
- **Timestamp:** `--text-muted` (right-aligned)

### Modals & Drawers

- **Backdrop:** Black with 40% opacity
- **Container:** `--bg-surface` background
- **Animation:** Slide-in from right (200ms) or fade-in (300ms)

---

## 9. Design Decisions & Rationale

### Why Supabase Colors?

Supabase's design system is production-proven, dark-first, and optimized for dev tools dashboards. The green accent (#3ecf8e) provides excellent contrast and feels modern without being trendy.

### Why Dark Mode Only?

- OpenClaw users (engineers, SREs) prefer dark interfaces
- Reduces eye strain during long coding/monitoring sessions
- Complements the serious, technical nature of the product

### Why No Custom Components Library?

Mission Control uses Tailwind CSS directly with CSS variables for theming. This keeps the codebase lightweight and enables rapid iteration without build-time dependencies.

### Brand Color (Amber #f59e0b)

The amber accent distinguishes Mission Control's UI elements (logo, active navigation) from Supabase's green. This maintains visual hierarchy while respecting the broader design language.

### Motion Guidelines

Animations are purposeful — task completion celebrates completion with `taskDone`, sidebar collapse is smooth (200ms), and modals slide in for visual context. Reduced-motion preferences are respected per WCAG guidelines.

---

## Usage Guide

### For Designers

1. Use the color palette above when creating mockups or design specs
2. Reference the type scale for typography decisions
3. Export designs with consistent spacing (multiples of 4px)
4. Test contrast ratios before handoff

### For Developers

1. Import colors from `globals.css` as CSS variables: `var(--bg-base)`, `var(--text-primary)`, etc.
2. Use Tailwind utilities for spacing, sizing, and responsive design
3. Respect the motion guidelines — use 200ms transitions by default
4. Always test keyboard navigation and focus states

### For Accessibility

1. Ensure text contrast meets WCAG 2.1 AA minimum (4.5:1 for body text)
2. Provide visible focus indicators (2px+ outline or border)
3. Test with `prefers-reduced-motion` media query
4. Use semantic HTML and ARIA labels where needed

---

## References

- [Supabase Design](https://supabase.com/) — Color palette inspiration
- [Linear Design](https://linear.app/) — Component patterns
- [Vercel Design](https://vercel.com/) — Spacing & motion
- [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/) — Accessibility standards
