import { BaseWindow, clipboard, Menu, WebContentsView } from "electron";
import { join } from "path";
import type { FlywheelConfig } from "../shared/config";
import { LAYOUT } from "../shared/constants";

/**
 * Pick the best favicon from the array.
 * Prefer SVG (adapts to light/dark via media queries), then smallest size hint, then first.
 */
export function pickBestFavicon(favicons: string[]): string | null {
  if (favicons.length === 0) return null;
  for (const url of favicons) {
    if (/\.svg(?:\?|$)/i.test(url)) return url;
  }
  for (const url of favicons) {
    if (url.includes("16x16")) return url;
  }
  for (const url of favicons) {
    if (url.includes("32x32")) return url;
  }
  return favicons[0];
}

/** Only allow http/https favicon URLs — rejects data: URIs, javascript: URLs, etc. */
export function sanitizeFaviconUrl(url: string | null): string | null {
  return url && /^https?:\/\//.test(url) ? url : null;
}

interface ManagedPanel {
  id: string;
  type: "terminal" | "placeholder" | "browser";
  view: WebContentsView;
  chromeView?: WebContentsView;
}

export class PanelManager {
  private panels = new Map<string, ManagedPanel>();
  private pendingChromeState = new Map<string, Record<string, unknown>>();
  private terminalFontSizes = new Map<string, number>();
  private lastClipState = new Map<string, number>();
  private window: BaseWindow;
  private chromeView: WebContentsView;
  private _sidebarWidth = 0;

  constructor(window: BaseWindow, chromeView: WebContentsView) {
    this.window = window;
    this.chromeView = chromeView;
  }

  set sidebarWidth(width: number) {
    this._sidebarWidth = width;
  }

