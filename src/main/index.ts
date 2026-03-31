import { randomUUID } from "crypto";
import { app, BaseWindow, dialog, ipcMain, Menu, WebContentsView } from "electron";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { goldenAngleColor } from "../shared/constants";
import type { Project, Row } from "../shared/types";
import { initAutoUpdater } from "./auto-updater";
import { ConfigManager } from "./config-manager";
import { filterDiscoveredWorktrees } from "./discover";
import { fixPath } from "./fix-path";
import { runCleanupHook } from "./hooks";
import { PanelManager, sanitizeBrowserUrl } from "./panel-manager";
import { createPrStatus } from "./pr-status";
import { ProjectStore } from "./project-store";
import { PtyManager } from "./pty-manager";
import { removeProjectTransactional, removeRowTransactional } from "./remove";
import { installScripts } from "./scripts";
import { WorktreeManager } from "./worktree-manager";

let mainWindow: BaseWindow;
let chromeView: WebContentsView;
let panelManager: PanelManager;
let ptyManager: PtyManager;
let projectStore: ProjectStore;
let worktreeManager: WorktreeManager;
let configManager: ConfigManager;
let prStatusChecker: ReturnType<typeof createPrStatus>;

async function createWindow(): Promise<void> {
  worktreeManager = new WorktreeManager();

  let title = "Flywheel";
  if (process.env.ELECTRON_RENDERER_URL) {
    try {
      const branch = await worktreeManager.getDefaultBranch(process.cwd());
      title = `Flywheel [${branch}]`;
    } catch {
      title = "Flywheel [dev]";
    }
  }

  let allowQuit = false;
  let closePending = false;

  mainWindow = new BaseWindow({
    width: 1200,
    height: 800,
    show: false,
    title,
  });

  chromeView = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.contentView.addChildView(chromeView);

  const { width, height } = mainWindow.getContentBounds();
  chromeView.setBounds({ x: 0, y: 0, width, height });

  if (process.env.ELECTRON_RENDERER_URL) {
    void chromeView.webContents.loadURL(`${process.env.ELECTRON_RENDERER_URL}/renderer/index.html`);
  } else {
    void chromeView.webContents.loadFile(join(__dirname, "../renderer/renderer/index.html"));
  }

  panelManager = new PanelManager(mainWindow, chromeView);

  ptyManager = new PtyManager(
    (panelId, channel, data) => {
      const view = panelManager.getPanelView(panelId);
      if (view) view.webContents.send(channel, data);
    },
    (channel, data) => {
      chromeView.webContents.send(channel, data);
    },
  );

  projectStore = new ProjectStore();
  configManager = new ConfigManager();
  prStatusChecker = createPrStatus();

  setupIpcHandlers();
  setupShortcuts();

  mainWindow.on("resize", () => {
    const bounds = mainWindow.getContentBounds();
    chromeView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
  });

  chromeView.webContents.once("did-finish-load", () => {
    const activeId = projectStore.getActiveProjectId();
    if (activeId) {
      const project = projectStore.getProjects().find((p) => p.id === activeId);
      if (project) configManager.load(project.path);
    }
    mainWindow.show();
  });

  mainWindow.on("close", (e) => {
    if (allowQuit) {
      ptyManager.dispose();
      panelManager.destroyAll();
      return;
    }

    e.preventDefault();

    if (closePending) return;
    closePending = true;

    void dialog
      .showMessageBox(mainWindow, {
        type: "question",
        message: "Quit Flywheel?",
        detail: "Any running terminal processes will be terminated.",
        buttons: ["Cancel", "Quit"],
        defaultId: 0,
        cancelId: 0,
      })
      .then(({ response }) => {
        closePending = false;
        if (response === 1) {
          allowQuit = true;
          app.quit();
        }
      });
  });
}

