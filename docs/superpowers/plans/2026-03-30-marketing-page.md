# Marketing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a single-file static marketing landing page for Flywheel at `www/index.html`.

**Architecture:** One self-contained HTML file with inline CSS and minimal JS (platform detection only). Terminal-native aesthetic with Monaspace fonts from CDN. Two sections: hero + feature strip.

**Tech Stack:** HTML, CSS (inline), vanilla JS (platform detection), Monaspace fonts via jsDelivr CDN.

**Design spec:** `docs/superpowers/specs/2026-03-30-marketing-page-design.md`

---

### Task 1: Scaffold HTML with fonts and CSS variables

**Files:**

- Create: `www/index.html`

- [ ] **Step 1: Create the www directory and base HTML file**

Create `www/index.html` with the document skeleton, `@font-face` declarations, and CSS custom properties:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Flywheel — Your development command center</title>
    <meta
      name="description"
      content="Terminals, browsers, and processes in a single spatial workspace. Keyboard-driven. Project-organized."
    />
    <style>
      @font-face {
        font-family: "Monaspace Radon";
        src: url("https://cdn.jsdelivr.net/gh/githubnext/monaspace@v1.101/fonts/webfonts/MonaspaceRadon-Medium.woff")
          format("woff");
        font-weight: 500;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Monaspace Neon";
        src: url("https://cdn.jsdelivr.net/gh/githubnext/monaspace@v1.101/fonts/webfonts/MonaspaceNeon-Light.woff")
          format("woff");
        font-weight: 300;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Monaspace Neon";
        src: url("https://cdn.jsdelivr.net/gh/githubnext/monaspace@v1.101/fonts/webfonts/MonaspaceNeon-Regular.woff")
          format("woff");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Monaspace Neon";
        src: url("https://cdn.jsdelivr.net/gh/githubnext/monaspace@v1.101/fonts/webfonts/MonaspaceNeon-ExtraBold.woff")
          format("woff");
        font-weight: 800;
        font-style: normal;
        font-display: swap;
      }

      :root {
        --bg: #0f0f1a;
        --text: #e0e0f0;
        --accent: #e8a830;
        --muted: #6a6a8a;
        --border: #2a2a4a;
        --faint: #1e1e38;
        --comment: #2a2a4a;
      }

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        background: var(--bg);
        color: var(--text);
        font-family: "Monaspace Neon", monospace;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
    </style>
  </head>
  <body>
    <!-- Content goes here -->
  </body>
</html>
```

- [ ] **Step 2: Open in browser to verify fonts load**

Run: `open www/index.html` (or use a local server: `python3 -m http.server 8000 -d www`)

Expected: Page loads with dark navy background (`#0f0f1a`). Check browser dev tools Network tab — four `.woff` files should load from `cdn.jsdelivr.net` with 200 status.

- [ ] **Step 3: Commit**

```bash
git add www/index.html
git commit -m "feat: scaffold marketing page with Monaspace fonts and CSS variables"
```

---

### Task 2: Terminal chrome wrapper

**Files:**

- Modify: `www/index.html`

- [ ] **Step 1: Add terminal chrome CSS**

Add these styles inside the existing `<style>` block, after the `body` rule:

```css
@keyframes blink {
  50% {
    border-color: transparent;
  }
}

.terminal {
  width: 100%;
  max-width: 720px;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}

.terminal::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background:
    radial-gradient(ellipse at 20% 0%, rgba(200, 140, 40, 0.06) 0%, transparent 45%),
    radial-gradient(ellipse at 70% 90%, rgba(99, 102, 241, 0.04) 0%, transparent 40%);
  pointer-events: none;
}

.chrome {
  background: var(--faint);
  border-bottom: 1px solid var(--border);
  padding: 12px 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

.chrome-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid var(--border);
}

.chrome-tab {
  margin-left: 16px;
  font-family: "Monaspace Radon", monospace;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: var(--bg);
  padding: 4px 12px;
  border-radius: 4px;
}
```

- [ ] **Step 2: Add terminal chrome markup**

Replace the `<!-- Content goes here -->` comment in `<body>` with:

```html
<div class="terminal">
  <div class="chrome">
    <div class="chrome-dot"></div>
    <div class="chrome-dot"></div>
    <div class="chrome-dot"></div>
    <div class="chrome-tab">Flywheel.</div>
  </div>
  <main class="content">
    <!-- Hero and feature strip go here -->
  </main>
</div>
```

- [ ] **Step 3: Verify in browser**

Run: Refresh `www/index.html` in the browser.

Expected: A rounded dark rectangle centered on the page with a chrome bar at top showing three dots and a "Flywheel." tab in the Radon handwriting font with ochre color. The atmospheric radial gradients should be subtly visible.

