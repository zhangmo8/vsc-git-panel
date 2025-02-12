import type { ExtensionContext } from 'vscode'

import refreshCommand from './refresh'
import diffCommand from './diff'

import type { GitService } from '@/git'
import type { DiffTreeView } from '@/views/diff'
import type { GitPanelViewProvider } from '@/views/webview'

interface CommandProvider {
  gitService: GitService
  diffProvider: DiffTreeView
  provider: GitPanelViewProvider
}

export function initCommands(context: ExtensionContext, { gitService, diffProvider, provider }: CommandProvider) {
  context.subscriptions.push(
    refreshCommand(provider),
    diffCommand(gitService, diffProvider),
  )
}
