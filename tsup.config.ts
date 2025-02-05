import { resolve } from 'node:path'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
  ],
  format: ['cjs'],
  shims: false,
  dts: false,
  external: [
    'vscode',
  ],
  esbuildOptions(options) {
    options.alias = {
      '@': resolve(__dirname, './src'),
    }
  },
})
