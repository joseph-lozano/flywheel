import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          panel: resolve(__dirname, 'src/preload/panel.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [solidPlugin()]
  }
})
