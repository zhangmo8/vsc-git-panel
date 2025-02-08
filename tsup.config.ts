import { resolve } from 'node:path'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
  ],
  format: ['cjs'],
  shims: true,
  dts: false,
  external: [
    'vscode',
  ],
  noExternal: [
    'simple-git'
  ],
  esbuildOptions(options) {
    options.alias = {
      '@': resolve(__dirname, './src'),
    }
  },
})
