import type * as vscode from 'vscode'

import refreshCommand from './refresh'
import diffCommand from './diff'

import type { GitService } from '@/git'
import type { DiffProvider } from '@/views/diff'
import type { GitPanelViewProvider } from '@/views/webview'

interface CommandProvider {
  gitService: GitService
  diffProvider: DiffProvider
  provider: GitPanelViewProvider
}

export function initCommands(context: vscode.ExtensionContext, { gitService, diffProvider, provider }: CommandProvider) {
  context.subscriptions.push(
    refreshCommand(provider),
    diffCommand(gitService, diffProvider),
  )
}
