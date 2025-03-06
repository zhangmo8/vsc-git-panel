import { useCommands } from 'reactive-vscode'

import refreshCommand from './refresh'
import diffCommand from './diff'
import clearCommand from './clear'

import { EXTENSION_SYMBOL } from '@/constant'

export function initCommands() {
  useCommands({
    [`${EXTENSION_SYMBOL}.history.refresh`]: refreshCommand,
    [`${EXTENSION_SYMBOL}.openDiff`]: diffCommand(),
    [`${EXTENSION_SYMBOL}.history.clear`]: clearCommand,
  })
}
