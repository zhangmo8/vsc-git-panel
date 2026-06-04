import path from 'node:path'
import type { TreeViewNode } from 'reactive-vscode'
import {
  computed,
  extensionContext as context,
  createSingletonComposable,
  executeCommand,
  ref,
  useTreeView,
} from 'reactive-vscode'
import {
  FileType,
  ThemeIcon,
  TreeItem,
  TreeItemCollapsibleState,
  Uri,
  window,
  workspace,
} from 'vscode'
import type { Disposable, TextEditor } from 'vscode'

import type { Commit, GitLineHistory } from '@/git'
import { getRelativePath, useGitService } from '@/git'
import { EXTENSION_SYMBOL, FILE_HISTORY_VIEW_ID } from '@/constant'
import { config } from '@/config'
import { formatError, logger, shortHash } from '@/utils'

export type FileHistoryMode = 'file' | 'line'

interface HistoryLineRange {
  start: number
  end: number
}

interface HistoryTarget {
  uri: Uri
  relativePath: string
  isDirectory: boolean
  lineRange?: HistoryLineRange
}

interface HistoryCommandResource {
  resourceUri?: Uri
  uri?: Uri
  fsPath?: string
}

const FOLLOWING_CONTEXT = 'gitPanel.fileHistory.following'
const MODE_CONTEXT = 'gitPanel.fileHistory.mode'
const HAS_TARGET_CONTEXT = 'gitPanel.fileHistory.hasTarget'
const PAGE_SIZE_FALLBACK = 45

function getPageSize(): number {
  return config['history.pageSize'] ?? PAGE_SIZE_FALLBACK
}

function normalizeRange(range: HistoryLineRange): HistoryLineRange {
  const start = Math.max(1, Math.min(range.start, range.end))
  const end = Math.max(start, Math.max(range.start, range.end))
  return { start, end }
}

function getSelectionLineRange(editor: TextEditor): HistoryLineRange {
  const selection = editor.selection
  const startLine = Math.min(selection.start.line, selection.end.line)
  let endLine = Math.max(selection.start.line, selection.end.line)

  if (!selection.isEmpty && selection.end.character === 0 && selection.end.line > selection.start.line)
    endLine -= 1

  return {
    start: startLine + 1,
    end: Math.max(startLine, endLine) + 1,
  }
}

function isHistoryCommandResource(value: unknown): value is HistoryCommandResource {
  return !!value && typeof value === 'object'
}

function getUriFromCommandArg(value: unknown): Uri | undefined {
  if (value instanceof Uri)
    return value

  if (!isHistoryCommandResource(value))
    return undefined

  if (value.resourceUri instanceof Uri)
    return value.resourceUri

  if (value.uri instanceof Uri)
    return value.uri

  if (typeof value.fsPath === 'string')
    return Uri.file(value.fsPath)

  return undefined
}

function formatDate(value?: string): string {
  if (!value)
    return ''

  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp))
    return value

  return new Date(timestamp).toLocaleString()
}

function formatRelativeTime(value?: string): string {
  if (!value)
    return ''

  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp))
    return ''

  const elapsed = Math.max(0, Date.now() - timestamp)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const month = 30 * day
  const year = 365 * day

  if (elapsed < minute)
    return 'just now'
  if (elapsed < hour)
    return `${Math.floor(elapsed / minute)}m ago`
  if (elapsed < day)
    return `${Math.floor(elapsed / hour)}h ago`
  if (elapsed < month)
    return `${Math.floor(elapsed / day)}d ago`
  if (elapsed < year)
    return `${Math.floor(elapsed / month)}mo ago`
  return `${Math.floor(elapsed / year)}y ago`
}

function lineSuffix(lineRange?: HistoryLineRange): string {
  if (!lineRange)
    return ''

  return lineRange.start === lineRange.end
    ? `:${lineRange.start}`
    : `:${lineRange.start}-${lineRange.end}`
}

