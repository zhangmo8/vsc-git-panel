import { executeCommand, useCommands } from 'reactive-vscode'

import refreshCommand from './refresh'
import diffCommand from './diff'
import clearCommand from './clear'
import copyHashCommand from './copyHash'
import openCommitOnWebCommand from './openCommitOnWeb'
import openCommitDiffCommand from './openCommitDiff'
import showStatsCommand from './showStats'
import goToCommitCommand from './goToCommit'
import backToHeadCommand from './backToHead'

import { EXTENSION_SYMBOL, HISTORY_VIEW_ID } from '@/constant'
import { logger } from '@/utils'
import { useFileHistory } from '@/views/fileHistory'
import { useGitPanelView } from '@/views/webview'

let _commandsInitialized = false

export function initCommands() {
  if (_commandsInitialized)
    return

  _commandsInitialized = true
  const fileHistory = useFileHistory()
  useCommands({
    [`${EXTENSION_SYMBOL}.history`]: async () => {
      logger.info(`[command] focus ${HISTORY_VIEW_ID}`)
      await executeCommand(`${HISTORY_VIEW_ID}.focus`)
    },
    [`${EXTENSION_SYMBOL}.history.refresh`]: refreshCommand,
    [`${EXTENSION_SYMBOL}.openDiff`]: diffCommand(),
    [`${EXTENSION_SYMBOL}.history.clear`]: clearCommand,
    [`${EXTENSION_SYMBOL}.copyHash`]: copyHashCommand,
    [`${EXTENSION_SYMBOL}.openCommitOnWeb`]: openCommitOnWebCommand,
    [`${EXTENSION_SYMBOL}.openCommitDiff`]: openCommitDiffCommand,
    [`${EXTENSION_SYMBOL}.showStats`]: showStatsCommand,
    [`${EXTENSION_SYMBOL}.goToCommit`]: goToCommitCommand,
    [`${EXTENSION_SYMBOL}.backToHead`]: backToHeadCommand,
    [`${EXTENSION_SYMBOL}.showFileHistory`]: async (resource?: unknown) => {
      const shown = await fileHistory.showFileHistory(resource)
      if (shown)
        await useGitPanelView().postFileHistory(true)
    },
    [`${EXTENSION_SYMBOL}.showLineHistory`]: async (resource?: unknown) => {
      const shown = await fileHistory.showLineHistory(resource)
      if (shown)
        await useGitPanelView().postFileHistory(true)
    },
  })
}
