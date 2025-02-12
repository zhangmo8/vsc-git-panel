import type { ExtensionContext } from 'vscode'
import { Uri, window } from 'vscode'

import { GitPanelViewProvider } from './views/webview'
import { DiffTreeView } from './views/diff'
import { GitService } from './git'
import { StorageService } from './storage'
import { logger } from './utils'
import { initCommands } from './commands'
import { EXTENSION_SYMBOL } from './constant'
import { initDecoration } from './decoration'

export function activate(context: ExtensionContext) {
  logger.info('Git Panel Activated')

  const storageService = StorageService.initialize(context)
  storageService.clearCommits()

  const gitService = new GitService()

  const provider = new GitPanelViewProvider(Uri.file(__dirname), gitService, context)
  window.registerWebviewViewProvider(GitPanelViewProvider.viewType, provider)

  const diffProvider = DiffTreeView.getInstance()
  window.createTreeView(`${EXTENSION_SYMBOL}.changes`, {
    treeDataProvider: diffProvider,
    showCollapseAll: true,
  })

  initDecoration(context)
  initCommands(context, { gitService, diffProvider, provider })
}