function sameTarget(a: HistoryTarget | null, b: HistoryTarget | null, mode: FileHistoryMode): boolean {
  if (!a || !b)
    return a === b

  if (a.uri.toString() !== b.uri.toString() || a.relativePath !== b.relativePath)
    return false

  if (mode === 'file')
    return true

  return a.lineRange?.start === b.lineRange?.start
    && a.lineRange?.end === b.lineRange?.end
}

class MessageNode extends TreeItem {
  constructor(label: string, description = '', iconName = 'info') {
    super(label, TreeItemCollapsibleState.None)
    this.description = description
    this.tooltip = description || label
    this.iconPath = new ThemeIcon(iconName)
  }
}

class HistoryRootNode extends TreeItem {
  constructor(
    target: HistoryTarget,
    mode: FileHistoryMode,
    following: boolean,
    commitCount: number,
  ) {
    const fileName = path.posix.basename(target.relativePath) || target.relativePath
    const suffix = mode === 'line' ? lineSuffix(target.lineRange) : ''
    super(`${fileName}${suffix}`, TreeItemCollapsibleState.Expanded)

    this.description = following
      ? `${commitCount} commit${commitCount === 1 ? '' : 's'}`
      : `${commitCount} commit${commitCount === 1 ? '' : 's'} · pinned`
    this.tooltip = `${mode === 'line' ? 'Line' : target.isDirectory ? 'Folder' : 'File'} history for ${target.relativePath}${suffix}`
    this.iconPath = new ThemeIcon(mode === 'line' ? 'list-selection' : target.isDirectory ? 'folder' : 'file-code')
    this.contextValue = 'git-history-root'
  }
}

class HistoryCommitNode extends TreeItem {
  constructor(commit: Commit) {
    const label = commit.message || '(no commit message)'
    super(label, TreeItemCollapsibleState.None)

    const relativeTime = formatRelativeTime(commit.date)
    const details = [
      shortHash(commit.hash),
      commit.authorName,
      relativeTime,
    ].filter(Boolean)

    this.description = details.join(' · ')
    this.tooltip = [
      commit.message || '(no commit message)',
      commit.hash,
      commit.authorEmail ? `${commit.authorName} <${commit.authorEmail}>` : commit.authorName,
      formatDate(commit.date),
    ].filter(Boolean).join('\n')
    this.iconPath = new ThemeIcon(commit.isMergeCommit ? 'git-merge' : 'git-commit')
    this.contextValue = 'git-history-commit'
    this.command = {
      command: `${EXTENSION_SYMBOL}.fileHistory.openCommit`,
      title: 'Show Commit Changes',
      arguments: [commit.hash],
    }
  }
}

class WorkingTreeLineNode extends TreeItem {
  constructor(history: GitLineHistory) {
    super('Not committed yet', TreeItemCollapsibleState.None)
    this.description = history.summary
    this.tooltip = 'The selected line has working tree changes that have not been committed yet.'
    this.iconPath = new ThemeIcon('diff-added')
    this.contextValue = 'git-history-working-tree'
  }
}

class LoadMoreNode extends TreeItem {
  constructor() {
    super('Load More', TreeItemCollapsibleState.None)
    this.iconPath = new ThemeIcon('ellipsis')
    this.command = {
      command: `${EXTENSION_SYMBOL}.fileHistory.loadMore`,
      title: 'Load More',
    }
  }
}

