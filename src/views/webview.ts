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
import { CHANNEL, EXTENSION_SYMBOL, WEBVIEW_CHANNEL } from '@/constant'
import { formatError, logger } from '@/utils'

import type { CommitGraph, GitHeadInfo, GitHistoryFilter } from '@/git'

type WebviewMessage =
  | {
      command: typeof WEBVIEW_CHANNEL.GET_HISTORY
      filter?: GitHistoryFilter
      forceRefresh?: boolean
      requestId?: number
      page?: number
      resetPage?: boolean
    }
  | {
      command: typeof WEBVIEW_CHANNEL.GET_ALL_BRANCHES
    }
  | {
      command: typeof WEBVIEW_CHANNEL.GET_ALL_AUTHORS
    }
  | {
      command: typeof WEBVIEW_CHANNEL.SHOW_COMMIT_DETAILS
      commitHashes: string
    }
  | {
      command: typeof WEBVIEW_CHANNEL.SHOW_CHANGES_PANEL
    }

function parseCommitHashes(rawHashes: string): string[] {
  const hashes = JSON.parse(rawHashes) as unknown

  if (!Array.isArray(hashes) || hashes.some(hash => typeof hash !== 'string')) {
    throw new TypeError('Invalid commit hashes payload')
  }

  return hashes
}

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
  const currentFilter = ref<GitHistoryFilter | undefined>(undefined)

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
      onDidReceiveMessage: async (message: WebviewMessage) => {
        switch (message.command) {
          case WEBVIEW_CHANNEL.GET_HISTORY:
            currentFilter.value = message.filter
            await refreshHistory(message.forceRefresh, message.filter, {
              requestId: message.requestId,
              page: message.page,
              resetPage: message.resetPage,
            })
            break

          case WEBVIEW_CHANNEL.GET_ALL_BRANCHES:
            await getRepoBranches()
            break

          case WEBVIEW_CHANNEL.GET_ALL_AUTHORS:
            await getRepoAuthors()
            break

          case WEBVIEW_CHANNEL.SHOW_COMMIT_DETAILS:
            try {
              const hashes = parseCommitHashes(message.commitHashes)
              await gitChangesProvider.refresh(hashes)
            }
            catch (error) {
              const errorMessage = formatError(error)
              logger.error('Failed to show commit details:', error)
              postMessage({
                command: CHANNEL.ERROR,
                message: `Failed to show commit details: ${errorMessage}`,
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

  async function refreshHistory(
    _forceRefresh: boolean = false,
    filter?: GitHistoryFilter,
    meta?: { requestId?: number, page?: number, resetPage?: boolean },
  ) {
    try {
      const filterToUse = filter !== undefined ? filter : currentFilter.value

      // Pass forceRefresh to git service to invalidate cache if needed
      const { logResult, operations, branches } = await git.getHistory(filterToUse, _forceRefresh)
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
        requestId: meta?.requestId,
        page: meta?.page,
        resetPage: meta?.resetPage,
      })
    }
    catch (error) {
      const errorMessage = formatError(error)
      logger.error('Failed to get git history:', error)
      postMessage({
        command: CHANNEL.ERROR,
        message: `Failed to load git history: ${errorMessage}`,
        requestId: meta?.requestId,
        page: meta?.page,
        resetPage: meta?.resetPage,
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
      const errorMessage = formatError(error)
      logger.error('Failed to get git branches:', error)
      postMessage({
        command: CHANNEL.ERROR,
        message: `Failed to load branches: ${errorMessage}`,
      })
    }
  }

  async function getRepoAuthors() {
    try {
      const authors = await git.getAllAuthors()

      postMessage({
        command: CHANNEL.AUTHORS,
        authors,
      })
    }
    catch (error) {
      const errorMessage = formatError(error)
      logger.error('Failed to get git authors:', error)
      postMessage({
        command: CHANNEL.ERROR,
        message: `Failed to load authors: ${errorMessage}`,
      })
    }
  }

  function clearSelection() {
    postMessage({ command: CHANNEL.CLEAR_SELECTED })
    gitChangesProvider.clearSelection()
  }

  async function backToHead(head: GitHeadInfo) {
    await gitChangesProvider.refresh([head.hash])
    postMessage({
      command: CHANNEL.BACK_TO_HEAD,
      head,
    })
  }

  return {
    viewType: `${EXTENSION_SYMBOL}.history` as const,
    refreshHistory,
    postMessage,
    forceRefresh,
    getRepoBranches,
    getRepoAuthors,
    clearSelection,
    backToHead,
  }
})
