import type { Webview } from 'vscode'
import { ExtensionMode, Uri } from 'vscode'
import {
  computed,
  extensionContext as context,
  createSingletonComposable,
  executeCommand,
  ref,
  useWebviewView,
} from 'reactive-vscode'

import { useDiffTreeView } from './diff/DiffTreeView'

import { useGitService } from '@/git'
import { useStorage } from '@/storage'
import { CHANNEL, EXTENSION_SYMBOL, WEBVIEW_CHANNEL } from '@/constant'

import type { Commit, CommitGraph } from '@/git'

function getNonce() {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  return text
}

export const useGitPanelView = createSingletonComposable(() => {
  const git = useGitService()
  const storage = useStorage()

  const extensionUri = Uri.file(__dirname)

  if (!extensionUri) {
    throw new Error('Extension context not initialized')
  }

  const gitChangesProvider = useDiffTreeView()
  const commits = ref<CommitGraph>(storage.getCommits())

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
            await refreshHistory(message.forceRefresh)
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

          case WEBVIEW_CHANNEL.CLEAR_HISTORY:
            storage.clearCommits()
            break
        }
      },
    },
  )

  async function refreshHistory(forceRefresh: boolean = false) {
    try {
      if (commits.value.logResult.total === 0 || forceRefresh) {
        const { logResult, operations, branches } = await git.getHistory()
        commits.value = {
          logResult: {
            all: Array.from(logResult.all),
            total: logResult.total,
            latest: null,
          },
          operations,
          branches,
        }
        storage.saveCommits({ operations, branches, logResult })
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

  return {
    viewType: `${EXTENSION_SYMBOL}.history` as const,
    refreshHistory,
    forceRefresh,
  }
})
