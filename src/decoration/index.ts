import type { ExtensionContext } from 'vscode'
import { window } from 'vscode'
import { extensionContext as context } from 'reactive-vscode'

import { FileNodeDecorationProvider } from './FileNodeDecoration'

export function initDecoration() {
  // guard against duplicate registration when extension reloads
  if ((context.value as ExtensionContext | undefined)?.subscriptions.some(s => (s as any)?._providerName === 'FileNodeDecorationProvider'))
    return

  const fileNodeDecorationProvider = new FileNodeDecorationProvider()
  ;(fileNodeDecorationProvider as any)._providerName = 'FileNodeDecorationProvider'

  context.value?.subscriptions.push(
    window.registerFileDecorationProvider(fileNodeDecorationProvider),
  )
}
