import * as vscode from 'vscode'

import { GitPanelViewProvider } from './views/webview'
import { GitChangesProvider } from './views/diff'
import { GitService } from './git'
import { DiffViewService } from './views/diff/DiffViewService'

import { logger } from './utils'

export function activate(context: vscode.ExtensionContext) {
  logger.info('Git Panel Activated')

  const gitService = new GitService()
  const diffViewService = DiffViewService.initialize(gitService)

  const provider = new GitPanelViewProvider(vscode.Uri.file(__dirname), context, gitService)
  vscode.window.registerWebviewViewProvider(GitPanelViewProvider.viewType, provider)

  const gitChangesProvider = GitChangesProvider.getInstance()
  vscode.window.createTreeView('git-panel.changes', {
    treeDataProvider: gitChangesProvider,
    showCollapseAll: true,
  })

  context.subscriptions.push({
    dispose: () => {
      diffViewService.dispose()
    },
  })
}
