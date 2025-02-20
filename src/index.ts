import { Disposable } from 'vscode'
import { defineExtension, useDisposable } from 'reactive-vscode'

import { useGitPanelView } from './views/webview'
import { useDiffTreeView } from './views/diff/DiffTreeView'
import { logger } from './utils'
import { initCommands } from './commands'
import { initDecoration } from './decoration'
import { useStorage } from './storage'
import { useGitChangeMonitor } from './git/GitChangeMonitor'

const { activate, deactivate } = defineExtension(() => {
  logger.info('Git Panel Activated')

  useStorage().clearCommits()
  useGitPanelView()
  const { tree } = useDiffTreeView()

  const gitChangeMonitor = useGitChangeMonitor()

  initDecoration()
  initCommands()

  useDisposable(new Disposable(() => {
    tree.dispose()
    gitChangeMonitor.dispose()
  }))
})

export { activate, deactivate }
