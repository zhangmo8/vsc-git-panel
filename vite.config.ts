import { resolve } from 'node:path'
import process from 'node:process'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    '__VUE_OPTIONS_API__': false,
    '__VUE_PROD_DEVTOOLS__': false,
  },
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    cors: true,
    hmr: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
  build: {
    lib: {
      entry: './src/views/history/index.ts',
      formats: ['es'],
      fileName: format => `views.${format}.js`,
    },
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames: 'views.css'
      }
    },
    emptyOutDir: false,
    outDir: 'dist',
  },
})
