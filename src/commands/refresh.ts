import { commands } from 'vscode'

import type { GitPanelViewProvider } from '@/views/webview'
import { EXTENSION_SYMBOL } from '@/constant'

export default function refreshCommand(provider: GitPanelViewProvider) {
  return commands.registerCommand(`${EXTENSION_SYMBOL}.history.refresh`, () => {
    provider.refreshHistory(true)
  })
}