  createPanel(
    id: string,
    options:
      | { type: "terminal" }
      | { type: "browser"; url: string }
      | { type?: "placeholder"; color: string },
  ): void {
    if (this.panels.has(id)) return;

    const panelType = options.type ?? "placeholder";

    const preloadFile =
      panelType === "browser" ? "../preload/browser-content.js" : "../preload/panel.js";
    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, preloadFile),
        sandbox: panelType === "browser",
      },
    });

    // Intercept app shortcuts before xterm.js / browser content consumes them.
    // Menu accelerators don't fire when a child WebContentsView has focus,
    // so we manually forward matching key combos to the chrome view.
    const handleShortcutKey = (event: Electron.Event, input: Electron.Input): void => {
      if (input.type !== "keyDown" || !input.meta) return;

      let action: { type: string; index?: number } | null = null;

      if (input.shift) {
        if (input.key === "ArrowLeft") action = { type: "swap-left" };
        else if (input.key === "ArrowRight") action = { type: "swap-right" };
        else if (input.key === "ArrowUp") action = { type: "prev-project" };
        else if (input.key === "ArrowDown") action = { type: "next-project" };
        else if (input.key === "n") action = { type: "add-project" };
        else if (input.key >= "1" && input.key <= "9")
          action = { type: "switch-project", index: parseInt(input.key) - 1 };
        else if (input.key === "," || input.key === "<") action = { type: "reload-config" };
        else if (input.key === "i") action = { type: "toggle-devtools" };
      } else {
        if (input.key === "k" && panelType === "terminal") {
          event.preventDefault();
          view.webContents.send("terminal:clear");
          return;
        }
        if (input.key === "ArrowLeft") action = { type: "focus-left" };
        else if (input.key === "ArrowRight") action = { type: "focus-right" };
        else if (input.key === "t") action = { type: "new-panel" };
        else if (input.key === "b") action = { type: "new-browser" };
        else if (input.key === "w") action = { type: "close-panel" };
        else if (input.key === "g") action = { type: "blur-panel" };
        else if (input.key === "r") action = { type: "reload-browser" };
        else if (input.key === "[") action = { type: "browser-back" };
        else if (input.key === "]") action = { type: "browser-forward" };
        else if (input.key >= "1" && input.key <= "9")
          action = { type: "jump-to", index: parseInt(input.key) - 1 };
        else if (input.key === "ArrowUp") action = { type: "prev-row" };
        else if (input.key === "ArrowDown") action = { type: "next-row" };
        else if (input.key === "n") action = { type: "new-row" };
        else if (input.key === "=" || input.key === "+") action = { type: "zoom-in" };
        else if (input.key === "-") action = { type: "zoom-out" };
        else if (input.key === "0") action = { type: "zoom-reset" };
      }

      if (action) {
        event.preventDefault();
        this.chromeView.webContents.send("shortcut:action", action);
      }
    };

    view.webContents.on("before-input-event", handleShortcutKey);

    // Terminal panels handle links via WebLinksAddon + openUrl IPC, so just
    // suppress any stray window.open() calls. Browser panels route target="_blank"
    // to create new strip panels.
    view.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
      if (panelType === "browser") {
        this.chromeView.webContents.send("browser:open-url", { url: targetUrl });
      }
      return { action: "deny" };
    });

    if (panelType === "browser") {
      view.webContents.on("context-menu", (_event, params) => {
        const menuItems: Electron.MenuItemConstructorOptions[] = [];

        if (params.linkURL) {
          menuItems.push(
            {
              label: "Open Link in Browser Panel",
              click: () => {
                this.chromeView.webContents.send("browser:open-url", { url: params.linkURL });
              },
            },
            {
              label: "Copy Link Address",
              click: () => {
                clipboard.writeText(params.linkURL);
              },
            },
            { type: "separator" },
          );
        }

        if (params.hasImageContents) {
          menuItems.push(
            {
              label: "Copy Image",
              click: () => {
                view.webContents.copyImageAt(params.x, params.y);
              },
            },
            {
              label: "Save Image As\u2026",
              click: () => {
                view.webContents.downloadURL(params.srcURL);
              },
            },
          );
          if (params.srcURL) {
            menuItems.push({
              label: "Open Image in Browser Panel",
              click: () => {
                this.chromeView.webContents.send("browser:open-url", { url: params.srcURL });
              },
            });
          }
          menuItems.push({ type: "separator" });
        }

        if (params.selectionText) {
          menuItems.push({ label: "Copy", role: "copy" }, { type: "separator" });
        }

        if (params.isEditable) {
          menuItems.push(
            { label: "Cut", role: "cut" },
            { label: "Paste", role: "paste" },
            { type: "separator" },
          );
        }

        menuItems.push(
          { label: "Select All", role: "selectAll" },
          { type: "separator" },
          {
            label: "Back",
            enabled: view.webContents.navigationHistory.canGoBack(),
            click: () => {
              view.webContents.navigationHistory.goBack();
            },
          },
          {
            label: "Forward",
            enabled: view.webContents.navigationHistory.canGoForward(),
            click: () => {
              view.webContents.navigationHistory.goForward();
            },
          },
          { type: "separator" },
          {
            label: "Inspect Element",
            click: () => {
              view.webContents.inspectElement(params.x, params.y);
            },
          },
        );

        Menu.buildFromTemplate(menuItems).popup();
      });
    }

    if (panelType === "terminal") {
      if (process.env.ELECTRON_RENDERER_URL) {
        void view.webContents.loadURL(
          `${process.env.ELECTRON_RENDERER_URL}/terminal/index.html?panelId=${id}`,
        );
      } else {
        void view.webContents.loadFile(join(__dirname, "../renderer/terminal/index.html"), {
          query: { panelId: id },
        });
      }
    } else if (panelType === "browser") {
      const url = "url" in options ? options.url : "about:blank";
      void view.webContents.loadURL(url);

      // Create the chrome strip view for browser panels
      const chromeStripView = new WebContentsView({
        webPreferences: {
          preload: join(__dirname, "../preload/browser.js"),
          sandbox: false,
        },
      });

      if (process.env.ELECTRON_RENDERER_URL) {
        void chromeStripView.webContents.loadURL(
          `${process.env.ELECTRON_RENDERER_URL}/browser/browser-host.html?panelId=${id}&url=${encodeURIComponent(url)}`,
        );
      } else {
        void chromeStripView.webContents.loadFile(
          join(__dirname, "../renderer/browser/browser-host.html"),
          {
            query: { panelId: id, url },
          },
        );
      }

      chromeStripView.webContents.on("before-input-event", handleShortcutKey);

      chromeStripView.webContents.on("focus", () => {
        this.chromeView.webContents.send("panel:focused", { panelId: id });
      });

      // Track URL changes → update address bar in chrome view and chrome strip view.
      // Nav state (canGoBack/canGoForward) is included in the same message so the
      // renderer store updates atomically and the reactive sendChromeState effect
      // never overwrites correct values with stale ones.
      const sendNavUpdate = (_event: Electron.Event, navUrl: string): void => {
        const canGoBack = view.webContents.navigationHistory.canGoBack();
        const canGoForward = view.webContents.navigationHistory.canGoForward();
        this.chromeView.webContents.send("browser:url-changed", {
          panelId: id,
          url: navUrl,
          canGoBack,
          canGoForward,
        });
        chromeStripView.webContents.send("panel:chrome-state", {
          url: navUrl,
          canGoBack,
          canGoForward,
          faviconUrl: null,
        });
      };
      view.webContents.on("did-navigate", sendNavUpdate);
      view.webContents.on("did-navigate-in-page", sendNavUpdate);

      // Forward page <title> to chrome view so the title bar shows the real title
      view.webContents.on("page-title-updated", (_event, title) => {
        this.chromeView.webContents.send("browser:title-changed", { panelId: id, title });
        chromeStripView.webContents.send("panel:chrome-state", { label: title });
      });

      // Forward favicon to chrome strip — prefer smallest icon for the 16px display
      view.webContents.on("page-favicon-updated", (_event, favicons) => {
        chromeStripView.webContents.send("panel:chrome-state", {
          faviconUrl: sanitizeFaviconUrl(pickBestFavicon(favicons)),
        });
      });

      // Loading state → animate dot grid in chrome strip
      view.webContents.on("did-start-loading", () => {
        chromeStripView.webContents.send("panel:chrome-state", { busy: true });
      });
      view.webContents.on("did-stop-loading", () => {
        chromeStripView.webContents.send("panel:chrome-state", { busy: false });
      });

      // Replay cached chrome state once chrome strip finishes loading
      chromeStripView.webContents.once("did-finish-load", () => {
        const cached = this.pendingChromeState.get(id);
        if (cached) chromeStripView.webContents.send("panel:chrome-state", cached);
      });

      this.window.contentView.addChildView(chromeStripView);
      this.window.contentView.addChildView(view);
      this.panels.set(id, { id, type: panelType, view, chromeView: chromeStripView });
    } else {
      const color = "color" in options ? options.color : "#333";
      view.setBackgroundColor(color);
      void view.webContents.loadURL(
        `data:text/html,<html><body style="margin:0;background:${encodeURIComponent(color)};height:100vh"></body></html>`,
      );
    }

    // When a panel gains focus via click, notify chrome view so it can update focusedIndex
    view.webContents.on("focus", () => {
      this.chromeView.webContents.send("panel:focused", { panelId: id });
    });

    // Replay cached chrome state once views finish loading (state may arrive before scripts run)
    const replayOnLoad = (wc: Electron.WebContents): void => {
      wc.once("did-finish-load", () => {
        const cached = this.pendingChromeState.get(id);
        if (cached) wc.send("panel:chrome-state", cached);
      });
    };
    replayOnLoad(view.webContents);

    if (panelType !== "browser") {
      this.window.contentView.addChildView(view);
      this.panels.set(id, { id, type: panelType, view });
    }
  }

  navigateBrowser(id: string, url: string): void {
    const panel = this.panels.get(id);
    if (panel?.type !== "browser") return;
    void panel.view.webContents.loadURL(url);
  }

  reloadBrowser(id: string): void {
    const panel = this.panels.get(id);
    if (panel?.type !== "browser") return;
    panel.view.webContents.reload();
  }

  goBackBrowser(id: string): void {
    const panel = this.panels.get(id);
    if (panel?.type !== "browser") return;
    panel.view.webContents.navigationHistory.goBack();
  }

  goForwardBrowser(id: string): void {
    const panel = this.panels.get(id);
    if (panel?.type !== "browser") return;
    panel.view.webContents.navigationHistory.goForward();
  }

  toggleBrowserDevTools(id: string): void {
    const panel = this.panels.get(id);
    if (panel?.type !== "browser") return;
    panel.view.webContents.toggleDevTools();
  }

  zoomPanel(id: string, direction: "in" | "out" | "reset", config: FlywheelConfig): void {
    const panel = this.panels.get(id);
    if (!panel) return;

    if (panel.type === "terminal") {
      const currentSize = this.terminalFontSizes.get(id) ?? config.preferences.terminal.fontSize;
      let newSize: number;
      if (direction === "in") newSize = currentSize + 1;
      else if (direction === "out") newSize = Math.max(6, currentSize - 1);
      else newSize = config.preferences.terminal.fontSize;
      this.terminalFontSizes.set(id, newSize);
      panel.view.webContents.send("terminal:set-font-size", { fontSize: newSize });
    } else if (panel.type === "browser") {
      const wc = panel.view.webContents;
      if (direction === "in") wc.setZoomLevel(wc.getZoomLevel() + 1);
      else if (direction === "out") wc.setZoomLevel(wc.getZoomLevel() - 1);
      else wc.setZoomLevel(config.preferences.browser.defaultZoom);
    }
  }

  destroyPanel(id: string): void {
    const panel = this.panels.get(id);
    if (!panel) return;
    this.window.contentView.removeChildView(panel.view);
    panel.view.webContents.close();
    if (panel.chromeView) {
      this.window.contentView.removeChildView(panel.chromeView);
      panel.chromeView.webContents.close();
    }
    this.terminalFontSizes.delete(id);
    this.lastClipState.delete(id);
    this.panels.delete(id);
    this.pendingChromeState.delete(id);
  }

  updateBounds(
    updates: {
      panelId: string;
      bounds: { x: number; y: number; width: number; height: number };
      visible: boolean;
    }[],
  ): void {
    const sw = this._sidebarWidth;
    for (const update of updates) {
      const panel = this.panels.get(update.panelId);
      if (!panel) continue;
      if (update.visible) {
        const { y, height } = update.bounds;
        const fullWidth = update.bounds.width;
        let { x, width } = update.bounds;
        let clip = 0;
        if (sw > 0 && x < sw) {
          clip = sw - x;
          x = sw;
          width = Math.max(0, fullWidth - clip);
        }
        if (width <= 0) {
          panel.view.setVisible(false);
          if (panel.chromeView) panel.chromeView.setVisible(false);
          continue;
        }

        if (panel.chromeView) {
          const chromeHeight = LAYOUT.PANEL_CHROME_HEIGHT;
          panel.chromeView.setBounds({ x, y, width, height: chromeHeight });
          panel.chromeView.setVisible(true);
          panel.view.setBounds({ x, y: y + chromeHeight, width, height: height - chromeHeight });
        } else {
          panel.view.setBounds({ x, y, width, height });
        }
        panel.view.setVisible(true);

        // Tell terminals to fix their container width so xterm.js keeps its
        // column count while the view narrows during sidebar clipping.
        if (panel.type === "terminal" && this.lastClipState.get(update.panelId) !== clip) {
          this.lastClipState.set(update.panelId, clip);
          panel.view.webContents.send("terminal:set-clip", { clip, fullWidth });
        }
      } else {
        panel.view.setVisible(false);
        if (panel.chromeView) {
          panel.chromeView.setVisible(false);
        }
      }
    }
  }

  getPanelView(id: string): WebContentsView | null {
    return this.panels.get(id)?.view ?? null;
  }

  getPanelChromeView(id: string): WebContentsView | null {
    return this.panels.get(id)?.chromeView ?? null;
  }

  get panelCount(): number {
    return this.panels.size;
  }

  sendChromeState(
    id: string,
    state: {
      position: number;
      label: string;
      focused: boolean;
      type: string;
      url?: string;
      canGoBack?: boolean;
      canGoForward?: boolean;
      busy?: boolean;
    },
  ): void {
    this.pendingChromeState.set(id, state);
    const panel = this.panels.get(id);
    if (!panel) return;
    if (panel.chromeView) {
      panel.chromeView.webContents.send("panel:chrome-state", state);
    }
    panel.view.webContents.send("panel:chrome-state", state);
  }

  hideAll(): void {
    for (const panel of this.panels.values()) {
      panel.view.setVisible(false);
      if (panel.chromeView) {
        panel.chromeView.setVisible(false);
      }
    }
  }

  hideByPrefix(prefix: string): void {
    for (const panel of this.panels.values()) {
      if (panel.id.startsWith(prefix)) {
        panel.view.setVisible(false);
        if (panel.chromeView) panel.chromeView.setVisible(false);
      }
    }
  }

  showByPrefix(prefix: string): void {
    for (const panel of this.panels.values()) {
      if (panel.id.startsWith(prefix)) {
        panel.view.setVisible(true);
        if (panel.chromeView) panel.chromeView.setVisible(true);
      }
    }
  }

  destroyByPrefix(prefix: string): void {
    for (const id of [...this.panels.keys()]) {
      if (id.startsWith(prefix)) this.destroyPanel(id);
    }
  }

  showAll(): void {
    for (const panel of this.panels.values()) {
      panel.view.setVisible(true);
      if (panel.chromeView) {
        panel.chromeView.setVisible(true);
      }
    }
  }

  destroyAll(): void {
    for (const id of [...this.panels.keys()]) {
      this.destroyPanel(id);
    }
  }

  broadcastConfig(config: FlywheelConfig): void {
    for (const panel of this.panels.values()) {
      if (panel.type === "terminal") {
        panel.view.webContents.send("config:updated", config);
      }
    }
  }
}
