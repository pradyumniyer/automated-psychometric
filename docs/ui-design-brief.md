> **v2 note:** The live Bolt app is the visual source of truth (`UI_FREEZE.md`). Where this brief conflicts with the app, the app wins. Use this brief only for the visual language of *new additions* and future project types.

# UI / UX Design Brief — Psychometric Prep

**Status:** Design direction for implementation (Phase 1+)  
**Goal:** A calm, professional research tool that does **not** look “vibecoded,” generic SaaS-template, or toy-like. It should feel like a blessing for people who live in spreadsheets and jamovi—not another flashy AI landing page.

This document is a first-class planning artifact (alongside system design). Implementers and design tools should follow it.

---

## 1. Product personality

| Attribute | Direction |
|-----------|-----------|
| Tone | Quiet confidence, precise, academic-adjacent |
| Metaphor | Lab bench / methods notebook—not social feed, not fintech dashboard |
| Density | Information-dense where needed (tables), airy on marketing/launch |
| Motion | Minimal; purposeful (row highlight, tab switch)—no decorative bounce |
| Trust | Privacy and “local” should be visible without screaming |

**Avoid:** purple gradients, 3D blobs, fake testimonials, stock “team high-five,” excessive glassmorphism, comic icons, “AI sparkle” on every button.

---

## 2. Structure of the experience

### Marketing / launch (public)
- Clear headline: what it does in one line  
- Privacy one-liner (local processing)  
- Primary CTA: Open app / Start free  
- Secondary: How it works (3 steps)  
- Footer: PP, ToS, contact  
- Optional light product tour entry after first open  

### App shell
- Top: project name, project type badge, nav tabs, theme toggle, account/plan later  
- Nav depends on `project_type` (Survey: Configure | Data quality | Export | Report; CV: Data | Results | Export)  
- Persistent **dataset/sheet tabs** when multiple imports—**same active sheet** across screens  
- Status strip: included/excluded counts when relevant  

### Patterns on every data screen
1. **Loading** — skeleton or explicit spinner + cancel/timeout message  
2. **Empty** — one sentence + primary action  
3. **Error** — human message + retry; never silent failure  
4. **Success** — brief confirmation, not modal spam  

---

## 3. Visual system (tokens)

### Color (semantic, not decorative)
Implement as CSS variables; support **light and dark**.

| Token | Role |
|-------|------|
| `--bg` / `--bg-elevated` | Page and cards |
| `--text` / `--text-muted` | Primary / secondary copy |
| `--border` | Hairlines, table grid |
| `--accent` | Primary actions (one accent—e.g. restrained blue or teal) |
| `--danger` | Destructive / high missingness |
| `--warning` | Excluded row highlight (**light yellow** in light mode; muted amber in dark) |
| `--success` | Completed import / export |

Accent should pass contrast on buttons (WCAG AA). Do not use accent for large backgrounds.

### Suggested default palette (can be tuned; keep semantic roles)

**Light**

| Token | Hex | Use |
|-------|-----|-----|
| bg | `#F8FAFC` | Page background |
| bg-elevated | `#FFFFFF` | Cards, panels |
| text | `#0F172A` | Primary text |
| text-muted | `#64748B` | Secondary |
| border | `#E2E8F0` | Dividers, table lines |
| accent | `#0F766E` | Primary buttons (teal) |
| accent-hover | `#0D9488` | |
| danger | `#B91C1C` | Destructive |
| warning | `#FEF08A` | Excluded row highlight background |
| warning-text | `#854D0E` | Text on warning |
| success | `#15803D` | Success states |

**Dark**

| Token | Hex | Use |
|-------|-----|-----|
| bg | `#0B1220` | Page |
| bg-elevated | `#111827` | Cards |
| text | `#F1F5F9` | Primary |
| text-muted | `#94A3B8` | Secondary |
| border | `#1F2937` | Dividers |
| accent | `#2DD4BF` | Primary actions |
| danger | `#F87171` | |
| warning | `#854D0E` | Excluded row bg (muted amber) |
| success | `#4ADE80` | |

