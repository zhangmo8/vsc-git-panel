import { Disposable } from 'vscode'
import { defineExtension, useDisposable } from 'reactive-vscode'

import { useGitPanelView } from './views/webview'
import { useDiffTreeView } from './views/diff/DiffTreeView'
import { useFileHistoryTreeView } from './views/fileHistory'
import { logger } from './utils'
import { initCommands } from './commands'
import { initDecoration } from './decoration'
import { initLineHistory } from './lineHistory'
import { useGitChangeMonitor } from './git/GitChangeMonitor'

const { activate, deactivate } = defineExtension(() => {
  logger.info('Git Panel Activated')

  useGitPanelView()
  const { tree } = useDiffTreeView()
  const { tree: fileHistoryTree } = useFileHistoryTreeView()

  const gitChangeMonitor = useGitChangeMonitor()

  initDecoration()
  initLineHistory()
  initCommands()

  useDisposable(new Disposable(() => {
    tree.dispose()
    fileHistoryTree.dispose()
    gitChangeMonitor.dispose()
  }))
})

export { activate, deactivate }
