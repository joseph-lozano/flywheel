# Marketing Page + Brand Font Update

## Problem

Flywheel has no public-facing web presence. Potential users have no way to learn what the app does or download it without finding the GitHub repo directly. The app's UI also uses generic system fonts that don't establish a visual brand.

## Solution

Two deliverables:

1. **Marketing landing page** — a single static HTML file at `www/index.html` that explains Flywheel and drives downloads + GitHub stars.
2. **App UI font update** — switch the app's UI chrome (sidebar, hint bar, dialogs) to Monaspace Neon, creating brand consistency between the site and the product.

## Marketing Page

### Audience

General developers — people frustrated with window management who may not know what a tiling WM or terminal multiplexer is. Lead with the pain point, explain the spatial model as the solution.

### Goals

- Drive downloads (macOS DMG, Linux AppImage/deb)
- Drive GitHub stars
- Explain what Flywheel is in plain terms

### Format

Single self-contained `www/index.html` file. All CSS inline, no JS framework, no build step. Deploy anywhere as a static file. Fonts loaded from jsDelivr CDN (GitHub Monaspace repo).

### Aesthetic: Terminal-native

The page is wrapped in faux terminal window chrome — three dots, a tab bar. The entire site lives inside this terminal metaphor. CTAs are styled as command lines. The monospace font family reinforces the developer identity.

### Typography

