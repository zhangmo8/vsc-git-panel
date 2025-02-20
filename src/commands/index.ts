import { useCommands } from 'reactive-vscode'

import refreshCommand from './refresh'
import diffCommand from './diff'

import type { DiffTreeView } from '@/views/diff'
import type { GitPanelViewProvider } from '@/views/webview'
import { EXTENSION_SYMBOL } from '@/constant'

interface CommandProvider {
  diffProvider: DiffTreeView
  provider: GitPanelViewProvider
}

export function initCommands({ diffProvider, provider }: CommandProvider) {
  useCommands({
    [`${EXTENSION_SYMBOL}.history.refresh`]: refreshCommand(provider),
    [`${EXTENSION_SYMBOL}.openDiff`]: diffCommand(diffProvider),
  })
}
