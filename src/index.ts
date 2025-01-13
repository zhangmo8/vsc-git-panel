import { defineExtension } from 'reactive-vscode'
import * as vscode from 'vscode'

import { GitPanelViewProvider } from './container/webview'

import { logger } from './utils'

const { activate, deactivate } = defineExtension(async () => {
  logger.info('Git Panel Activated')
  const provider = new GitPanelViewProvider(vscode.Uri.file(__dirname))
  vscode.window.registerWebviewViewProvider(GitPanelViewProvider.viewType, provider)
})

export { activate, deactivate }
