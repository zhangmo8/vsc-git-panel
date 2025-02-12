import type { ExtensionContext } from 'vscode'
import { window } from 'vscode'

import { FileNodeDecorationProvider } from './FileNodeDecoration'

export function initDecoration(context: ExtensionContext) {
  const fileNodeDecorationProvider = new FileNodeDecorationProvider()

  context.subscriptions.push(
    window.registerFileDecorationProvider(fileNodeDecorationProvider),
  )
}
