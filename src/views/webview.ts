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
import { useFileHistory } from './fileHistory'

import { useGitService } from '@/git'
import { CHANNEL, HISTORY_VIEW_ID, PANEL_HISTORY_VIEW_ID, WEBVIEW_CHANNEL } from '@/constant'
import { formatError, logger } from '@/utils'

import type { CommitGraph, GitBranchAction, GitBranchRef, GitHeadInfo, GitHistoryFilter } from '@/git'

interface HistoryMessage {
  command: typeof WEBVIEW_CHANNEL.GET_HISTORY
  filter?: GitHistoryFilter
  forceRefresh?: boolean
  requestId?: number
  page?: number
  resetPage?: boolean
}

interface CommitDetailsMessage {
  command: typeof WEBVIEW_CHANNEL.SHOW_COMMIT_DETAILS
  commitHashes: string
}

interface StashDetailsMessage {
  command: typeof WEBVIEW_CHANNEL.SHOW_STASH_DETAILS
  ref: string
  message?: string
  branch?: string
  date?: string
  authorName?: string
  authorEmail?: string
}

type WebviewMessage =
  | HistoryMessage
  | { command: typeof WEBVIEW_CHANNEL.GET_ALL_BRANCHES }
  | { command: typeof WEBVIEW_CHANNEL.GET_ALL_AUTHORS }
  | CommitDetailsMessage
  | { command: typeof WEBVIEW_CHANNEL.SHOW_CHANGES_PANEL }
  | { command: typeof WEBVIEW_CHANNEL.GET_FILE_HISTORY, append?: boolean, forceRefresh?: boolean, followActive?: boolean }
  | { command: typeof WEBVIEW_CHANNEL.EXIT_FILE_HISTORY }
  | { command: typeof WEBVIEW_CHANNEL.GET_STASH_LIST }
  | { command: typeof WEBVIEW_CHANNEL.GET_GIT_REFS }
  | { command: typeof WEBVIEW_CHANNEL.FETCH_REMOTE, remote: string }
  | { command: typeof WEBVIEW_CHANNEL.RUN_BRANCH_ACTION, action: GitBranchAction, branch: GitBranchRef }
  | { command: typeof WEBVIEW_CHANNEL.APPLY_STASH, ref: string }
  | { command: typeof WEBVIEW_CHANNEL.POP_STASH, ref: string }
  | { command: typeof WEBVIEW_CHANNEL.DROP_STASH, ref: string }
  | { command: typeof WEBVIEW_CHANNEL.CLEAR_STASH }
  | { command: typeof WEBVIEW_CHANNEL.SHOW_STASH_DIFF, ref: string }
  | StashDetailsMessage

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
  const fileHistory = useFileHistory()
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
  const fileHistoryActive = ref(false)
  let fileHistoryRefreshTimer: ReturnType<typeof setTimeout> | undefined

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

  const {
    forceRefresh: refreshSidebarView,
    view: sidebarView,
    postMessage: postSidebarMessage,
  } = useWebviewView(
    HISTORY_VIEW_ID,
    computed(() => getHtml(sidebarView.value?.webview)),
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
      onDidReceiveMessage: handleWebviewMessage,
    },
  )

  const {
    forceRefresh: refreshPanelView,
    view: panelView,
    postMessage: postPanelMessage,
  } = useWebviewView(
    PANEL_HISTORY_VIEW_ID,
    computed(() => getHtml(panelView.value?.webview)),
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
      onDidReceiveMessage: handleWebviewMessage,
    },
  )

  function forceRefresh() {
    refreshSidebarView()
    refreshPanelView()
  }

  function postMessage(message: unknown) {
    postSidebarMessage(message)
    postPanelMessage(message)
  }

  async function focusBestHistoryView() {
    if (panelView.value?.visible) {
      await executeCommand(`${PANEL_HISTORY_VIEW_ID}.focus`)
      return
    }

    await executeCommand(`${HISTORY_VIEW_ID}.focus`)
  }

  async function handleWebviewMessage(message: WebviewMessage) {
    switch (message.command) {
      case WEBVIEW_CHANNEL.GET_HISTORY:
        currentFilter.value = message.filter
        await refreshHistory(message.forceRefresh, message.filter, {
          requestId: message.requestId,
          page: message.page,
          resetPage: message.resetPage,
        })
        queueFileHistoryPost()
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
        await gitChangesProvider.focusChangesView()
        break

      case WEBVIEW_CHANNEL.GET_FILE_HISTORY:
        await refreshFileHistory(message.forceRefresh, message.append, false, message.followActive)
        break

      case WEBVIEW_CHANNEL.EXIT_FILE_HISTORY:
        fileHistoryActive.value = false
        if (fileHistoryRefreshTimer) {
          clearTimeout(fileHistoryRefreshTimer)
          fileHistoryRefreshTimer = undefined
        }
        await fileHistory.setFollowing(false)
        break

      case WEBVIEW_CHANNEL.GET_STASH_LIST:
        await refreshStashList()
        break

      case WEBVIEW_CHANNEL.GET_GIT_REFS:
        await refreshGitRefs()
        break

      case WEBVIEW_CHANNEL.FETCH_REMOTE:
        await fetchRemote(message.remote)
        break

      case WEBVIEW_CHANNEL.RUN_BRANCH_ACTION:
        await handleBranchAction(message.action, message.branch)
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
          await gitChangesProvider.focusChangesView()
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
  }

  async function refreshHistory(
    _forceRefresh: boolean = false,
    filter?: GitHistoryFilter,
    meta?: { requestId?: number, page?: number, resetPage?: boolean },
  ) {
    try {
      const baseFilter = filter !== undefined ? filter : currentFilter.value

      // When no pagination meta is provided (git-change auto refresh, initial
      // load, jump-to-commit), reload from the first page and tell the webview
      // to reset. Only an explicit load-more (resetPage === false) appends, so
      // an accumulated list never gets a stale page appended onto it.
      const isReset = meta?.resetPage ?? true
      const responsePage = isReset ? 1 : (meta?.page ?? 1)
      const filterToUse = isReset
        ? { ...(baseFilter ?? {}), page: 1 }
        : baseFilter

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
        page: responsePage,
        resetPage: isReset,
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

  function queueFileHistoryPost() {
    if (!fileHistoryActive.value)
      return

    if (fileHistoryRefreshTimer)
      clearTimeout(fileHistoryRefreshTimer)

    fileHistoryRefreshTimer = setTimeout(() => {
      void refreshFileHistory(false, false, false, false).catch((error) => {
        logger.warn('Failed to post refreshed file history:', error)
      })
    }, 220)
  }

  async function refreshFileHistory(forceRefresh = true, append = false, activate = false, followActive = false) {
    fileHistoryActive.value = true

    if (followActive)
      await fileHistory.setFollowing(true)

    if (append)
      await fileHistory.loadMore()
    else
      await fileHistory.refresh(forceRefresh)

    if (activate)
      await focusBestHistoryView()

    postMessage({
      command: CHANNEL.FILE_HISTORY,
      active: true,
      commits: fileHistory.commits.value,
      lineBlame: fileHistory.lineBlame.value,
      loading: fileHistory.loading.value,
      error: fileHistory.error.value,
      hasMore: fileHistory.hasMore.value,
      target: fileHistory.target.value
        ? {
            relativePath: fileHistory.target.value.relativePath,
            isDirectory: fileHistory.target.value.isDirectory,
            lineRange: fileHistory.target.value.lineRange,
          }
        : null,
      mode: fileHistory.mode.value,
      following: fileHistory.following.value,
      title: fileHistory.title.value,
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

  async function refreshGitRefs() {
    try {
      const refs = await git.getGitRefs()
      postMessage({
        command: CHANNEL.GIT_REFS,
        refs,
      })
    }
    catch (error) {
      const errorMessage = formatError(error)
      logger.error('Failed to get git refs:', error)
      postMessage({
        command: CHANNEL.ERROR,
        message: `Failed to load branches and remotes: ${errorMessage}`,
      })
    }
  }

  async function fetchRemote(remoteName: string) {
    try {
      await git.fetchRemote(remoteName)
      await refreshGitRefs()
      window.showInformationMessage(`Fetched ${remoteName}`)
    }
    catch (error) {
      const errorMessage = formatError(error)
      logger.error(`Failed to fetch remote ${remoteName}:`, error)
      postMessage({
        command: CHANNEL.ERROR,
        message: `Failed to fetch ${remoteName}: ${errorMessage}`,
      })
      window.showErrorMessage(`Failed to fetch ${remoteName}: ${errorMessage}`)
    }
  }

  function getBranchBaseName(branch: GitBranchRef) {
    if (!branch.remote)
      return branch.name

    const prefix = `${branch.remote}/`
    return branch.name.startsWith(prefix)
      ? branch.name.slice(prefix.length)
      : branch.name
  }

  async function promptForBranchName(title: string, value: string) {
    const newName = await window.showInputBox({
      title,
      value,
      ignoreFocusOut: true,
      validateInput: (input) => {
        return input.trim() ? undefined : 'Branch name is required'
      },
    })

    return newName?.trim()
  }

  async function handleBranchAction(action: GitBranchAction, branch: GitBranchRef) {
    try {
      switch (action) {
        case 'switch':
          await git.switchBranch(branch)
          window.showInformationMessage(`Switched to ${getBranchBaseName(branch)}`)
          break

        case 'pull':
          await git.pullBranch(branch)
          window.showInformationMessage(branch.type === 'remote'
            ? `Fetched ${branch.remote || getBranchBaseName(branch)}`
            : `Pulled ${branch.name}`)
          break

        case 'delete': {
          const confirm = await window.showWarningMessage(
            `Delete ${branch.type} branch "${branch.name}"? This action cannot be undone.`,
            { modal: true },
            'Delete',
          )
          if (confirm !== 'Delete')
            return
          await git.deleteBranch(branch)
          window.showInformationMessage(`Deleted ${branch.name}`)
          break
        }

        case 'rename': {
          const newName = await promptForBranchName(`Rename ${branch.name}`, getBranchBaseName(branch))
          if (!newName || newName === branch.name || newName === getBranchBaseName(branch))
            return
          await git.renameBranch(branch, newName)
          window.showInformationMessage(`Renamed ${branch.name} to ${newName}`)
          break
        }

        case 'clone': {
          const newName = await promptForBranchName(`Clone ${branch.name}`, `${getBranchBaseName(branch)}-copy`)
          if (!newName)
            return
          await git.cloneBranch(branch, newName)
          window.showInformationMessage(`Created ${newName} from ${branch.name}`)
          break
        }

        case 'push':
          await git.pushBranch(branch)
          window.showInformationMessage(`Pushed ${branch.name}`)
          break
      }

      await refreshGitRefs()
      await refreshHistory(true)
    }
    catch (error) {
      const errorMessage = formatError(error)
      logger.error(`Failed to ${action} branch ${branch.name}:`, error)
      postMessage({
        command: CHANNEL.ERROR,
        message: `Failed to ${action} ${branch.name}: ${errorMessage}`,
      })
      window.showErrorMessage(`Failed to ${action} ${branch.name}: ${errorMessage}`)
      await refreshGitRefs()
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
    viewType: HISTORY_VIEW_ID,
    refreshHistory,
    postMessage,
    forceRefresh,
    getRepoBranches,
    getRepoAuthors,
    clearSelection,
    backToHead,
    focusHistoryView: focusBestHistoryView,
    refreshFileHistory: async (_forceRefresh?: boolean) => {
      if (fileHistoryActive.value)
        await refreshFileHistory(_forceRefresh, false, false, false)
    },
    postFileHistory: (activate = false) => refreshFileHistory(false, false, activate, false),
    refreshStashList,
    refreshGitRefs,
    fetchRemote,
  }
})
