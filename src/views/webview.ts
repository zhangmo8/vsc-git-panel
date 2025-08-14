import type { Webview } from 'vscode'
import { ExtensionMode, Uri, workspace } from 'vscode'
import {
  computed,
  extensionContext as context,
  createSingletonComposable,
  executeCommand,
  ref,
  toRaw,
  useWebviewView,
  watchEffect,
} from 'reactive-vscode'

import { useDiffTreeView } from './diff/DiffTreeView'

import { useGitService } from '@/git'
import { CHANNEL, EXTENSION_SYMBOL, WEBVIEW_CHANNEL } from '@/constant'
import { logger } from '@/utils'

import type { CommitGraph, GitHistoryFilter } from '@/git'

function getNonce() {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  return text
}

export const useGitPanelView = createSingletonComposable(() => {
  const git = useGitService()

  const extensionUri = Uri.file(__dirname)

  if (!extensionUri) {
    throw new Error('Extension context not initialized')
  }

  const gitChangesProvider = useDiffTreeView()
  const commits = ref<CommitGraph>({
    operations: [],
    branches: [],
    logResult: {
      all: [],
      total: 0,
      latest: null,
    },
  })

  const isDev = context.value?.extensionMode === ExtensionMode.Development

  function getHtml(webview: Webview | undefined) {
    if (!webview)
      return ''

    const scriptUri = isDev
      ? 'http://localhost:5173/src/views/history/index.ts'
      : webview.asWebviewUri(Uri.joinPath(extensionUri, 'views.es.js'))

    const styleUri = isDev
      ? null
      : webview.asWebviewUri(Uri.joinPath(extensionUri, 'views.css'))

    const nonce = getNonce()

    return `<!doctype html>
            <html lang="en">
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Git Panel</title>
                ${isDev ? '' : `<link rel="stylesheet" type="text/css" href="${styleUri}">`}
                <style>
                  body {
                    margin: 0;
                    padding: 0;
                  }
                  
                  * {
                    box-sizing: border-box;
                    -moz-box-sizing: border-box;
                    -webkit-box-sizing: border-box;
                  }
                </style>
              </head>
              <body>
                <div id="app"></div>
                <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
              </body>
            </html>`
  }

  const { forceRefresh, view, postMessage } = useWebviewView(
    `${EXTENSION_SYMBOL}.history`,
    computed(() => getHtml(view.value?.webview)),
    {
      retainContextWhenHidden: true,
      webviewOptions: {
        enableScripts: true,
        enableCommandUris: true,
        localResourceRoots: [
          Uri.joinPath(extensionUri, '../'),
          Uri.joinPath(extensionUri),
        ],
      },
      onDidReceiveMessage: async (message) => {
        switch (message.command) {
          case WEBVIEW_CHANNEL.GET_HISTORY:
            await refreshHistory(message.forceRefresh, message.filter)
            break

          case WEBVIEW_CHANNEL.GET_ALL_BRANCHES:
            await getRepoBranches()
            break

          case WEBVIEW_CHANNEL.SHOW_COMMIT_DETAILS:
            try {
              const hashes: string[] = JSON.parse(message.commitHashes)
              ;(await gitChangesProvider).refresh(hashes)
            }
            catch (error) {
              postMessage({
                command: 'Failed to show commit details',
                message: `${error}`,
              })
            }
            break

          case WEBVIEW_CHANNEL.SHOW_CHANGES_PANEL:
            await executeCommand('git-panel.changes.focus')
            break
        }
      },
    },
  )

  async function refreshHistory(_forceRefresh: boolean = false, filter?: GitHistoryFilter) {
    try {
      // 直接从Git获取数据，不使用缓存
      const { logResult, operations, branches } = await git.getHistory(filter)
      commits.value = {
        logResult: {
          all: Array.from(logResult.all),
          total: logResult.total,
          latest: null,
        },
        operations,
        branches,
      }

      postMessage({
        command: CHANNEL.HISTORY,
        commits: commits.value,
      })
    }
    catch (error) {
      postMessage({
        command: 'Failed to get git history',
        message: `${error}`,
      })
    }
  }

  async function getRepoBranches() {
    try {
      const branches = await git.getAllBranches()

      postMessage({
        command: CHANNEL.BRANCHES,
        branches,
      })
    }
    catch (error) {
      postMessage({
        command: 'Failed to get git branches',
        message: `${error}`,
      })
    }
  }

  function clearSelection() {
    postMessage({ command: CHANNEL.CLEAR_SELECTED })
    gitChangesProvider.clearSelection()
  }

  return {
    viewType: `${EXTENSION_SYMBOL}.history` as const,
    refreshHistory,
    postMessage,
    forceRefresh,
    getRepoBranches,
    clearSelection,
  }
})
