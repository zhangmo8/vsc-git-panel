import type { Webview } from 'vscode'
import { ExtensionMode, Uri, window } from 'vscode'
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
  | { command: typeof WEBVIEW_CHANNEL.GET_STASH_LIST }
  | { command: typeof WEBVIEW_CHANNEL.APPLY_STASH, ref: string }
  | { command: typeof WEBVIEW_CHANNEL.POP_STASH, ref: string }
  | { command: typeof WEBVIEW_CHANNEL.DROP_STASH, ref: string }
  | { command: typeof WEBVIEW_CHANNEL.CLEAR_STASH }
  | { command: typeof WEBVIEW_CHANNEL.SHOW_STASH_DIFF, ref: string }
  | {
    command: typeof WEBVIEW_CHANNEL.SHOW_STASH_DETAILS
    ref: string
    message?: string
    branch?: string
    date?: string
    authorName?: string
    authorEmail?: string
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

          case WEBVIEW_CHANNEL.GET_STASH_LIST:
            await refreshStashList()
            break

          case WEBVIEW_CHANNEL.APPLY_STASH:
            await handleStashAction(message.ref, 'apply')
            break

          case WEBVIEW_CHANNEL.POP_STASH:
            await handleStashAction(message.ref, 'pop')
            break

          case WEBVIEW_CHANNEL.DROP_STASH:
            await handleStashAction(message.ref, 'drop')
            break

          case WEBVIEW_CHANNEL.CLEAR_STASH:
            await handleClearStash()
            break

          case WEBVIEW_CHANNEL.SHOW_STASH_DIFF:
            await showStashDiff(message.ref)
            break

          case WEBVIEW_CHANNEL.SHOW_STASH_DETAILS:
            try {
              await gitChangesProvider.refreshStash({
                ref: message.ref,
                message: message.message,
                branch: message.branch,
                date: message.date,
                authorName: message.authorName,
                authorEmail: message.authorEmail,
              })
              await executeCommand('git-panel.changes.focus')
            }
            catch (error) {
              const errorMessage = formatError(error)
              logger.error('Failed to show stash details:', error)
              postMessage({
                command: CHANNEL.ERROR,
                message: `Failed to show stash details: ${errorMessage}`,
              })
            }
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

  async function refreshStashList() {
    try {
      const stashes = await git.getStashList()
      logger.info(`refreshStashList: ${stashes.length} entries`)
      postMessage({
        command: CHANNEL.STASH_LIST,
        stashes,
      })
    }
    catch (error) {
      const errorMessage = formatError(error)
      logger.error('Failed to get stash list:', error)
      postMessage({
        command: CHANNEL.ERROR,
        message: `Failed to load stash list: ${errorMessage}`,
      })
    }
  }

  async function handleStashAction(stashRef: string, action: 'apply' | 'pop' | 'drop') {
    try {
      switch (action) {
        case 'apply': {
          await git.applyStash(stashRef)
          const choice = await window.showInformationMessage(
            `Stash ${stashRef} applied. Review changes in Source Control.`,
            'Open Source Control',
          )
          if (choice === 'Open Source Control') {
            await executeCommand('workbench.view.scm')
          }
          break
        }
        case 'pop': {
          const confirm = await window.showWarningMessage(
            `Pop ${stashRef}? The stash will be applied and then removed.`,
            { modal: true },
            'Pop',
          )
          if (confirm !== 'Pop')
            return
          await git.popStash(stashRef)
          const choice = await window.showInformationMessage(
            `Stash ${stashRef} popped. Review changes in Source Control.`,
            'Open Source Control',
          )
          if (choice === 'Open Source Control') {
            await executeCommand('workbench.view.scm')
          }
          break
        }
        case 'drop': {
          const confirm = await window.showWarningMessage(
            `Drop ${stashRef}? This action cannot be undone.`,
            { modal: true },
            'Drop',
          )
          if (confirm !== 'Drop')
            return
          await git.dropStash(stashRef)
          window.showInformationMessage(`Stash ${stashRef} dropped`)
          break
        }
      }
      await refreshStashList()
    }
    catch (error) {
      const errorMessage = formatError(error)
      logger.error(`Failed to ${action} stash:`, error)
      const looksLikeConflict = /conflict|merge|already exists/i.test(errorMessage)
      const hint = looksLikeConflict
        ? ' Resolve conflicts in your working tree before retrying.'
        : ''
      window.showErrorMessage(`Failed to ${action} stash: ${errorMessage}${hint}`)
      postMessage({
        command: CHANNEL.ERROR,
        message: `Failed to ${action} stash: ${errorMessage}`,
      })
      // Refresh anyway: pop may have partially run
      await refreshStashList()
    }
  }

  async function handleClearStash() {
    try {
      const confirm = await window.showWarningMessage(
        'Drop all stash entries? This action cannot be undone.',
        { modal: true },
        'Drop All',
      )
      if (confirm !== 'Drop All')
        return
      await git.clearStash()
      window.showInformationMessage('All stash entries dropped')
      await refreshStashList()
    }
    catch (error) {
      const errorMessage = formatError(error)
      logger.error('Failed to clear stash:', error)
      window.showErrorMessage(`Failed to clear stash: ${errorMessage}`)
    }
  }

  async function showStashDiff(stashRef: string) {
    try {
      const stat = await git.getStashStat(stashRef)
      postMessage({
        command: CHANNEL.STASH_ACTION_RESULT,
        action: 'show-diff',
        ref: stashRef,
        stat,
      })
    }
    catch (error) {
      const errorMessage = formatError(error)
      logger.error('Failed to show stash diff:', error)
      postMessage({
        command: CHANNEL.ERROR,
        message: `Failed to load stash diff: ${errorMessage}`,
      })
    }
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
    refreshStashList,
  }
})
