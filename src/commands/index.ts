import { useCommands } from 'reactive-vscode'

import refreshCommand from './refresh'
import diffCommand from './diff'
import clearCommand from './clear'
import copyHashCommand from './copyHash'
import showStatsCommand from './showStats'

import { EXTENSION_SYMBOL } from '@/constant'

let _commandsInitialized = false

export function initCommands() {
  if (_commandsInitialized)
    return

  _commandsInitialized = true

  useCommands({
    [`${EXTENSION_SYMBOL}.history.refresh`]: refreshCommand,
    [`${EXTENSION_SYMBOL}.openDiff`]: diffCommand(),
    [`${EXTENSION_SYMBOL}.history.clear`]: clearCommand,
    [`${EXTENSION_SYMBOL}.copyHash`]: copyHashCommand,
    [`${EXTENSION_SYMBOL}.showStats`]: showStatsCommand,
  })
}