export const useFileHistoryTreeView = createSingletonComposable(() => {
  const git = useGitService()

  const mode = ref<FileHistoryMode>('file')
  const following = ref(true)
  const target = ref<HistoryTarget | null>(null)
  const commits = ref<Commit[]>([])
  const lineBlame = ref<GitLineHistory | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const hasMore = ref(false)
  const page = ref(1)
  let requestId = 0
  let updateTimer: ReturnType<typeof setTimeout> | undefined

  async function setViewContext() {
    await Promise.all([
      executeCommand('setContext', FOLLOWING_CONTEXT, following.value),
      executeCommand('setContext', MODE_CONTEXT, mode.value),
      executeCommand('setContext', HAS_TARGET_CONTEXT, target.value !== null),
    ])
  }

  async function isDirectory(uri: Uri): Promise<boolean> {
    try {
      const stat = await workspace.fs.stat(uri)
      return (stat.type & FileType.Directory) !== 0
    }
    catch {
      return false
    }
  }

  async function createTarget(uri: Uri, nextMode: FileHistoryMode, editor?: TextEditor): Promise<HistoryTarget | null> {
    const relativePath = getRelativePath(git.rootRepoPath, uri)
    if (!relativePath)
      return null

    if (nextMode === 'line') {
      const activeEditor = editor ?? window.activeTextEditor
      if (!activeEditor || activeEditor.document.uri.toString() !== uri.toString())
        return null

      return {
        uri,
        relativePath,
        isDirectory: false,
        lineRange: normalizeRange(getSelectionLineRange(activeEditor)),
      }
    }

    return {
      uri,
      relativePath,
      isDirectory: await isDirectory(uri),
    }
  }

  async function createActiveTarget(nextMode = mode.value): Promise<HistoryTarget | null> {
    const editor = window.activeTextEditor
    if (!editor || editor.document.uri.scheme !== 'file')
      return null

    return createTarget(editor.document.uri, nextMode, editor)
  }

  async function loadHistory(options: { append?: boolean, forceRefresh?: boolean } = {}) {
    const currentTarget = target.value
    if (!currentTarget) {
      commits.value = []
      lineBlame.value = null
      hasMore.value = false
      error.value = null
      await setViewContext()
      return
    }

    const nextPage = options.append ? page.value + 1 : 1
    const pageSize = getPageSize()
    const currentRequestId = ++requestId
    loading.value = true
    error.value = null

    try {
      const graph = await git.getHistory({
        filePath: currentTarget.relativePath,
        followRenames: mode.value === 'file' && !currentTarget.isDirectory,
        lineRange: mode.value === 'line' ? currentTarget.lineRange : undefined,
        page: nextPage,
        pageSize,
      }, options.forceRefresh)

      if (currentRequestId !== requestId)
        return

      const nextCommits = Array.from(graph.logResult.all)
      commits.value = options.append
        ? [...commits.value, ...nextCommits]
        : nextCommits
      page.value = nextPage
      hasMore.value = nextCommits.length >= pageSize

      const currentLineRange = currentTarget.lineRange
      if (mode.value === 'line' && currentLineRange && currentLineRange.start === currentLineRange.end) {
        lineBlame.value = await git.getLineHistoryForHover(
          currentTarget.relativePath,
          currentLineRange.start,
        )
      }
      else {
        lineBlame.value = null
      }
    }
    catch (err) {
      if (currentRequestId !== requestId)
        return

      logger.error('Failed to load file history:', err)
      error.value = formatError(err)
      if (!options.append) {
        commits.value = []
        lineBlame.value = null
      }
      hasMore.value = false
    }
    finally {
      if (currentRequestId === requestId)
        loading.value = false
      await setViewContext()
    }
  }

  async function setTarget(nextTarget: HistoryTarget | null, options: { forceRefresh?: boolean } = {}) {
    const changed = !sameTarget(target.value, nextTarget, mode.value)
    target.value = nextTarget
    await setViewContext()

    if (changed || options.forceRefresh)
      await loadHistory({ forceRefresh: options.forceRefresh })
  }

  async function updateFromActiveEditor(options: { forceRefresh?: boolean } = {}) {
    if (!following.value)
      return

    await setTarget(await createActiveTarget(), options)
  }

  function scheduleActiveUpdate() {
    if (!following.value)
      return

    if (updateTimer)
      clearTimeout(updateTimer)

    updateTimer = setTimeout(() => {
      void updateFromActiveEditor().catch((err) => {
        logger.warn('Failed to update file history from active editor:', err)
      })
    }, 180)
  }

  async function showFileHistory(resource?: unknown) {
    const uri = getUriFromCommandArg(resource) ?? window.activeTextEditor?.document.uri
    if (!uri) {
      window.showInformationMessage('Open a file to view its history.')
      return
    }

    mode.value = 'file'
    following.value = false
    const nextTarget = await createTarget(uri, 'file')
    if (!nextTarget) {
      window.showInformationMessage('The selected file is not inside the current repository.')
      await setViewContext()
      return
    }

    await setTarget(nextTarget, { forceRefresh: true })
    await executeCommand(`${FILE_HISTORY_VIEW_ID}.focus`)
  }

  async function showLineHistory(resource?: unknown) {
    const uri = getUriFromCommandArg(resource) ?? window.activeTextEditor?.document.uri
    const editor = window.activeTextEditor
    if (!uri || !editor || editor.document.uri.toString() !== uri.toString()) {
      window.showInformationMessage('Open a file and select a line to view line history.')
      return
    }

    mode.value = 'line'
    following.value = false
    const nextTarget = await createTarget(uri, 'line', editor)
    if (!nextTarget) {
      window.showInformationMessage('The selected line is not inside the current repository.')
      await setViewContext()
      return
    }

    await setTarget(nextTarget, { forceRefresh: true })
    await executeCommand(`${FILE_HISTORY_VIEW_ID}.focus`)
  }

  async function setMode(nextMode: FileHistoryMode) {
    mode.value = nextMode
    following.value = true
    await setViewContext()
    await updateFromActiveEditor({ forceRefresh: true })
  }

  async function setFollowing(enabled: boolean) {
    following.value = enabled
    await setViewContext()

    if (enabled)
      await updateFromActiveEditor({ forceRefresh: true })
  }

  async function refresh(forceRefresh = true) {
    if (following.value) {
      const activeTarget = await createActiveTarget()
      if (!sameTarget(target.value, activeTarget, mode.value)) {
        await setTarget(activeTarget, { forceRefresh })
        return
      }
    }

    await loadHistory({ forceRefresh })
  }

  async function loadMore() {
    if (!hasMore.value || loading.value)
      return

    await loadHistory({ append: true })
  }

  const treeNodes = computed<TreeViewNode[]>(() => {
    const currentTarget = target.value
    if (!currentTarget) {
      return [{
        treeItem: new MessageNode(
          mode.value === 'line'
            ? 'Open a file and select a line'
            : 'Open a file to view history',
          following.value ? 'Following the active editor' : 'History is pinned',
          mode.value === 'line' ? 'list-selection' : 'file-code',
        ),
      }]
    }

    const children: TreeViewNode[] = []

    if (lineBlame.value?.isUncommitted)
      children.push({ treeItem: new WorkingTreeLineNode(lineBlame.value) })

    children.push(...commits.value.map(commit => ({ treeItem: new HistoryCommitNode(commit) })))

    if (loading.value && commits.value.length === 0) {
      children.push({ treeItem: new MessageNode('Loading history...', '', 'sync') })
    }
    else if (error.value) {
      children.push({ treeItem: new MessageNode('Failed to load history', error.value, 'error') })
    }
    else if (commits.value.length === 0 && !lineBlame.value?.isUncommitted) {
      children.push({ treeItem: new MessageNode('No history found', '', 'history') })
    }

    if (hasMore.value)
      children.push({ treeItem: new LoadMoreNode() })

    return [{
      treeItem: new HistoryRootNode(currentTarget, mode.value, following.value, commits.value.length),
      children,
    }]
  })

  const tree = useTreeView(
    FILE_HISTORY_VIEW_ID,
    treeNodes,
    {
      showCollapseAll: true,
    },
  )

  const disposables: Disposable[] = [
    window.onDidChangeActiveTextEditor(() => scheduleActiveUpdate()),
    window.onDidChangeTextEditorSelection(() => {
      if (mode.value === 'line')
        scheduleActiveUpdate()
    }),
    workspace.onDidSaveTextDocument((document) => {
      if (target.value?.uri.toString() === document.uri.toString())
        void refresh(true)
    }),
  ]

  context.value?.subscriptions.push(...disposables)
  void setViewContext()
  scheduleActiveUpdate()

  return {
    tree,
    mode,
    following,
    refresh,
    loadMore,
    setMode,
    setFollowing,
    showFileHistory,
    showLineHistory,
  }
})
