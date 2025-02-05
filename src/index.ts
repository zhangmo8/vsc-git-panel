import { defineExtension } from 'reactive-vscode'
import * as vscode from 'vscode'

import { GitPanelViewProvider } from './views/webview'

import { logger } from './utils'

export function activate(context: vscode.ExtensionContext) {
  logger.info('Git Panel Activated')
  const provider = new GitPanelViewProvider(vscode.Uri.file(__dirname), context)
  vscode.window.registerWebviewViewProvider(GitPanelViewProvider.viewType, provider)
}

export function deactivate() {
  // Clean up resources
}
