---
name: Trader
description: A personal trading terminal where the only colour on screen is money.
colors:
  ink: "#06070a"
  ink-pane: "#0a0c11"
  ink-raised: "#12151c"
  rule: "#1b1f28"
  rule-strong: "#2a3039"
  paper: "#e9ebf0"
  paper-dim: "#79808f"
  brass: "#c9a227"
  gain: "#4ec08a"
  loss: "#e05c62"
typography:
  display:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "clamp(1.9rem, 3vw, 2.6rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.05em"
  headline:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "0.92rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 400
    lineHeight: 1.3
  figure:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 500
    fontFeature: "tnum 1"
rounded:
  sm: "6px"
  md: "8px"
  pill: "999px"
spacing:
  xs: "0.4rem"
  sm: "0.7rem"
  md: "0.9rem"
  lg: "1.1rem"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.paper-dim}"
    rounded: "{rounded.sm}"
    padding: "0.38rem 0.75rem"
  button-hover:
    backgroundColor: "{colors.ink-raised}"
    textColor: "{colors.paper}"
  button-primary:
    backgroundColor: "{colors.ink-raised}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "0.38rem 0.75rem"
  input:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "0.45rem 0.6rem"
  panel:
    backgroundColor: "{colors.ink-pane}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "0.9rem 1rem 0.85rem"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.paper-dim}"
    padding: "0.4rem 0.6rem 0.4rem 0.75rem"
  nav-item-active:
    backgroundColor: "transparent"
    textColor: "{colors.paper}"
---

# Design System: Trader

## Overview

**Creative North Star: "The Darkroom"**

