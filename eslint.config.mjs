// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: [
      'dist',
      'node_modules',
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      'generated',
    ],
  },
  {
    rules: {
      // overrides
    },
  },
)