Use these as CSS variables. Do not invent a second accent color for decoration.


### Typography
- UI: system stack or one readable sans (e.g. Inter, Source Sans)—**one family**  
- Tables: slightly smaller, tabular numbers if possible  
- Scale: clear hierarchy (page title → section → label → helper)  
- Avoid: display fonts, handwriting fonts, all-caps paragraphs  

### Spacing & radius
- Consistent 4/8px grid  
- Cards: modest radius (6–8px), not pills everywhere  
- Tables: compact but clickable row height (~36–44px)  

### Icons
- Sparse outline icons; label buttons with text where space allows  
- No icon-only critical actions without `aria-label`  

---

## 4. Component priorities

Build/reuse a small set:

- Button (primary, secondary, ghost, danger)  
- Input, Select, Checkbox, Toggle  
- Tabs (page + sheet)  
- Table (sortable later; sticky header; row selection; yellow excluded state)  
- Banner / alert (info, warning, error)  
- Modal (import preview only when needed—prefer inline)  
- EmptyState, Skeleton  
- Toast ( sparingly)  

**Design page (optional):** `/design` route listing components in light/dark for QA.

---

## 5. Screen-specific UX rules

### Configure workbench (mandatory visual pattern)
Do **not** design Configure as a full-page form without data. Always show:
- **Left/main (~60%):** LiveGrid spreadsheet
- **Right/side (~40%):** config panels
Sheet tabs above. This matches the shipped Bolt product and AS_BUILT.

## 5b. Other screen-specific UX rules

### Import
- Prefer **one clear control**: “Data starts on row” (default 2) over a maze of presets  
- Auto-detect as optional assist, not a wall of choices  
- Empty-row checkbox **disabled** when count is 0  

### Configure
- Creating a subscale **scrolls/focuses** to item assignment (not only a toast)  
- Clicking a subscale card is a valid way to add items  
- Template slot usage: “2 of 2 templates used” + upgrade hint on Free  

### Data quality
- Summary first, then flagged table  
- Click row number → jump to that row in the grid  
- Exclude all is a **toggle**  
- Short plain-language explainers for normality/outliers (no statistics lecture)  

### Reliability panel
- Table per scale: α headline, then per-item rows (α if deleted, corrected item–total r)
- Plain-language note on what α does and does not tell you; no good/poor labels

### Export
- Cards with “when to use this” one-liner  
- Disabled scored cards explain *why* (no config / not run)  
- Yellow rows when keep-with-flag  

### Caps (Free)
- On exceeding 500 rows or 2 projects: clear modal/banner—what the limit is, what Pro unlocks—not a cryptic crash  

---

## 6. Accessibility

- Visible focus rings  
- Labels on all inputs  
- Keyboard path through primary flows  
- Do not rely on color alone for excluded vs included (icon or text + yellow)  
- Target contrast AA for text and controls  

---

## 7. Launch page content outline

1. Hero: problem → solution → CTA  
2. “Works on your machine” privacy strip  
3. Three steps: Import → Check quality → Export  
4. Who it’s for (researchers, students, methods courses)  
5. What’s free vs Pro (honest, short)  
6. Footer legal  

No fake metrics (“10,000 teams”). Real or omit.

---

## 8. References for “feel” (not to clone)

Think: **Linear’s calm density** meets **a methods lab tool**—not Notion marketing, not Stripe atlas, not random GPT demo UI.

---

## 9. Implementation note

If using a component library (e.g. shadcn/Radix), **theme it** to these tokens. Default shadcn look without token discipline still reads as generic.

Wireframe fidelity: this brief + `APP_FLOW.md` is enough for Phase 1; high-fidelity Figma is optional, not a blocker if acceptance criteria and this brief are met.
