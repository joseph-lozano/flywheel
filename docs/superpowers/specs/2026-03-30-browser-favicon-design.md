# Browser Panel Favicon

Replace the static globe SVG in the browser chrome strip with the site's favicon when available.

## Data Flow

1. **`panel-manager.ts`** listens to `page-favicon-updated` on the content view's `webContents`
2. A pure function picks the best URL from the favicon array (prefer smallest, fall back to first)
3. The URL is sent to the chrome strip via the existing `panel:chrome-state` channel as `faviconUrl` (string or `null`)
4. **`browser-host.ts`** swaps between the globe SVG and an `<img>` element based on `faviconUrl`

## Favicon Selection

Pure function in `panel-manager.ts`:

- If any URL path contains a size hint matching `16x16` or `32x32`, prefer it
- Otherwise use the first URL in the array
- If the array is empty, send `faviconUrl: null`

## Chrome Strip UI

### HTML (`browser-host.html`)

Add a hidden `<img id="favicon">` sibling to the existing `.globe` span, with matching flex/margin styling.

### State management (`browser-host.ts`)

In the `onChromeState` handler:

- When `faviconUrl` is a non-null string: set `<img>` src, show `<img>`, hide globe
- On `<img>` `onerror`: hide `<img>`, show globe (fallback)
- When `faviconUrl` is `null`: hide `<img>`, show globe

### Reset on navigation

On `did-navigate`, send `faviconUrl: null` to clear stale favicons while the new page loads. The new page's `page-favicon-updated` event will provide the replacement.

## Files Changed

| File                            | Change                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/main/panel-manager.ts`     | Add `page-favicon-updated` listener, favicon selection function, send via `panel:chrome-state` |
| `src/browser/browser-host.html` | Add `<img id="favicon">` element with styling                                                  |
| `src/browser/browser-host.ts`   | Handle `faviconUrl` in `onChromeState`, manage globe/img visibility                            |

## Not Changed

- No new IPC channels (reuses `panel:chrome-state`)
- No changes to preload APIs, renderer sidebar, or shared types
- No favicon in the panel strip — only the chrome strip titlebar
