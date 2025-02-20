import { Disposable, window } from 'vscode'
import { defineExtension, useDisposable } from 'reactive-vscode'

import { useGitPanelView } from './views/webview'
import { DiffTreeView } from './views/diff'
import { logger } from './utils'
import { initCommands } from './commands'
import { EXTENSION_SYMBOL } from './constant'
import { initDecoration } from './decoration'
import { useStorage } from './storage'
import { useGitChangeMonitor } from './git/GitChangeMonitor'

const { activate, deactivate } = defineExtension(() => {
  logger.info('Git Panel Activated')

  useStorage().clearCommits()
  useGitPanelView()
  const gitChangeMonitor = useGitChangeMonitor()

  const diffProvider = DiffTreeView.getInstance()
  window.createTreeView(`${EXTENSION_SYMBOL}.changes`, {
    treeDataProvider: diffProvider,
    showCollapseAll: true,
  })

  initDecoration()
  initCommands({ diffProvider })

  useDisposable(new Disposable(gitChangeMonitor.dispose))
})

export { activate, deactivate }