function setupIpcHandlers(): void {
  ipcMain.on(
    "panel:create",
    (_event, data: { id: string; color?: string; type?: string; url?: string }) => {
      if (data.type === "terminal") {
        panelManager.createPanel(data.id, { type: "terminal" });
      } else if (data.type === "browser") {
        const safeUrl = sanitizeBrowserUrl(data.url ?? null) ?? "about:blank";
        panelManager.createPanel(data.id, { type: "browser", url: safeUrl });
      } else {
        panelManager.createPanel(data.id, { color: data.color ?? "#333" });
      }
    },
  );

  ipcMain.on("panel:destroy", (_event, id: string) => {
    ptyManager.kill(id);
    panelManager.destroyPanel(id);
  });

  ipcMain.on(
    "panel:update-bounds",
    (
      _event,
      updates: {
        panelId: string;
        bounds: { x: number; y: number; width: number; height: number };
        visible: boolean;
      }[],
      sidebarWidth?: number,
    ) => {
      if (sidebarWidth != null) panelManager.sidebarWidth = sidebarWidth;
      panelManager.updateBounds(updates);
    },
  );

  ipcMain.on("panel:wheel", (_event, data: { deltaX: number }) => {
    chromeView.webContents.send("scroll:wheel", data);
  });

  ipcMain.handle("debug:stats", () => {
    const mem = process.memoryUsage();
    return {
      panelViewCount: panelManager.panelCount,
      mainMemoryMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    };
  });

  // PTY handlers
  ipcMain.on("pty:create", (_event, data: { panelId: string; cwd?: string; runHook?: boolean }) => {
    let hookCommand: string | undefined;
    if (data.runHook && data.cwd) {
      const project = projectStore
        .getProjects()
        .find((p) => p.rows.some((r) => r.path === data.cwd));
      if (project) {
        hookCommand = configManager.getForProject(project.path).hooks?.onWorktreeCreate;
      }
    }
    ptyManager.create(data.panelId, data.cwd, hookCommand);
  });

  ipcMain.on("pty:input", (_event, data: { panelId: string; data: string }) => {
    ptyManager.write(data.panelId, data.data);
  });

  ipcMain.on("pty:resize", (_event, data: { panelId: string; cols: number; rows: number }) => {
    ptyManager.resize(data.panelId, data.cols, data.rows);
  });

  ipcMain.on("terminal:drop-files", (_event, data: { panelId?: unknown; paths?: unknown }) => {
    if (typeof data.panelId !== "string" || data.panelId.length === 0) return;
    if (
      !Array.isArray(data.paths) ||
      !data.paths.every((path): path is string => typeof path === "string")
    ) {
      return;
    }
    if (!ptyManager.hasPty(data.panelId)) return;
    ptyManager.dropFiles(data.panelId, data.paths);
  });

  // Terminal clear (from chrome shortcut handler)
  ipcMain.on("terminal:clear", (_event, data: { panelId: string }) => {
    const view = panelManager.getPanelView(data.panelId);
    if (view) view.webContents.send("terminal:clear");
  });

  // Browser navigation
  ipcMain.on("browser:navigate", (_event, data: { panelId: string; url: string }) => {
    const safeUrl = sanitizeBrowserUrl(data.url);
    if (!safeUrl) return;
    panelManager.navigateBrowser(data.panelId, safeUrl);
  });

  ipcMain.on("browser:reload", (_event, data: { panelId: string }) => {
    panelManager.reloadBrowser(data.panelId);
  });

  ipcMain.on("browser:go-back", (_event, data: { panelId: string }) => {
    panelManager.goBackBrowser(data.panelId);
  });

  ipcMain.on("browser:go-forward", (_event, data: { panelId: string }) => {
    panelManager.goForwardBrowser(data.panelId);
  });

  ipcMain.on("browser:toggle-devtools", (_event, data: { panelId: string }) => {
    panelManager.toggleBrowserDevTools(data.panelId);
  });

  // Browser host chrome strip → navigate
  ipcMain.on("browser:navigate-from-host", (_event, data: { panelId: string; url: string }) => {
    const safeUrl = sanitizeBrowserUrl(data.url);
    if (!safeUrl) return;
    panelManager.navigateBrowser(data.panelId, safeUrl);
  });

  // Chrome view → send chrome state to a panel's views
  ipcMain.on(
    "panel:send-chrome-state",
    (
      _event,
      data: {
        panelId: string;
        position: number;
        label: string;
        focused: boolean;
        type: string;
        url?: string;
        canGoBack?: boolean;
        canGoForward?: boolean;
        busy?: boolean;
      },
    ) => {
      // Enrich terminal panels with busy state from PTY
      if (data.type === "terminal") {
        data.busy = ptyManager.isBusy(data.panelId);
      }
      panelManager.sendChromeState(data.panelId, data);
    },
  );

  // Terminal link detection → open as browser panel
  ipcMain.on("browser:open-url-from-terminal", (_event, data: { url: string }) => {
    const safeUrl = sanitizeBrowserUrl(data.url);
    if (!safeUrl) return;
    chromeView.webContents.send("browser:open-url", { url: safeUrl });
  });

  // Close confirmation flow
  ipcMain.on("panel:close-request", (_event, data: { panelId: string }) => {
    // Browser panels have no PTY — close immediately
    if (!ptyManager.hasPty(data.panelId)) {
      panelManager.destroyPanel(data.panelId);
      chromeView.webContents.send("panel:closed", { panelId: data.panelId });
      return;
    }

    if (ptyManager.isBusy(data.panelId)) {
      const processName = ptyManager.getForegroundProcess(data.panelId) ?? "unknown";
      void dialog
        .showMessageBox(mainWindow, {
          type: "warning",
          message: `Process "${processName}" is running. Close anyway?`,
          buttons: ["Cancel", "Close"],
          defaultId: 0,
          cancelId: 0,
        })
        .then(({ response }) => {
          if (response === 1) {
            ptyManager.kill(data.panelId);
            panelManager.destroyPanel(data.panelId);
            chromeView.webContents.send("pty:exit", { panelId: data.panelId, exitCode: -1 });
          }
        });
    } else {
      // kill() sets disposed=true before calling pty.kill(), which suppresses the
      // real onExit callback. We must send a synthetic pty:exit so the chrome view
      // knows to remove the panel from the store.
      ptyManager.kill(data.panelId);
      panelManager.destroyPanel(data.panelId);
      chromeView.webContents.send("pty:exit", { panelId: data.panelId, exitCode: 0 });
    }
  });

  // Native context menus (rendered above WebContentsViews, unlike DOM overlays)
  ipcMain.handle("context-menu:project", async () => {
    type Action = "new-row" | "discover" | "remove" | "cancel";
    return new Promise<{ action: Action }>((resolve) => {
      const template: Electron.MenuItemConstructorOptions[] = [
        {
          label: "New Row",
          click: () => {
            resolve({ action: "new-row" });
          },
        },
        {
          label: "Discover Worktrees",
          click: () => {
            resolve({ action: "discover" });
          },
        },
        { type: "separator" },
        {
          label: "Remove Project",
          click: () => {
            resolve({ action: "remove" });
          },
        },
      ];
      const menu = Menu.buildFromTemplate(template);
      menu.popup({
        window: mainWindow,
        callback: () => {
          resolve({ action: "cancel" });
        },
      });
    });
  });

  ipcMain.handle("context-menu:row", async () => {
    return new Promise<{ action: "remove" | "cancel" }>((resolve) => {
      const template: Electron.MenuItemConstructorOptions[] = [
        {
          label: "Remove Row",
          click: () => {
            resolve({ action: "remove" });
          },
        },
      ];
      const menu = Menu.buildFromTemplate(template);
      menu.popup({
        window: mainWindow,
        callback: () => {
          resolve({ action: "cancel" });
        },
      });
    });
  });

  // Native dialog: remove row confirmation
  ipcMain.handle("dialog:remove-row", async () => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "question",
      message: "Remove this worktree row?",
      buttons: ["Cancel", "Remove from Flywheel", "Remove and delete from disk"],
      defaultId: 0,
      cancelId: 0,
    });
    if (response === 1) return { action: "remove" as const };
    if (response === 2) return { action: "delete" as const };
    return { action: "cancel" as const };
  });

  // Native dialog: remove project confirmation
  ipcMain.handle("dialog:remove-project", async () => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "question",
      message: "This project has worktree rows. Delete them from disk?",
      buttons: ["Cancel", "Remove from Flywheel", "Remove and delete worktrees"],
      defaultId: 0,
      cancelId: 0,
    });
    if (response === 1) return { action: "remove" as const };
    if (response === 2) return { action: "delete" as const };
    return { action: "cancel" as const };
  });

  // Native dialog: missing row
  ipcMain.handle("dialog:missing-row", async (_event, data: { branch: string }) => {
    const branch = typeof data.branch === "string" ? data.branch : "unknown";
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      message: "Worktree not found",
      detail: `The directory for "${branch}" no longer exists on disk.`,
      buttons: ["Cancel", "Remove Row"],
      defaultId: 0,
      cancelId: 0,
    });
    return { confirmed: response === 1 };
  });

  // Focus management
  ipcMain.on("panel:focus", (_event, data: { panelId: string }) => {
    const view = panelManager.getPanelView(data.panelId);
    if (view) view.webContents.focus();
  });

  ipcMain.on("panel:focus-chrome", (_event, data: { panelId: string }) => {
    const view = panelManager.getPanelChromeView(data.panelId);
    if (view) view.webContents.focus();
  });

  ipcMain.on("panel:blur-all", () => {
    chromeView.webContents.focus();
  });

  ipcMain.on("panel:hide-all", () => {
    panelManager.hideAll();
  });

  ipcMain.on("panel:show-all", () => {
    panelManager.showAll();
  });

  // Project management
  ipcMain.handle("project:add", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Add Project",
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const dirPath = result.filePaths[0];

    let defaultBranch = "main";
    try {
      defaultBranch = await worktreeManager.getDefaultBranch(dirPath);
    } catch {
      // Not a git repo or no branch — use 'main'
    }

    const project = projectStore.addProject(dirPath, defaultBranch);
    return project;
  });

  ipcMain.handle(
    "project:remove",
    async (_event, data: { projectId: string; deleteWorktrees: boolean }) => {
      const project = projectStore.getProjects().find((p) => p.id === data.projectId);
      return await removeProjectTransactional(project, data.deleteWorktrees, {
        removeWorktree: (projectPath, worktreePath) => {
          return worktreeManager.removeWorktree(projectPath, worktreePath);
        },
        cleanupRow: (rowId) => {
          ptyManager.killByPrefix(rowId);
          panelManager.destroyByPrefix(rowId);
        },
        removeRow: (projectId, rowId) => {
          projectStore.removeRow(projectId, rowId);
        },
        removeProject: (projectId) => {
          projectStore.removeProject(projectId);
        },
      });
    },
  );

  ipcMain.on("project:switch", (_event, data: { projectId: string }) => {
    projectStore.setActiveProjectId(data.projectId);
    const project = projectStore.getProjects().find((p) => p.id === data.projectId);
    if (project) {
      configManager.load(project.path);
      chromeView.webContents.send("config:updated", configManager.get());
      panelManager.broadcastConfig(configManager.get());
    }
  });

  ipcMain.handle("project:list", () => {
    return {
      projects: projectStore.getProjects(),
      activeProjectId: projectStore.getActiveProjectId(),
    };
  });

  // Prefix-based panel management
  ipcMain.on("panel:hide-by-prefix", (_event, data: { prefix: string }) => {
    panelManager.hideByPrefix(data.prefix);
  });

  ipcMain.on("panel:show-by-prefix", (_event, data: { prefix: string }) => {
    panelManager.showByPrefix(data.prefix);
  });

  ipcMain.on("panel:set-sidebar-width", (_event, data: { width: number }) => {
    panelManager.sidebarWidth = data.width;
  });

  ipcMain.on("panel:destroy-by-prefix", (_event, data: { prefix: string }) => {
    panelManager.destroyByPrefix(data.prefix);
  });

  ipcMain.on("project:set-expanded", (_event, data: { projectId: string; expanded: boolean }) => {
    projectStore.setExpanded(data.projectId, data.expanded);
  });

  ipcMain.handle("row:check-path", (_event, data: { path: string }) => {
    return { exists: existsSync(data.path) };
  });

  // Row management
  ipcMain.handle("row:create", async (_event, data: { projectId: string }) => {
    const project = projectStore.getProjects().find((p) => p.id === data.projectId);
    if (!project) return { error: "Project not found" };

    const isGit = await worktreeManager.isGitRepo(project.path);
    if (!isGit) return { error: "Not a git repository" };

    const name = worktreeManager.generateName(projectStore.nextWorktreeCounter());
    const worktreePath = worktreeManager.getWorktreePath(project.name, name);

    try {
      const base = await worktreeManager.resolveBase(project.path);
      await worktreeManager.createWorktree(project.path, name, worktreePath, base);
    } catch (err) {
      return { error: `Failed to create worktree: ${(err as Error).message}` };
    }

    const row: Row = {
      id: randomUUID(),
      projectId: project.id,
      branch: name,
      path: worktreePath,
      color: goldenAngleColor(project.rows.length),
      isDefault: false,
    };

    projectStore.addRow(project.id, row);
    projectStore.setActiveRowId(project.id, row.id);

    return { row };
  });

  ipcMain.handle("row:remove", async (_event, data: { rowId: string; deleteFromDisk: boolean }) => {
    const projects = projectStore.getProjects();
    let targetProject: Project | undefined;
    let targetRow: Row | undefined;

    for (const p of projects) {
      const row = p.rows.find((r) => r.id === data.rowId);
      if (row) {
        targetProject = p;
        targetRow = row;
        break;
      }
    }

    return await removeRowTransactional(targetProject, targetRow, data.deleteFromDisk, {
      removeWorktree: async (projectPath, worktreePath) => {
        const hookCommand = configManager.getForProject(projectPath).hooks?.onWorktreeRemove;
        const hookResult = await runCleanupHook(hookCommand, worktreePath);
        if (!hookResult.ok) {
          chromeView.webContents.send("toast", {
            message: `Cleanup hook failed: ${hookResult.error}`,
            type: "error",
          });
        }
        return worktreeManager.removeWorktree(projectPath, worktreePath);
      },
      cleanupRow: (rowId) => {
        ptyManager.killByPrefix(rowId);
        panelManager.destroyByPrefix(rowId);
      },
      removeRow: (projectId, rowId) => {
        projectStore.removeRow(projectId, rowId);
      },
    });
  });

  ipcMain.handle("row:discover", async (_event, data: { projectId: string }) => {
    const project = projectStore.getProjects().find((p) => p.id === data.projectId);
    if (!project) return { rows: [] };

    const [worktrees, prStatuses] = await Promise.all([
      worktreeManager.listWorktrees(project.path),
      prStatusChecker.fetchPrStatuses(project.path),
    ]);

    const newRows = filterDiscoveredWorktrees(project, worktrees, prStatuses);
    for (const row of newRows) {
      projectStore.addRow(project.id, row);
    }

    return { rows: newRows };
  });

  ipcMain.handle("row:check-branches", async (_event, data: { projectId: string }) => {
    const project = projectStore.getProjects().find((p) => p.id === data.projectId);
    if (!project) return { updates: [] };

    const worktrees = await worktreeManager.listWorktrees(project.path);
    const pathToBranch = new Map(worktrees.map((wt) => [wt.path, wt.branch]));
    const updates: { rowId: string; branch: string }[] = [];

    for (const row of project.rows) {
      const currentBranch = pathToBranch.get(row.path);
      if (currentBranch && currentBranch !== row.branch) {
        updates.push({ rowId: row.id, branch: currentBranch });
        projectStore.updateRowBranch(project.id, row.id, currentBranch);
      }
    }

    return { updates };
  });

  ipcMain.handle("row:check-pr-status", async (_event, data: { projectId: string }) => {
    const project = projectStore.getProjects().find((p) => p.id === data.projectId);
    if (!project) return { updates: [] };

    const [statuses, repoUrl] = await Promise.all([
      prStatusChecker.fetchPrStatuses(project.path),
      prStatusChecker.fetchRepoUrl(project.path),
    ]);
    const updates = project.rows.map((row) => {
      const pr = statuses.get(row.branch);
      return {
        rowId: row.id,
        prStatus: pr?.status,
        prUrl: pr?.url,
        prNumber: pr?.number,
      };
    });

    return { updates, repoUrl };
  });

  ipcMain.on(
    "panel:zoom",
    (
      _event,
      data: { panelId: string; direction: "in" | "out" | "reset"; defaultValue?: number },
    ) => {
      panelManager.zoomPanel(data.panelId, data.direction, configManager.get());
    },
  );

  // Config management
  ipcMain.handle("config:get-all", () => {
    return configManager.get();
  });

  ipcMain.on("config:reload", () => {
    const project = projectStore
      .getProjects()
      .find((p) => p.id === projectStore.getActiveProjectId());
    if (project) {
      configManager.load(project.path);
    } else {
      configManager.reload();
    }
    const config = configManager.get();
    chromeView.webContents.send("config:updated", config);
    panelManager.broadcastConfig(config);
  });
}

