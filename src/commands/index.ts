import { useCommands } from 'reactive-vscode'

import refreshCommand from './refresh'
import diffCommand from './diff'

import type { DiffTreeView } from '@/views/diff'
import { EXTENSION_SYMBOL } from '@/constant'

interface CommandProvider {
  diffProvider: DiffTreeView
}

export function initCommands({ diffProvider }: CommandProvider) {
  useCommands({
    [`${EXTENSION_SYMBOL}.history.refresh`]: refreshCommand,
    [`${EXTENSION_SYMBOL}.openDiff`]: diffCommand(diffProvider),
  })
}
