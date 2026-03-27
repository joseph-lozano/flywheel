import { defineConfig } from "electron-vite";
import { resolve } from "path";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ["node-pty"],
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
          panel: resolve(__dirname, "src/preload/panel.ts"),
          browser: resolve(__dirname, "src/preload/browser.ts"),
          "browser-content": resolve(__dirname, "src/preload/browser-content.ts"),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src"),
    plugins: [solidPlugin()],
    server: {
      strictPort: false,
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
          terminal: resolve(__dirname, "src/terminal/index.html"),
          "browser-host": resolve(__dirname, "src/browser/browser-host.html"),
        },
      },
    },
  },
});