function setupShortcuts(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "Flywheel",
      submenu: [{ role: "quit" }],
    },
    {
      label: "Panels",
      submenu: [
        {
          label: "Focus Left",
          accelerator: "Command+Left",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "focus-left" });
          },
        },
        {
          label: "Focus Right",
          accelerator: "Command+Right",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "focus-right" });
          },
        },
        {
          label: "Swap Left",
          accelerator: "Command+Shift+Left",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "swap-left" });
          },
        },
        {
          label: "Swap Right",
          accelerator: "Command+Shift+Right",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "swap-right" });
          },
        },
        { type: "separator" },
        {
          label: "New Terminal",
          accelerator: "CommandOrControl+T",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "new-panel" });
          },
        },
        {
          label: "New Browser",
          accelerator: "CommandOrControl+B",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "new-browser" });
          },
        },
        {
          label: "Clear Terminal",
          accelerator: "CommandOrControl+K",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "clear-terminal" });
          },
        },
        {
          label: "Close Panel",
          accelerator: "CommandOrControl+W",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "close-panel" });
          },
        },
        {
          label: "Blur Panel",
          accelerator: "CommandOrControl+G",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "blur-panel" });
          },
        },
        { type: "separator" },
        ...Array.from({ length: 9 }, (_, i) => ({
          label: `Jump to Panel ${i + 1}`,
          accelerator: `CommandOrControl+${i + 1}`,
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "jump-to", index: i });
          },
        })),
      ],
    },
    {
      label: "Projects",
      submenu: [
        {
          label: "Add Project",
          accelerator: "CommandOrControl+Shift+N",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "add-project" });
          },
        },
        { type: "separator" },
        {
          label: "Previous Project",
          accelerator: "Command+Shift+Up",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "prev-project" });
          },
        },
        {
          label: "Next Project",
          accelerator: "Command+Shift+Down",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "next-project" });
          },
        },
        { type: "separator" },
        ...Array.from({ length: 9 }, (_, i) => ({
          label: `Switch to Project ${i + 1}`,
          accelerator: `CommandOrControl+Shift+${i + 1}`,
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "switch-project", index: i });
          },
        })),
      ],
    },
    {
      label: "Rows",
      submenu: [
        {
          label: "New Worktree Row",
          accelerator: "CommandOrControl+N",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "new-row" });
          },
        },
        { type: "separator" },
        {
          label: "Previous Row",
          accelerator: "Command+Up",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "prev-row" });
          },
        },
        {
          label: "Next Row",
          accelerator: "Command+Down",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "next-row" });
          },
        },
      ],
    },
    {
      label: "Config",
      submenu: [
        {
          label: "Reload Config",
          accelerator: "Command+Shift+,",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "reload-config" });
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        { role: "selectAll" as const },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Reload Browser Panel",
          accelerator: "CommandOrControl+R",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "reload-browser" });
          },
        },
        {
          label: "Browser Back",
          accelerator: "Command+[",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "browser-back" });
          },
        },
        {
          label: "Browser Forward",
          accelerator: "Command+]",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "browser-forward" });
          },
        },
        {
          label: "Toggle Browser DevTools",
          accelerator: "CommandOrControl+Shift+I",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "toggle-devtools" });
          },
        },
        { type: "separator" as const },
        {
          label: "Zoom In",
          accelerator: "Command+=",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "zoom-in" });
          },
        },
        {
          label: "Zoom Out",
          accelerator: "Command+-",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "zoom-out" });
          },
        },
        {
          label: "Reset Zoom",
          accelerator: "Command+0",
          click: () => {
            chromeView.webContents.send("shortcut:action", { type: "zoom-reset" });
          },
        },
        { type: "separator" as const },
        { role: "forceReload" as const },
        { role: "toggleDevTools" as const },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Isolate dev instances to a separate userData directory
// so they can't corrupt production electron-store data
if (process.env.ELECTRON_RENDERER_URL) {
  app.setPath("userData", app.getPath("userData") + "-dev");
}

void app.whenReady().then(async () => {
  fixPath();
  installScripts(homedir());
  await createWindow();

  // Only check for updates in production builds
  if (!process.env.ELECTRON_RENDERER_URL) {
    initAutoUpdater();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