- [ ] **Step 4: Commit**

```bash
git add www/index.html
git commit -m "feat: add terminal chrome wrapper to marketing page"
```

---

### Task 3: Hero section — wordmark, headline, body

**Files:**

- Modify: `www/index.html`

- [ ] **Step 1: Add hero CSS**

Add these styles inside the `<style>` block:

```css
.content {
  padding: 40px 48px 48px;
  position: relative;
}

.wordmark {
  font-family: "Monaspace Radon", monospace;
  font-size: 15px;
  font-weight: 500;
  color: var(--accent);
  margin-bottom: 28px;
}

h1 {
  font-family: "Monaspace Neon", monospace;
  font-size: 56px;
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: -2px;
  color: var(--text);
  margin-bottom: 22px;
}

h1 .typed {
  color: var(--accent);
  border-right: 2px solid var(--accent);
  padding-right: 2px;
  animation: blink 1s step-end infinite;
}

.body-text {
  font-size: 14px;
  font-weight: 300;
  line-height: 1.8;
  color: var(--muted);
  max-width: 560px;
  margin-bottom: 32px;
}

.body-text .hl {
  color: var(--accent);
}
```

- [ ] **Step 2: Add hero markup**

Replace the `<!-- Hero and feature strip go here -->` comment inside `<main class="content">` with:

```html
<div class="wordmark">Flywheel.</div>

<h1>Your entire stack.<br />One <span class="typed">strip</span></h1>

<p class="body-text">
  Terminals, browsers, and processes — arranged
  <span class="hl">spatially</span> in one scrollable workspace. Organized by project. Navigated by
  keyboard. No more <span class="hl">Alt-Tab</span>. No more lost windows.
</p>

<!-- CTAs go here -->

<!-- Feature strip goes here -->
```

- [ ] **Step 3: Verify in browser**

Run: Refresh the page.

Expected: "Flywheel." wordmark in ochre Radon at 15px. Large headline "Your entire stack. / One strip" with "strip" in ochre and a blinking cursor. Body text in muted color with "spatially" and "Alt-Tab" highlighted in ochre.

- [ ] **Step 4: Commit**

```bash
git add www/index.html
git commit -m "feat: add hero section — wordmark, headline, body copy"
```

---

### Task 4: CLI-style CTAs and meta line

**Files:**

- Modify: `www/index.html`

- [ ] **Step 1: Add CTA and meta CSS**

Add these styles inside the `<style>` block:

```css
.ctas {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 420px;
  margin-bottom: 32px;
}

.cta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--faint);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-family: "Monaspace Neon", monospace;
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
  text-decoration: none;
  transition: border-color 0.2s;
}

.cta:hover {
  border-color: var(--accent);
}

.cta .prompt {
  color: var(--accent);
}

.cta .comment {
  color: var(--comment);
  margin-left: auto;
}

.meta {
  font-size: 11px;
  font-weight: 400;
  color: var(--comment);
  display: flex;
  gap: 24px;
}
```

- [ ] **Step 2: Add CTA and meta markup**

Replace the `<!-- CTAs go here -->` comment with:

```html
<div class="ctas">
  <a class="cta" id="download-cta" href="https://github.com/joseph-lozano/flywheel/releases/latest">
    <span class="prompt">↓</span>
    <span id="download-label">Download Flywheel</span>
    <span class="comment" id="download-comment"># macOS arm64</span>
  </a>
  <a class="cta" href="https://github.com/joseph-lozano/flywheel" target="_blank" rel="noopener">
    <span class="prompt">★</span>
    <span>Star on GitHub</span>
    <span class="comment"># joseph-lozano/flywheel</span>
  </a>
</div>

<div class="meta">
  <span>v0.1.0-alpha</span>
  <span>macOS arm64 · Linux x64/arm64</span>
</div>
```

- [ ] **Step 3: Add platform detection JS**

Add this `<script>` tag just before `</body>`:

```html
<script>
  (function () {
    var p = navigator.platform || "";
    var ua = navigator.userAgent || "";
    var label = document.getElementById("download-label");
    var comment = document.getElementById("download-comment");

    if (p.indexOf("Linux") !== -1 || ua.indexOf("Linux") !== -1) {
      label.textContent = "Download Flywheel";
      comment.textContent =
        ua.indexOf("aarch64") !== -1 || ua.indexOf("arm") !== -1 ? "# Linux arm64" : "# Linux x64";
    } else {
      label.textContent = "Download Flywheel";
      comment.textContent = "# macOS arm64";
    }
  })();
</script>
```

- [ ] **Step 4: Verify in browser**

Run: Refresh the page.

