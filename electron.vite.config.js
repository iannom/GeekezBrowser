import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.js'),
          'chromium-path': resolve(__dirname, 'src/main/chromium-path.js'),
          'close-behavior': resolve(__dirname, 'src/main/close-behavior.js'),
          'profile-copy': resolve(__dirname, 'src/main/profile-copy.js'),
          'xray-assets': resolve(__dirname, 'src/main/xray-assets.js'),
          'xray-runtime': resolve(__dirname, 'src/main/xray-runtime.js')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.js')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue()]
  }
})
