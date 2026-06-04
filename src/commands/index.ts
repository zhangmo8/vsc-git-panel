import { executeCommand, useCommands } from 'reactive-vscode'

import refreshCommand from './refresh'
import diffCommand from './diff'
import clearCommand from './clear'
import copyHashCommand from './copyHash'
import showStatsCommand from './showStats'
import goToCommitCommand from './goToCommit'
import backToHeadCommand from './backToHead'

import { CHANGES_VIEW_ID, EXTENSION_SYMBOL, HISTORY_VIEW_ID } from '@/constant'
import { logger } from '@/utils'
import { useDiffTreeView } from '@/views/diff'
import { useFileHistoryTreeView } from '@/views/fileHistory'

let _commandsInitialized = false

export function initCommands() {
  if (_commandsInitialized)
    return

  _commandsInitialized = true
  const fileHistory = useFileHistoryTreeView()
  const diffTree = useDiffTreeView()

  useCommands({
    [`${EXTENSION_SYMBOL}.history`]: async () => {
      logger.info(`[command] focus ${HISTORY_VIEW_ID}`)
      await executeCommand(`${HISTORY_VIEW_ID}.focus`)
    },
    [`${EXTENSION_SYMBOL}.history.refresh`]: refreshCommand,
    [`${EXTENSION_SYMBOL}.openDiff`]: diffCommand(),
    [`${EXTENSION_SYMBOL}.history.clear`]: clearCommand,
    [`${EXTENSION_SYMBOL}.copyHash`]: copyHashCommand,
    [`${EXTENSION_SYMBOL}.showStats`]: showStatsCommand,
    [`${EXTENSION_SYMBOL}.goToCommit`]: goToCommitCommand,
    [`${EXTENSION_SYMBOL}.backToHead`]: backToHeadCommand,
    [`${EXTENSION_SYMBOL}.showFileHistory`]: fileHistory.showFileHistory,
    [`${EXTENSION_SYMBOL}.showLineHistory`]: fileHistory.showLineHistory,
    [`${EXTENSION_SYMBOL}.fileHistory.refresh`]: () => fileHistory.refresh(true),
    [`${EXTENSION_SYMBOL}.fileHistory.loadMore`]: fileHistory.loadMore,
    [`${EXTENSION_SYMBOL}.fileHistory.showFile`]: () => fileHistory.setMode('file'),
    [`${EXTENSION_SYMBOL}.fileHistory.showLine`]: () => fileHistory.setMode('line'),
    [`${EXTENSION_SYMBOL}.fileHistory.follow`]: () => fileHistory.setFollowing(true),
    [`${EXTENSION_SYMBOL}.fileHistory.pin`]: () => fileHistory.setFollowing(false),
    [`${EXTENSION_SYMBOL}.fileHistory.openCommit`]: async (hash: string) => {
      await diffTree.refresh([hash])
      await executeCommand(`${CHANGES_VIEW_ID}.focus`)
    },
  })
}
