import * as vscode from 'vscode'

import { GitPanelViewProvider } from './views/webview'
import { DiffProvider } from './views/diff'

import { GitService } from './git'
import { StorageService } from './storage'
import { logger } from './utils'

import { initCommands } from './commands'

export function activate(context: vscode.ExtensionContext) {
  logger.info('Git Panel Activated')

  const storageService = StorageService.initialize(context)
  storageService.clearCommits()

  const gitService = new GitService()

  const provider = new GitPanelViewProvider(vscode.Uri.file(__dirname), gitService)
  vscode.window.registerWebviewViewProvider(GitPanelViewProvider.viewType, provider)

  const diffProvider = DiffProvider.getInstance()
  vscode.window.createTreeView('git-panel.changes', {
    treeDataProvider: diffProvider,
    showCollapseAll: true,
  })

  initCommands(context, { gitService, diffProvider, provider })
}