All fonts from the [Monaspace](https://github.com/githubnext/monaspace) family by GitHub:

| Role | Font | Weight | Notes |
|------|------|--------|-------|
| Wordmark / logo | Monaspace Radon | Medium (500) | Handwritten variant. Title case: "Flywheel." with ochre dot. |
| Headlines | Monaspace Neon | ExtraBold (800) | Geometric neo-grotesque. ~56px for hero h1. |
| Body text | Monaspace Neon | Light (300) | Same family, lighter weight for readability. |
| UI elements (CTAs, meta) | Monaspace Neon | Regular (400) | Labels, comments, meta line. |

Font loading: `@font-face` declarations pointing to jsDelivr CDN (`cdn.jsdelivr.net/gh/githubnext/monaspace@v1.101/fonts/webfonts/`). WOFF format.

### Color Palette

Hybrid scheme: the app's navy background with honey ochre accents.

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0f0f1a` | Page background (matches app's global bg) |
| `--text` | `#e0e0f0` | Primary text |
| `--accent` | `#e8a830` | Honey ochre — wordmark, highlights, CTAs, interactive elements |
| `--muted` | `#6a6a8a` | Body text, secondary content |
| `--border` | `#2a2a4a` | Borders, dividers (matches app's sidebar border) |
| `--faint` | `#1e1e38` | Subtle backgrounds, chrome bar |
| `--comment` | `#2a2a4a` | Inline comments in CLI-style CTAs |

Atmospheric depth via radial gradients:
- Top-left: subtle ochre glow `rgba(200,140,40,0.06)`
- Bottom-right: subtle indigo glow `rgba(99,102,241,0.04)`

### Layout

Two sections, single-screen feel. No scrolling required to get the full message.

#### Section 1: Hero

Wrapped in terminal chrome:

```
┌───────────────────────────────────────────┐
│ ● ● ●    Flywheel.                        │  ← Radon in tab
├───────────────────────────────────────────┤
│                                           │
│  Flywheel.                                │  ← Radon Medium, ochre
│                                           │
│  Your entire stack.                       │  ← Neon ExtraBold, 56px
│  One strip.                               │  ← "strip" has blinking cursor
│                                           │
│  Terminals, browsers, and processes —     │  ← Neon Light, muted
│  arranged spatially in one scrollable     │
│  workspace. Organized by project.         │
│  Navigated by keyboard. No more Alt-Tab.  │
│  No more lost windows.                    │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │ ↓  Download Flywheel.dmg  # macOS  │  │  ← CLI-style CTA
│  └─────────────────────────────────────┘  │
│  ┌─────────────────────────────────────┐  │
│  │ ★  Star on GitHub    # flywheel    │  │  ← CLI-style CTA
│  └─────────────────────────────────────┘  │
│                                           │
│  v0.1.0-alpha · macOS arm64 · Linux       │  ← Meta line, faint
│                                           │
└───────────────────────────────────────────┘
```

- Terminal chrome: three dots (border only, no color) + "Flywheel." tab in Radon
- Wordmark: "Flywheel." in Radon Medium, ochre, 15px
- Headline: Neon ExtraBold, ~56px, `--text` color
- The word "strip" in the headline gets ochre color + a CSS blinking cursor animation
- Body: Neon Light, 14px, `--muted` color. Key terms ("spatially", "Alt-Tab") highlighted in `--accent`
- CTAs: Bordered boxes styled as command lines. Ochre prompt char (↓ / ★), muted command text, faint comment. Hover: border turns ochre.
- Meta line: version, platforms. Faint color.

CTA links:
- Download: points to latest GitHub release asset (DMG for macOS, AppImage/deb for Linux). Detect platform via `navigator.platform` to show the right default — this is the one piece of JS on the page.
- Star: points to the GitHub repo

#### Section 2: Feature Strip

Three compact callouts in a horizontal row, below the hero but still inside the terminal aesthetic.

```
┌──────────────────┬──────────────────┬──────────────────┐
│  →                │  ◊                │  ⌘                │
│  Spatial          │  Project-         │  Keyboard-        │
│  workspace        │  organized        │  driven           │
│                   │                   │                   │
│  Panels scroll    │  One project at   │  Navigate, split, │
│  in an infinite   │  a time. Switch   │  close — all from │
│  horizontal       │  instantly.       │  the keyboard.    │
│  strip.           │  Worktree-aware.  │  No mouse needed. │
└──────────────────┴──────────────────┴──────────────────┘
```

- Ochre symbol/icon above each label
- Label in Neon Regular, `--text` color
- Description in Neon Light, `--muted` color
- Borders use `--border` color
- No interactivity, purely informational

### Interactions

Minimal, CSS-only:
- Blinking cursor on "strip" in headline (`animation: blink 1s step-end infinite`)
- CTA hover: border color transitions to ochre
- No JavaScript except platform detection for download link

### File Structure

```
www/
  index.html    # Everything — markup, styles, minimal JS
```

No other files. No CSS file. No build step.

## App UI Font Update

### Scope

Switch the app's UI chrome font from the current system/default font to Monaspace Neon. This affects:

- Sidebar (project names, row labels, section headers)
- Hint bar (keyboard shortcut labels)
- Dialog text (confirm close, remove project, etc.)
- Any other renderer UI text

This does **not** affect:
- Terminal font (stays user-configurable via config, defaults to existing)
- Browser panel content (web pages control their own fonts)

### Implementation

1. **Bundle the font**: Download Monaspace Neon WOFF2 files (Light, Regular, Medium, Bold) and place them in `src/renderer/src/assets/fonts/`. These must be bundled with the app, not loaded from CDN, since the app runs offline.

2. **Add @font-face declarations**: In `src/renderer/src/global.css`, add `@font-face` rules pointing to the bundled files.

3. **Update CSS**: Set `font-family: 'Monaspace Neon', monospace` as the base font on the renderer's root element. Update `src/shared/constants.ts` if any font constants are defined there.

4. **Verify**: Check all UI surfaces render correctly with the new font — sidebar, hint bar, dialogs, scroll indicators.

### Font Files Needed

From the Monaspace repo (`fonts/webfonts/`):
- `MonaspaceNeon-Light.woff2` (300)
- `MonaspaceNeon-Regular.woff2` (400)
- `MonaspaceNeon-Medium.woff2` (500)
- `MonaspaceNeon-Bold.woff2` (700)

## Out of Scope

- Custom domain or hosting setup
- Analytics or tracking
- Blog, docs, or changelog pages
- App icon or other brand assets
- Terminal font changes
- SEO optimization (can come later)
