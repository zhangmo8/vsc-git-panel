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

import type { Commit } from '@/git'

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

  const extensionUri = context.value?.extensionUri || Uri.file(context.value?.extensionPath || '')

  if (!extensionUri) {
    throw new Error('Extension context not initialized')
  }

  const gitChangesProvider = useDiffTreeView()
  const commits = ref<Commit[]>(storage.getCommits())

  const isDev = context.value?.extensionMode === ExtensionMode.Development
  const html = computed(() => {
    const scriptUri = isDev
      ? 'http://localhost:5173/src/views/history/index.ts'
      : Uri.joinPath(extensionUri, 'views.es.js')

    const styleUri = isDev
      ? null
      : Uri.joinPath(extensionUri, 'views.css')

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
  })

  const { forceRefresh: refreshWebview, postMessage } = useWebviewView(
    `${EXTENSION_SYMBOL}.history`,
    html,
    {
      retainContextWhenHidden: true,
      webviewOptions: {
        enableCommandUris: true,
        enableScripts: true,
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
              (await gitChangesProvider).refresh(message.commitHash)
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

          case 'clearHistory':
            storage.clearCommits()
            break
        }
      },
    },
  )

  async function refreshHistory(forceRefresh: boolean = false) {
    try {
      if (commits.value.length === 0 || forceRefresh) {
        const history = await git.getHistory()
        commits.value = Array.from(history.all)
        storage.saveCommits(commits.value)
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

  function forceRefresh() {
    refreshHistory(true)
    refreshWebview()
  }

  return {
    viewType: `${EXTENSION_SYMBOL}.history` as const,
    refreshHistory,
    forceRefresh,
  }
})