The interface is a darkroom: a near-black room where the truth of a past decision
gradually develops into view. Nothing is lit that does not need to be seen. The
ground is Ink (#06070a), close to true black, and every panel sits within a few
values of it, separated by a hairline rather than a fill. Reading the screen feels
like watching an image appear in a tray, not like scanning a dashboard.

Colour is rationed to the point of scarcity. Chrome is achromatic: navigation,
buttons, inputs, selection and focus are all Paper on Ink, signalled by value rather
than hue. That leaves Gain, Loss and Brass as the only colour a person ever sees,
which means colour always carries information. Money is the only thing allowed to
be coloured.

Components are instrument-grade and precise: small radii, tight padding, hairline
outlines, nothing soft or friendly. The interface reads as equipment you operate.
Figures are the loudest element on any screen, and they align in columns without a
monospaced face, using tabular numerals in the single sans family.

**Key Characteristics:**

- Near-black ground with panels within a few values of it
- Achromatic chrome; interaction signalled by value, not hue
- Colour reserved for money and for attention
- Hairline rules instead of filled cards
- One typeface, with figures on tabular numerals
- Flat at rest; shadow only where something floats

## Colors

A near-monochrome system with three colours held in reserve.

### Primary

- **Paper** (#e9ebf0): Body text, headings, figures, and every interactive
  signal. A control at rest is Paper Dim; hover, focus and selection bring it to
  full Paper. This is the accent, and it has no hue on purpose.

### Secondary

- **Brass** (#c9a227): The warm accent, used to mark whatever needs attention.
  Its defining use is the never-sold line in the replay, the path you did not
  take. It also carries warnings and stale-data notices.

### Tertiary

- **Gain** (#4ec08a): Profit. Positive P&L figures, gain bars, and the winning
  half of any ratio.
- **Loss** (#e05c62): Loss. Negative P&L figures, loss bars, destructive
  confirmation, and error text.

### Neutral

- **Ink** (#06070a): The ground. The application background and the inside of
  input fields.
- **Ink Pane** (#0a0c11): Panels and drawers, one step off the ground.
- **Ink Raised** (#12151c): Lifted controls, primary buttons, and hover fills.
- **Rule** (#1b1f28): Hairline borders, table dividers, and panel edges.
- **Rule Strong** (#2a3039): The border of a lifted control, and link underlines.
- **Paper Dim** (#79808f): Secondary text, labels, axis text, and controls at rest.

### Named Rules

**The Money Rule.** Gain and Loss appear only on figures that are literally profit
or loss. A button, a tab, a chart of price, a status pill: none of these may be
green or red. If something is coloured, a person should be able to say what
number it refers to.

**The Value Rule.** Interaction is signalled by value, never by hue. Selection,
hover, focus and primary emphasis move a control from Paper Dim toward Paper, or
lift its surface from Ink toward Ink Raised. Introducing a coloured chrome accent
is a rejection of this system.

## Typography

**Display Font:** Instrument Sans (with system-ui, sans-serif)
**Body Font:** Instrument Sans (with system-ui, sans-serif)
**Label/Mono Font:** none; there is no monospaced face in this system.

**Character:** One family throughout, a slightly narrow grotesque with tight
apertures that reads as equipment rather than editorial. Figures use tabular
numerals so columns align without the terminal connotations of a monospaced face.

### Hierarchy

- **Display** (600, clamp(1.9rem, 3vw, 2.6rem), 1.05, -0.05em): The single
  headline figure on a surface, such as net result. One per screen at most.
- **Headline** (700, 1.35rem, 1.2, -0.02em): Page titles.
- **Title** (600, 0.92rem, 1.35): Panel and section titles.
- **Body** (400, 0.85rem, 1.5): Prose, descriptions, and table cells.
- **Label** (400, 0.72rem, 1.3, sentence case): Stat labels, axis text, and
  captions, always in Paper Dim.
- **Figure** (500, 0.85rem, tabular numerals): Every number in the interface.

### Named Rules

**The Sentence Case Rule.** Labels and headings are sentence case. Tracked-out
capitals are reserved for short status pills such as OPEN, BUY and SELL, where the
whole word is the datum. Capitals above a heading are a defect.

**The Tabular Rule.** Any element that renders a number carries tabular numerals.
Columns of figures must align on the decimal without a monospaced font.

## Layout

A fixed 188px sidebar holds primary navigation and the account, with the remainder
of the viewport given to one working surface. The watchlist splits that surface
into a list column and a chart pane; other surfaces run full width.

Panels sit in a grid with a 0.7rem gutter, and content within a panel uses a
0.4/0.7/0.9/1.1rem spacing rhythm. Density favours showing the whole picture: the
Paper surface stacks a hero, two charts, a bar chart, notes, and the position
table on one page, with the table reachable without hunting.

Breakpoints collapse the layout progressively at 1200px, 1100px, 980px, 900px,
800px and 640px, folding two-column grids to one and finally dropping the sidebar
to a horizontal bar.

### Named Rules

**The No Empty Room Rule.** The largest region of a surface never holds an empty
state when real content could occupy it. The watchlist opens the first symbol on
load rather than asking the visitor to pick one.

## Elevation & Depth

The system is flat. Surfaces are separated by tone and a hairline rule, not by
shadow. A panel is Ink Pane on Ink with a 1px Rule border, and that single value
step plus the border does all the work.

Shadow appears only where something genuinely floats above the page.

### Shadow Vocabulary

- **Overlay** (`box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35)`): The position drawer
  sliding over the page.
- **Popover** (`box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45)`): Search suggestions
  and menus.
- **Focus ring** (`box-shadow: 0 0 0 3px rgb(var(--accent-rgb) / 0.12)`): Keyboard
  focus on a control.

### Named Rules

**The Floating Rule.** Shadow is only permitted on an element that overlaps other
content. If it sits in the page flow, it separates by tone and rule alone.

## Shapes

Corners are tight: 6px on controls and panels, 8px on inputs and larger
containers, and a full pill only on status chips where the shape itself reads as a
badge. Circles appear only for the avatar and the win-rate ring.

Borders do the structural work. A 1px Rule hairline defines panels, table rows,
and controls at rest, stepping to Rule Strong for a lifted control or an active
edge. The active navigation item is marked by a 2px rule in the left margin, the
way a tab marks a page in a ledger.

### Named Rules

**The Hairline Rule.** Structure is drawn with 1px borders and tonal steps.
Reaching for a fill, a gradient, or a shadow to separate two regions means the
hairline was not tried.

## Components

### Buttons

- **Shape:** Tight corners (6px).
- **Default:** Transparent background, 1px Rule border, Paper Dim text, 0.38rem
  0.75rem padding, 0.88rem type. Quiet at rest.
- **Hover / Focus:** Border steps to Rule Strong, text to Paper, background to a
  4% Paper wash. Transition 0.15s on border, background and colour.
- **Primary:** Ink Raised fill, Rule Strong border, Paper text at weight 600.
  Primacy comes from weight and a lifted surface, never from a colour fill.
- **Destructive:** Loss text on the standard outline; no red fill.

### Chips

- **Style:** Built on the button primitive. Filter chips sit in a row above the
  table with the same hairline outline.
- **State:** The selected chip lifts to Ink Raised with Paper text; unselected
  chips stay transparent with Paper Dim.
- **Status pills:** Full pill radius, uppercase, 0.68rem, tinted by meaning:
  OPEN and BUY in Gain, SELL and closed states in Loss.

### Cards / Containers

- **Corner Style:** 8px on panels; 6px on smaller controls.
- **Background:** Ink Pane, at roughly half opacity over the ground.
- **Shadow Strategy:** None. See Elevation & Depth.
- **Border:** 1px Rule.
- **Internal Padding:** 0.9rem 1rem 0.85rem.

### Inputs / Fields

- **Style:** Ink background, 1px Rule border, 8px radius, 0.45rem 0.6rem padding.
  Darker than the panel they sit in, so a field reads as a recess.
- **Focus:** Border shifts to the dim accent; no glow, no colour.
- **Error:** Loss text beneath the field, with the message stating what to fix.

### Navigation

- **Style:** A 188px sidebar, transparent against the ground, separated by a
  single Rule border on its right edge.
- **Default:** Paper Dim, 0.9rem, no background, no marker.
- **Hover:** Text to Paper.
- **Active:** Text to Paper at weight 600, with a 2px Paper rule in the left
  margin. No pill, no fill, no bullet.
- **Mobile:** Below 900px the sidebar becomes a horizontal bar above the content.

### The Replay Panel

The signature component, and the one place the system spends its boldness. It
compares three value paths over time inside the position drawer:

- **What you did** in Paper, the path actually taken.
- **Never sold** in Brass, the counterfactual, and the reason the panel exists.
- **Proceeds into the index** in Paper Dim, context rather than argument.
- **Cash invested** as a dashed Paper Dim baseline.

A verdict line states the result in words and money before any chart appears
("Selling cost you £3,663.00"), bordered on its left edge by Loss or Gain
according to which way it went. Three summary cards follow, with the never-sold
card outlined in Brass.

## Do's and Don'ts

### Do:

- **Do** signal interaction by value: move a control from Paper Dim (#79808f) to
  Paper (#e9ebf0), or lift its surface from Ink (#06070a) to Ink Raised (#12151c).
- **Do** reserve Gain (#4ec08a) and Loss (#e05c62) for figures that are literally
  profit or loss.
- **Do** use Brass (#c9a227) to mark what deserves attention, above all the
  never-sold path in the replay.
- **Do** draw structure with 1px Rule (#1b1f28) hairlines and a single tonal step.
- **Do** give every numeric element tabular numerals so columns align.
- **Do** write labels and headings in sentence case.
- **Do** open the first symbol on the watchlist rather than showing an empty pane.

### Don't:

- **Don't** introduce a coloured chrome accent. A blue, green or violet used for
  buttons, links, tabs or selection is a rejection of this system. This was tried
  and rejected.
- **Don't** use a monospaced typeface anywhere, including chart axes. Figures
  align on tabular numerals in Instrument Sans. This was tried and rejected.
- **Don't** colour a button, tab, chart of price, or status chip green or red
  unless it reports profit or loss.
- **Don't** add shadow to an element that sits in the page flow.
- **Don't** separate regions with fills or gradients when a hairline and a tonal
  step will do.