Expected: Two CLI-styled CTA boxes. Download link shows platform-appropriate comment (macOS on Mac, Linux on Linux). Star link opens GitHub repo in new tab. Hovering either CTA turns the border ochre. Meta line shows version and platforms in faint text below.

- [ ] **Step 5: Commit**

```bash
git add www/index.html
git commit -m "feat: add CLI-style CTAs with platform detection and meta line"
```

---

### Task 5: Feature strip

**Files:**

- Modify: `www/index.html`

- [ ] **Step 1: Add feature strip CSS**

Add these styles inside the `<style>` block:

```css
.features {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1px;
  background: var(--border);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  margin-top: 40px;
}

.feature {
  background: var(--bg);
  padding: 20px 24px;
}

.feature-icon {
  color: var(--accent);
  font-size: 16px;
  margin-bottom: 10px;
}

.feature-label {
  font-size: 13px;
  font-weight: 400;
  color: var(--text);
  margin-bottom: 6px;
}

.feature-desc {
  font-size: 12px;
  font-weight: 300;
  line-height: 1.6;
  color: var(--muted);
}
```

- [ ] **Step 2: Add feature strip markup**

Replace the `<!-- Feature strip goes here -->` comment with:

```html
<div class="features">
  <div class="feature">
    <div class="feature-icon">→</div>
    <div class="feature-label">Spatial workspace</div>
    <div class="feature-desc">Panels scroll in an infinite horizontal strip.</div>
  </div>
  <div class="feature">
    <div class="feature-icon">◊</div>
    <div class="feature-label">Project-organized</div>
    <div class="feature-desc">One project at a time. Switch instantly. Worktree-aware.</div>
  </div>
  <div class="feature">
    <div class="feature-icon">⌘</div>
    <div class="feature-label">Keyboard-driven</div>
    <div class="feature-desc">Navigate, split, close — all from the keyboard. No mouse needed.</div>
  </div>
</div>
```

- [ ] **Step 3: Verify in browser**

Run: Refresh the page.

Expected: A three-column grid below the meta line. Each cell has an ochre symbol, a label in primary text color, and a description in muted text. The grid has 1px borders between cells using the `--border` color. The whole thing fits in the terminal chrome wrapper without feeling cramped.

- [ ] **Step 4: Commit**

```bash
git add www/index.html
git commit -m "feat: add feature strip section to marketing page"
```

---

### Task 6: Responsive polish and final review

**Files:**

- Modify: `www/index.html`

- [ ] **Step 1: Add responsive styles**

Add these styles at the end of the `<style>` block:

```css
@media (max-width: 640px) {
  body {
    padding: 12px;
  }

  .terminal {
    border-radius: 8px;
  }

  .content {
    padding: 28px 24px 32px;
  }

  h1 {
    font-size: 36px;
    letter-spacing: -1px;
  }

  .ctas {
    max-width: 100%;
  }

  .features {
    grid-template-columns: 1fr;
  }

  .meta {
    flex-wrap: wrap;
    gap: 12px;
  }
}
```

- [ ] **Step 2: Verify responsive behavior**

Run: Open browser dev tools, toggle device toolbar. Test at 375px (iPhone SE), 768px (tablet), and 1440px (desktop).

Expected:

- **375px:** Single-column features, smaller headline (36px), tighter padding. Everything readable, no horizontal overflow.
- **768px:** Same as desktop, fits comfortably.
- **1440px:** Terminal centered, max-width 720px, atmospheric gradients visible.

- [ ] **Step 3: Final visual check**

Verify the complete page against the spec:

- Radon wordmark "Flywheel." in ochre ✓
- Neon ExtraBold headline with blinking cursor on "strip" ✓
- Neon Light body with highlighted terms ✓
- Two CLI-style CTAs with hover states ✓
- Meta line with version and platforms ✓
- Three-column feature strip ✓
- Terminal chrome with dots and tab ✓
- Atmospheric radial gradients ✓

- [ ] **Step 4: Commit**

```bash
git add www/index.html
git commit -m "feat: add responsive styles and finalize marketing page"
```

---

### Task 7: Add www to .gitignore exclusions and update .gitignore

**Files:**

- Modify: `.gitignore` (if www or its contents would be ignored by existing rules)

- [ ] **Step 1: Check if www/ is gitignored**

Run: `git check-ignore www/index.html`

If it outputs `www/index.html`, the file is ignored and you need to add an exclusion. If no output, skip to Step 3.

- [ ] **Step 2: Add exclusion if needed**

If the file is ignored, add `!www/` to `.gitignore` to ensure it's tracked.

- [ ] **Step 3: Final commit with all files tracked**

Run: `git status` to confirm `www/index.html` is tracked.

```bash
git add www/index.html .gitignore
git commit -m "chore: ensure www/ is tracked in git"
```
