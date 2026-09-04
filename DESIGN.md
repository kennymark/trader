---
name: Trader — Statement of Account
description: Statutory paper for a private portfolio; black ink on white, ruled not boxed, colour reserved for money.
colors:
  ink: "#0b0c0c"
  paper: "#ffffff"
  wash: "#f3f2f1"
  keyline: "#b1b4b6"
  reference: "#505a5f"
  focus-yellow: "#ffdd00"
  statutory-green: "#00703c"
  statutory-red: "#d4351c"
  brass: "#b58840"
  green-field: "#cce2d8"
  green-field-ink: "#005a30"
  red-field: "#f6d7d2"
  red-field-ink: "#942514"
typography:
  display:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "clamp(1.9rem, 8vw, 4rem)"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "tnum 1"
  headline:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "clamp(2.1rem, 4vw, 3.1rem)"
    fontWeight: 900
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  none: "0px"
spacing:
  hair: "0.35rem"
  xs: "0.5rem"
  sm: "0.7rem"
  md: "1.1rem"
  lg: "1.35rem"
  xl: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0.4rem 0.8rem"
  button-primary-hover:
    backgroundColor: "#22282a"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.4rem 0.8rem"
  button-secondary-hover:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
  button-focus:
    backgroundColor: "{colors.focus-yellow}"
    textColor: "{colors.ink}"
  input-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.45rem 0.6rem"
  filter-chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.4rem 0.8rem"
  filter-chip-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  account-line:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "0.5rem 0"
  table-header-cell:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    padding: "0.45rem 0.5rem"
  status-open:
    backgroundColor: "{colors.green-field}"
    textColor: "{colors.green-field-ink}"
    rounded: "{rounded.none}"
    padding: "0.1rem 0.4rem"
  status-closed:
    backgroundColor: "{colors.red-field}"
    textColor: "{colors.red-field-ink}"
    rounded: "{rounded.none}"
    padding: "0.1rem 0.4rem"
---

# Design System: Trader — Statement of Account

<!-- Form: The Statement of Account. Seed key 140791f1 (candidate 5 of 7 by resonance). -->

## Overview

**Creative North Star: "The Statement of Account"**

