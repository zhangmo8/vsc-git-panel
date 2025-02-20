import type { ExtensionContext } from 'vscode'
import { window } from 'vscode'
import { extensionContext as context } from 'reactive-vscode'

import { FileNodeDecorationProvider } from './FileNodeDecoration'

export function initDecoration() {
  const fileNodeDecorationProvider = new FileNodeDecorationProvider()

  context.value?.subscriptions.push(
    window.registerFileDecorationProvider(fileNodeDecorationProvider),
  )
}
