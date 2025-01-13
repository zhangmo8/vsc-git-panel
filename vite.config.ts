import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [vue()],
  build: {
    lib: {
      entry: './src/views/index.ts',
      formats: ['es'],
      fileName: format => `views.${format}.js`,
    },
    emptyOutDir: false,
    outDir: 'dist',
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env': '{}',
    'process': '{}',
  },
})
