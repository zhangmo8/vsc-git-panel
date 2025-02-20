import { Uri, window } from 'vscode'
import { defineExtension } from 'reactive-vscode'

import { GitPanelViewProvider } from './views/webview'
import { DiffTreeView } from './views/diff'
import { logger } from './utils'
import { initCommands } from './commands'
import { EXTENSION_SYMBOL } from './constant'
import { initDecoration } from './decoration'
import { useStorage } from './storage'

const { activate, deactivate } = defineExtension(() => {
  logger.info('Git Panel Activated')

  const storage = useStorage()
  storage.clearCommits()

  const provider = new GitPanelViewProvider(Uri.file(__dirname))
  window.registerWebviewViewProvider(GitPanelViewProvider.viewType, provider)

  const diffProvider = DiffTreeView.getInstance()
  window.createTreeView(`${EXTENSION_SYMBOL}.changes`, {
    treeDataProvider: diffProvider,
    showCollapseAll: true,
  })

  initDecoration()
  initCommands({ diffProvider, provider })
})

export { activate, deactivate }