This is a statement, not a terminal. The category ships dark, dense, multi-pane grids that make an amateur investor feel they are flying an aircraft; this world refuses all of it. It is black ink (#0b0c0c) on white paper, read at a desk under lamplight, in the register of a statutory annual statement — the lineage is the GOV.UK Design System and an HMRC self-assessment, not a broker dashboard. The user opens their own statement, reads what they actually did, and is shown what a sale cost them without being sold anything.

Nothing is enclosed. A box claims its contents are separate, and on a statement nothing is separate: every figure belongs to the same account. The system therefore has no cards, no panels, no wells, and no radius at all (`--radius: 0px`). Hierarchy is carried by three things only — horizontal rules of graded weight (1px hairline, 2px, 4px, 6px), type weight (400 body against 900 display), and white space. The masthead is a 6px black rule over a 900-weight heading; the net result sits alone as the largest figure on the sheet, held between a 4px rule above and a 2px rule below. Positions follow as a plain ruled table.

Colour is lawful, not decorative. Green and red appear on money and nowhere else; yellow appears only as the keyboard focus field. There is no brand accent hue: interaction is signalled by value — black bars, inked-in states, washes — never by tint. The world's stated risk is that it reads bureaucratic and cold if the type is set timidly, so the scale is deliberately confident: the masthead and the balance are set at weight 900 with tight tracking, and the sheet is generous with margin.

**Key Characteristics:**
- Black ink on white paper; no dark mode, no tinted surfaces
- No enclosure anywhere: no cards, no boxes, no radius, no shadow
- Structure carried by ruled lines of graded weight and by type weight
- One typeface (Public Sans) at every size, including numerals
- Colour restricted by law to money (green/red) and focus (yellow)
- Tabular figures, right-flushed, on every account line and table column

## Colors

A statutory monochrome sheet with three licensed colours, each admitted for a single job.

### Primary
- **Statement Ink** (`{colors.ink}`): The one structural colour. Every rule, keyline, heading, body word, table border, control border, and inked-in active state. It is also the primary action's fill — the black bar at top right — because in this world the primary action is a mass of ink, not a coloured button.

### Secondary
- **Focus Yellow** (`{colors.focus-yellow}`): Keyboard focus only, and text selection. It appears as a solid field behind the focused element with a 4px black bar beneath it. It is never a highlight, a badge, a hover state, or a decorative accent.

### Tertiary
- **Statutory Green** (`{colors.statutory-green}`): A positive money figure — a gain, a profit total, a rising P&L line, a positive bar in a chart.
- **Statutory Red** (`{colors.statutory-red}`): A negative money figure — a loss, a cost, a falling line, a negative bar. It doubles as the error/danger ink because a failure in this world is also an account against you.
- **Brass** (`{colors.brass}`): A licensed *series* colour, scoped to the never-sold replay chart and its counterfactual card. The replay compares value paths and needs three distinguishable series; green and red are unavailable under The Money-Only Rule because a path is neither a gain nor a loss. Brass marks the path not taken — the holding the user sold — and is the one thing that panel exists to show. It appears as the gold line, its legend swatch, and the top rule of the counterfactual card, and nowhere else.
- **Green Field / Green Field Ink** and **Red Field / Red Field Ink** (`{colors.green-field}` on `{colors.green-field-ink}`; `{colors.red-field}` on `{colors.red-field-ink}`): The only tinted fields in the system, used for the square status marks that classify a row as open/buy or closed/sell. Muted enough to sit under the ink, dark enough on text to clear contrast.

### Neutral
- **Paper** (`{colors.paper}`): Every background in the system. There is no second surface tone; panes, drawers, and the login sheet are all the same paper.
- **Wash** (`{colors.wash}`): The only surface variation — a flat grey used as a hover and selection wash on rows, tables, and secondary buttons. It is a mark on the paper, not a raised layer.
- **Keyline** (`{colors.keyline}`): The 1px hairline rule and the dotted leader between label and figure. Sub-structure inside a section that a 2px ink rule has already opened.
- **Reference Grey** (`{colors.reference}`): Secondary type — captions, chart axes, unit notes, sidebar links at rest, and the statement's own reference marks (row counts, import timestamps).

### Named Rules
**The Money-Only Rule.** Green and red touch a figure only when that figure is money the user made or lost. A count, a date, a percentage of holdings, a symbol, a status word: never coloured. If you cannot say "this is a gain" or "this is a loss", it is ink.

**The Inked-In Rule.** A selected filter, an active nav item, a chosen tab is inked in — solid `{colors.ink}` field, paper-coloured text — never tinted, never given a coloured border. Selection is a change in value, not in hue.

**The No-Accent Rule.** This system has no brand accent colour. `--accent` resolves to the ink. Any proposal for a chrome hue is out of world.

**The Series-Only Rule.** Brass is a data series colour, not an accent. It is licensed inside the replay chart — its line, its legend swatch, and the top rule of the card that states the same path — and it may never leak into chrome: no brass button, border, link, icon, badge, nav mark, or heading. If a colour is not encoding a plotted series or money, it is ink or reference grey.

## Typography

**Display Font:** Public Sans (with system-ui, sans-serif)
**Body Font:** Public Sans (with system-ui, sans-serif)
**Label/Mono Font:** Public Sans — `--mono` is deliberately aliased to the sans. There is no monospaced face in this system.

**Character:** One neutral, civic grotesque doing every job, loaded at 400/500/600/700/900. Its personality comes from range rather than variety: body copy sits at 400 while the masthead and the balance are struck at 900 with tight negative tracking, so the sheet reads calm everywhere except where the account speaks.

### Hierarchy
- **Display** (900, `clamp(1.9rem, 8vw, 4rem)`, line-height 1, tracking −0.03em): The balance. The net result and any single figure that is the answer to the page. One per sheet.
- **Headline** (900, `clamp(2.1rem, 4vw, 3.1rem)`, line-height 1.02, tracking −0.03em): The page masthead ("Statement of account"), always directly under the 6px rule.
- **Title** (700, 1.4rem): A secondary figure on a ruled line — the win rate, a section's own total.
- **Body** (400, 1rem, line-height 1.5): Statement prose, the standfirst under the masthead, note text.
- **Label** (600, 0.72–0.78rem, in reference grey): Column heads, chart titles, stat captions, unit and currency notes. Sentence case; this system does not use uppercase tracked-out labels.
- **Table figure** (400–600, 0.8rem, tabular): Ledger cells, right-flushed from the third column on.

### Named Rules
**The One Face Rule.** Public Sans sets everything, numerals included. Do not introduce a serif for display, and never a monospaced face for figures — tabular numerals (`font-variant-numeric: tabular-nums`, `"tnum" 1`) do the alignment work a mono face would otherwise be hired for.

**The Confident Scale Rule.** This world fails when the type is set timidly. The masthead and the balance are set at weight 900 with negative tracking and are the two largest things on the sheet by a wide margin. Do not split the difference with a polite 600.

**The Tabular Money Rule.** Every figure carries tabular numerals and flushes right — in tables, in stat blocks, and at the end of every account line. Columns of money must align on the digit.

## Layout

A single centred sheet inside a fixed 188px left margin of navigation. The statement sheet runs to a 1400px maximum with `1.25rem 1.35rem 3rem` of padding; narrower reading pages (settings, login, prose) run to 900px. The left sidebar is separated from the sheet by a 1px hairline and carries no background of its own — it is margin, not chrome. Its active item is marked by a 4px ink rule in the margin, the way a ledger tab would mark position.

Vertical rhythm is a rem scale of roughly `0.35 / 0.5 / 0.7 / 1.1 / 1.35 / 3rem`, applied as space between ruled sections rather than as padding inside them: sections have `padding: 0.7rem 0 1rem` against a top rule and no horizontal padding at all, because there is no box to be inside of.

Rule weights are the layout grammar and are graded strictly: **6px** masthead rule (once per page, at the top), **4px** above the balance, **2px** opening any section or table header, **1px** hairline between table rows and inside a section. Content grids are two-column at desktop (`minmax(0, 1.4fr) minmax(280px, 0.9fr)` for the hero pair, `1fr 1fr` for charts) and collapse to one column at 980px. At 640px the app top bar is removed entirely so nothing competes with the masthead rule, the dotted leaders are suppressed, figures take a full line and flush right, and the primary action stretches to a full-width bar rather than wrapping.

### Named Rules
**The Ruled Sheet Rule.** Sections are opened by a rule above them, never closed by a border around them. If you need to separate two things, add a rule and space; never add an outline.

**The Masthead Rule.** Every page opens with the 6px ink rule and the 900-weight heading beneath it. Nothing — no banner, no bar, no toolbar — sits above it.

## Elevation & Depth

This system is flat and unlit. There are no elevation tokens, no shadow vocabulary, no tonal surface ramp, and no translucency: every surface is the same paper. Depth is expressed entirely as ruled hierarchy (a heavier rule reads as a higher-order division), type weight, and the flat `{colors.wash}` used to mark a hovered or selected row. Charts sit directly on the paper with hairline gridlines and an ink zero-line; their hover target is a 6% ink wash, not a drawn frame.

### Named Rules
**The No-Enclosure Rule.** No shadow, no glow, no gradient, no backdrop blur, no bordered card. If an element seems to need lifting off the page, it needs a rule above it and more space instead.

**The Wash-Not-Lift Rule.** Hover and selection are a flat grey wash (or a 6% ink fill on chart targets), optionally with an inset 4px ink bar on the leading edge of a selected row. State never changes an element's apparent height.

## Shapes

Zero radius everywhere; `--radius` is literally `0px` and every control — button, input, select, textarea, filter chip, search field, tab — is squared off. A rounded chip belongs to a discarded world. The only curve in the system is the circular user avatar in the sidebar footer.

Form language is the ruled line, in four weights (1px, 2px, 4px, 6px), plus one dotted variant: the 2px dotted leader that runs between a label and its figure on an account line. Borders are used in exactly two ways — as a single-sided rule that opens a section (`border-top`), and as the full 2px ink enclosure of a text input, which is the one place a stroke means "you can type into this". Everything else is open on all sides.

## Components

### Buttons
- **Shape:** Square (0px radius), inline-flex, `0.4rem 0.8rem` padding, nowrap.
- **Primary:** A solid black bar — ink fill, paper text, 600 weight, ink border. Used once per page, top right of the masthead row. Hover lifts the fill to a near-black (#22282a), nothing else moves.
- **Secondary:** Transparent fill, ink text, 1px ink border, 500 weight. Hover fills with the flat wash.
- **Focus (all buttons and controls):** The statutory focus state — see below. Never a ring, never a glow.
- **Danger:** Statutory red text on the standard secondary shell; no red fill.

### Chips / Filters
- **Style:** Square, transparent, ink text, ink hairline border. The filter row ("All names / Winners / Losers / Still holding / Closed / Never sold") reads as a row of small squared tabs.
- **State:** The active chip is inked in — solid ink field, paper text, 600 weight — per The Inked-In Rule. No tinted or coloured selected state exists.

### Inputs / Fields
- **Style:** Paper fill, ink text, **2px solid ink** border, 0px radius, `0.45rem 0.6rem` padding. The heavy stroke is deliberate: it is the one enclosure the system permits, and it is what distinguishes an editable field from every other element on a sheet with no boxes. Applied to `input`, `select`, and `textarea` alike, typed or not.
- **Label:** Reference grey, 0.75rem, above the field.
- **Focus:** The statutory focus state.
- **Search (chrome, not form):** The app search is the one softer field — 2px keyline border and reference-grey text — because it belongs to the margin, not to the statement. Hidden entirely below 640px.

### Tables (the ruled position table)
- **Header:** No fill. Column heads in ink at 600 weight over a **2px ink** bottom rule. Sortable heads are the whole cell, nowrap. Header row sticks to the top of the ledger on scroll.
- **Rows:** No fill, separated by a 1px keyline. Numeric columns (third onward) flush right with tabular numerals; money cells take statutory green or red, all other cells stay ink.
- **States:** Row hover fills with the flat wash; the selected row takes the wash plus an `inset 4px` ink bar on its leading edge. Rows are clickable and open the trade sheet.
- **Wrapper:** None. The table has no frame, no radius, and no background — it sits on the paper.

### Navigation
- **Style:** A 188px left margin column, hairline-separated from the sheet, transparent. Links at 0.9rem in reference grey with a 4px transparent left border.
- **States:** Hover darkens to ink. Active takes ink text, 700 weight, and a 4px ink left rule in the margin. There is no pill, no fill, and no coloured indicator.
- **Mobile:** The app top bar is removed below 640px so the masthead rule stays the first thing on the page.

### Drawer
A right-hand overlay at `min(440px, 100%)` (`560px` wide variant), paper background, separated from the page by a **1px ink** left keyline and a dimming backdrop. Header is a hairline-ruled band with the title at 1rem and a ghost close button; body scrolls with no padding of its own so the contents' own rules run edge to edge. Entry is a 160ms ease-out slide of 12px with a slight opacity ramp — the only motion in the system.

### Statutory Focus State (signature)
The single most characteristic interaction in the world, applied to every focusable element via `:focus-visible`:

```css
outline: 3px solid transparent;
background-color: var(--focus);
box-shadow: 0 -2px var(--focus), 0 4px var(--ink);
color: var(--ink);
```

A solid yellow field under a 4px black bar. It is not a shadow in the elevation sense — it is a drawn bar, which is why it survives in a world with no shadows. It replaces the element's own colours entirely, including on an inked-in primary button, and it removes underlines from links. It is the only appearance of yellow in the product.

### The Account Line (signature)
The system's core reusable row and the reason the world holds together: **label — dotted leader — figure**, baseline-aligned, full width. The label sits left at 1rem/500; a 2px dotted keyline leader stretches across the gap; the figure flushes hard right with tabular numerals and takes its colour from The Money-Only Rule.

It carries the balance (`Net result` with the display-scale figure between its 4px and 2px rules) and, at title scale with a hairline rule beneath each, the win/loss lines (`Win rate`, `Gross profits`, `Gross losses`). Any figure that is the answer to a question should be set as an account line rather than as a stat card. Below 640px the leader is suppressed, the figure drops to its own full-width line, and it still flushes right — one alignment on every device.

### The Never-Sold Replay (signature)
The drawer panel that shows what a sale cost, stated rather than sold. It opens on a small reference-grey label ("If you had never sold"), then a **verdict**: a 2px ink rule with the headline figure beneath it at 800 weight, coloured statutory red when the sale cost the user and statutory green when it saved them — and nothing else. No badge, no card, no accent tab down the side, no call to action. Beneath it, the comparison paths run as ruled blocks with a small square swatch each, then a ruled table of every sale priced at today's value, then hairline footnotes in reference grey. The counterfactual block takes a brass top rule so the card and its line in the chart carry one colour.

The chart plots four series and their roles are fixed: **what you actually did** in Statement Ink, **never sold** in Brass, **proceeds into the index** in Reference Grey, and the **invested baseline** as a 1.25px dashed reference-grey line at 0.7 opacity — distinguished from its solid sibling by the dash, not by hue. Plotted lines are 2px, round-joined. This is the only place in the product where a colour encodes a series rather than money or focus.

## Do's and Don'ts

### Do:
- **Do** open every page with the 6px ink masthead rule and a 900-weight heading directly under it.
- **Do** state a headline figure as an account line: label, 2px dotted leader, tabular figure flushed right.
- **Do** carry structure with graded horizontal rules — 6px masthead, 4px above the balance, 2px per section and table header, 1px hairline between rows.
- **Do** ink in the active state: solid `{colors.ink}` field, paper text, 600 weight.
- **Do** give every figure tabular numerals and right alignment, on every breakpoint.
- **Do** colour a figure green or red only when it is money made or lost.
- **Do** give text inputs their 2px ink stroke; that stroke is what says "editable" on a sheet with no boxes.
- **Do** set the type confidently. A timid masthead is the one documented way this world fails.

### Don't:
- **Don't** put anything in a card, panel, well, or bordered container. Add a rule and space instead.
- **Don't** round a corner. Radius is 0px on every control in the system.
- **Don't** add a shadow, glow, gradient, or backdrop blur to any surface.
- **Don't** introduce a brand accent hue. Interaction is signalled by value, not colour.
- **Don't** use yellow for anything but keyboard focus and text selection.
- **Don't** colour a non-money value — counts, dates, tickers, statuses and percentages of holdings stay ink or reference grey.
- **Don't** use a monospaced face for figures, or any second typeface at all; tabular Public Sans does that job.
- **Don't** replace the focus field with an outline ring, a glow, or a border-colour shift.
- **Don't** set a kicker or eyebrow above a heading. The masthead rule is the only thing that precedes a title.
- **Don't** let brass out of the replay chart. It is a series colour there and nothing anywhere else.
- **Don't** dark-mode this world or introduce a second surface tone; the flat wash is the only variation on paper.
