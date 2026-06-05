import path from 'node:path'
import { type Disposable, type TextEditor, FileType, Uri, window, workspace } from 'vscode'
import { computed, createSingletonComposable, extensionContext as context, ref } from 'reactive-vscode'

import type { Commit, GitLineHistory } from '@/git'
import { getRelativePath, useGitService } from '@/git'
import { config } from '@/config'
import { formatError, logger } from '@/utils'

export type FileHistoryMode = 'file' | 'line'

export interface HistoryLineRange {
  start: number
  end: number
}

export interface HistoryTarget {
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

function lineSuffix(lineRange?: HistoryLineRange): string {
  if (!lineRange)
    return ''

  return lineRange.start === lineRange.end
    ? `:${lineRange.start}`
    : `:${lineRange.start}-${lineRange.end}`
}

export const useFileHistory = createSingletonComposable(() => {
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

  const title = computed(() => {
    const currentTarget = target.value
    if (!currentTarget)
      return mode.value === 'line' ? 'Line History' : 'File History'

    const fileName = path.posix.basename(currentTarget.relativePath) || currentTarget.relativePath
    return `${fileName}${mode.value === 'line' ? lineSuffix(currentTarget.lineRange) : ''}`
  })

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
    }
  }

  async function setTarget(nextTarget: HistoryTarget | null, options: { forceRefresh?: boolean } = {}) {
    const changed = !sameTarget(target.value, nextTarget, mode.value)
    target.value = nextTarget

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
      return false
    }

    mode.value = 'file'
    following.value = false
    const nextTarget = await createTarget(uri, 'file')
    if (!nextTarget) {
      window.showInformationMessage('The selected file is not inside the current repository.')
      return false
    }

    await setTarget(nextTarget, { forceRefresh: true })
    return true
  }

  async function showLineHistory(resource?: unknown) {
    const uri = getUriFromCommandArg(resource) ?? window.activeTextEditor?.document.uri
    const editor = window.activeTextEditor
    if (!uri || !editor || editor.document.uri.toString() !== uri.toString()) {
      window.showInformationMessage('Open a file and select a line to view line history.')
      return false
    }

    mode.value = 'line'
    following.value = false
    const nextTarget = await createTarget(uri, 'line', editor)
    if (!nextTarget) {
      window.showInformationMessage('The selected line is not inside the current repository.')
      return false
    }

    await setTarget(nextTarget, { forceRefresh: true })
    return true
  }

  async function setMode(nextMode: FileHistoryMode) {
    mode.value = nextMode
    following.value = true
    await updateFromActiveEditor({ forceRefresh: true })
  }

  async function setFollowing(enabled: boolean) {
    following.value = enabled

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
  scheduleActiveUpdate()

  return {
    mode,
    following,
    target,
    title,
    commits,
    lineBlame,
    loading,
    error,
    hasMore,
    refresh,
    loadMore,
    setMode,
    setFollowing,
    showFileHistory,
    showLineHistory,
  }
})
