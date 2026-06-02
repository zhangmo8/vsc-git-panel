import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  DecorationRangeBehavior,
  Hover,
  MarkdownString,
  Range,
  ThemeColor,
  languages,
  window,
  workspace,
} from 'vscode'
import type { Disposable, TextDocument, TextEditor, Uri } from 'vscode'
import { extensionContext as context } from 'reactive-vscode'

import { useGitService } from '@/git'
import type { GitLineHistory } from '@/git'
import { EXTENSION_SYMBOL } from '@/constant'
import { logger } from '@/utils'

interface ActiveLineHistory {
  uri: string
  line: number
  relativePath: string
  lineText: string
  history: GitLineHistory
}

interface CachedLineHistory {
  value: GitLineHistory | null
  timestamp: number
}

const HISTORY_CACHE_TTL = 30_000
const MAX_HISTORY_CACHE_SIZE = 300
const HOVER_MIN_WIDTH = 560
const HOVER_MAX_HEIGHT = 360
const HOVER_MAX_CHARACTER = 2 ** 30 - 1

let initialized = false

function formatRelativeTime(date?: string): string {
  if (!date)
    return ''

  const elapsed = Date.now() - new Date(date).getTime()
  const absElapsed = Math.max(0, elapsed)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const month = 30 * day
  const year = 365 * day

  if (absElapsed < minute)
    return 'just now'
  if (absElapsed < hour)
    return `${Math.floor(absElapsed / minute)}m ago`
  if (absElapsed < day)
    return `${Math.floor(absElapsed / hour)}h ago`
  if (absElapsed < month)
    return `${Math.floor(absElapsed / day)}d ago`
  if (absElapsed < year)
    return `${Math.floor(absElapsed / month)}mo ago`
  return `${Math.floor(absElapsed / year)}y ago`
}

function formatFullDate(date?: string): string {
  if (!date)
    return ''

  return new Date(date).toLocaleString()
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength)
    return value

  return `${value.slice(0, maxLength - 3)}...`
}

function getInlineText(history: GitLineHistory): string {
  if (history.isUncommitted)
    return '  Not committed yet'

  const relativeTime = formatRelativeTime(history.authorDate)
  const byline = [history.authorName, relativeTime].filter(Boolean).join(', ')

  return truncate(`  ${history.shortHash} ${byline} - ${history.summary}`, 140)
}

function escapeInlineCode(value: string): string {
  return value.replace(/`/g, '\\`')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function htmlColor(value: string, colorToken: string): string {
  return `<span style="color: var(--vscode-${colorToken});">${escapeHtml(value)}</span>`
}

function getGithubUsernameFromEmail(email: string): string | undefined {
  const match = email.match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i)
  return match?.[1]
}

function getAuthorAvatarUrl(history: GitLineHistory): string | undefined {
  const email = history.authorEmail.trim().toLowerCase()
  if (!email)
    return undefined

  const githubUsername = getGithubUsernameFromEmail(email)
  if (githubUsername)
    return `https://github.com/${encodeURIComponent(githubUsername)}.png?size=72`

  const emailHash = createHash('md5').update(email).digest('hex')
  return `https://www.gravatar.com/avatar/${emailHash}?s=72&d=mp`
}

function createCommandUri(command: string, args: unknown[]): string {
  return `command:${command}?${encodeURIComponent(JSON.stringify(args))}`
}

function getDiffLines(history: GitLineHistory, lineText: string): string[] {
  const lines = [`+ ${lineText.trimEnd()}`]
  if (history.previousLineText !== undefined)
    lines.unshift(`- ${history.previousLineText.trimEnd()}`)

  return lines
}

function appendHoverScrollStart(markdown: MarkdownString) {
  markdown.appendMarkdown([
    `<div style="min-width: ${HOVER_MIN_WIDTH}px; max-height: ${HOVER_MAX_HEIGHT}px; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scrollbar-gutter: stable; padding-right: 6px;">`,
    '',
  ].join('\n'))
}

function appendHoverScrollEnd(markdown: MarkdownString) {
  markdown.appendMarkdown('\n\n</div>')
}

function createHoverMessage(
  history: GitLineHistory,
  relativePath: string,
  lineNumber: number,
  lineText: string,
): MarkdownString {
  const markdown = new MarkdownString(undefined, true)
  markdown.supportThemeIcons = true
  markdown.supportHtml = true
  markdown.isTrusted = {
    enabledCommands: [
      `${EXTENSION_SYMBOL}.copyHash`,
    ],
  }
  appendHoverScrollStart(markdown)

  if (history.isUncommitted) {
    markdown.appendMarkdown(`$(diff-added) **${htmlColor('Not committed yet', 'gitDecoration-addedResourceForeground')}**\n\n`)
    markdown.appendMarkdown(`${htmlColor('Working tree changes', 'descriptionForeground')} &nbsp;&nbsp; $(file-code) \`${escapeInlineCode(relativePath)}:${lineNumber}\``)
    markdown.appendMarkdown('\n\n')
    markdown.appendMarkdown('---\n\n')
    markdown.appendCodeblock(getDiffLines(history, lineText).join('\n'), 'diff')
    markdown.appendMarkdown('\n')
    markdown.appendMarkdown(`${htmlColor('Changes are currently only in the working tree.', 'descriptionForeground')}`)
    appendHoverScrollEnd(markdown)
    return markdown
  }

  const relativeTime = formatRelativeTime(history.authorDate)
  const author = history.authorEmail
    ? `${history.authorName} (${history.authorEmail})`
    : history.authorName
  const copyUri = createCommandUri(`${EXTENSION_SYMBOL}.copyHash`, [history.hash])
  const commitLabel = `$(git-commit) ${htmlColor(history.shortHash, 'gitDecoration-addedResourceForeground')}`
  const changesLabel = history.previousLineText === undefined ? 'Changes added in' : 'Changes'
  const avatarUrl = getAuthorAvatarUrl(history)
  const avatarHtml = avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" width="36" height="36" style="border-radius: 50%; vertical-align: middle;" />`
    : ''

  markdown.appendMarkdown([
    `<table style="min-width: ${HOVER_MIN_WIDTH}px; border-spacing: 0;">`,
    '<tr>',
    `<td style="width: 46px; padding-right: 10px; vertical-align: top;">${avatarHtml}</td>`,
    '<td style="vertical-align: top;">',
    `<div><strong>${htmlColor(author, 'foreground')}</strong>${relativeTime ? ` &nbsp;&nbsp; $(clock) ${htmlColor(relativeTime, 'descriptionForeground')}` : ''}</div>`,
    `<div style="margin-top: 4px;">${htmlColor(history.summary, 'foreground')}</div>`,
    '</td>',
    '</tr>',
    '</table>',
  ].join(''))
  markdown.appendMarkdown('\n\n')
  markdown.appendMarkdown('---\n\n')
  markdown.appendCodeblock(getDiffLines(history, lineText).join('\n'), 'diff')
  markdown.appendMarkdown('\n')
  markdown.appendMarkdown('---\n\n')
  markdown.appendMarkdown(`${changesLabel} ${commitLabel} &nbsp;&nbsp;|&nbsp;&nbsp; [$(copy) Copy](${copyUri} "Copy Commit Hash")`)
  markdown.appendMarkdown(`\n\n$(file-code) ${htmlColor(`${relativePath}:${lineNumber}`, 'descriptionForeground')}`)

  if (history.authorDate)
    markdown.appendMarkdown(` &nbsp;&nbsp; $(calendar) ${htmlColor(formatFullDate(history.authorDate), 'descriptionForeground')}`)

  appendHoverScrollEnd(markdown)
  return markdown
}

function isInsideRepo(rootRepoPath: string, filePath: string): boolean {
  const relativePath = path.relative(rootRepoPath, filePath)
  return !!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

function getRelativePath(rootRepoPath: string, uri: Uri): string | null {
  if (uri.scheme !== 'file')
    return null

  if (!isInsideRepo(rootRepoPath, uri.fsPath))
    return null

  return path.relative(rootRepoPath, uri.fsPath).split(path.sep).join('/')
}

function shouldAnnotateDocument(document: TextDocument): boolean {
  return document.uri.scheme === 'file'
    && !document.isUntitled
    && !document.isDirty
}

export function initLineHistory() {
  if (initialized)
    return

  initialized = true

  const git = useGitService()
  const decorationType = window.createTextEditorDecorationType({
    after: {
      color: new ThemeColor('editorCodeLens.foreground'),
      fontStyle: 'italic',
      margin: '0 0 0 1.25em',
    },
    rangeBehavior: DecorationRangeBehavior.ClosedClosed,
  })

  const cache = new Map<string, CachedLineHistory>()
  let activeLineHistory: ActiveLineHistory | null = null
  let updateTimer: ReturnType<typeof setTimeout> | undefined
  let requestId = 0

  function clearDecorations() {
    requestId += 1
    activeLineHistory = null
    for (const editor of window.visibleTextEditors) {
      editor.setDecorations(decorationType, [])
    }
  }

  function setCachedHistory(key: string, value: GitLineHistory | null) {
    if (cache.has(key))
      cache.delete(key)

    cache.set(key, {
      value,
      timestamp: Date.now(),
    })

    while (cache.size > MAX_HISTORY_CACHE_SIZE) {
      const oldestKey = cache.keys().next().value
      if (!oldestKey)
        break
      cache.delete(oldestKey)
    }
  }

  function getCachedHistory(key: string): GitLineHistory | null | undefined {
    const cached = cache.get(key)
    if (!cached)
      return undefined

    if (Date.now() - cached.timestamp > HISTORY_CACHE_TTL) {
      cache.delete(key)
      return undefined
    }

    cache.delete(key)
    cache.set(key, cached)
    return cached.value
  }

  async function updateLineHistory(editor: TextEditor | undefined) {
    if (!editor || !shouldAnnotateDocument(editor.document)) {
      clearDecorations()
      return
    }

    const relativePath = getRelativePath(git.rootRepoPath, editor.document.uri)
    if (!relativePath) {
      clearDecorations()
      return
    }

    const activePosition = editor.selection.active
    const lineNumber = activePosition.line + 1
    const cacheKey = `${editor.document.uri.toString()}|${editor.document.version}|${lineNumber}`
    const currentRequestId = ++requestId

    let history = getCachedHistory(cacheKey)
    if (history === undefined) {
      history = await git.getLineHistoryForHover(relativePath, lineNumber)
      setCachedHistory(cacheKey, history)
    }

    if (currentRequestId !== requestId)
      return

    if (!history) {
      clearDecorations()
      return
    }

    const line = editor.document.lineAt(activePosition.line)
    const anchor = line.range.end

    activeLineHistory = {
      uri: editor.document.uri.toString(),
      line: activePosition.line,
      relativePath,
      lineText: line.text,
      history,
    }

    for (const visibleEditor of window.visibleTextEditors) {
      if (visibleEditor.document.uri.toString() !== editor.document.uri.toString()) {
        visibleEditor.setDecorations(decorationType, [])
      }
    }

    editor.setDecorations(decorationType, [
      {
        range: new Range(anchor, anchor),
        renderOptions: {
          after: {
            contentText: getInlineText(history),
          },
        },
      },
    ])
  }

  function scheduleUpdate(editor: TextEditor | undefined = window.activeTextEditor) {
    if (updateTimer)
      clearTimeout(updateTimer)

    updateTimer = setTimeout(() => {
      void updateLineHistory(editor).catch((error) => {
        logger.warn('Failed to update editor line history:', error)
        clearDecorations()
      })
    }, 120)
  }

  const hoverProvider = languages.registerHoverProvider({ scheme: 'file' }, {
    provideHover(document, position) {
      if (!activeLineHistory)
        return undefined

      if (activeLineHistory.uri !== document.uri.toString() || activeLineHistory.line !== position.line)
        return undefined

      const hoverRange = document.validateRange(
        new Range(position.line, position.character, position.line, HOVER_MAX_CHARACTER),
      )

      return new Hover(
        createHoverMessage(
          activeLineHistory.history,
          activeLineHistory.relativePath,
          activeLineHistory.line + 1,
          activeLineHistory.lineText,
        ),
        hoverRange,
      )
    },
  })

  const disposables: Disposable[] = [
    decorationType,
    hoverProvider,
    window.onDidChangeActiveTextEditor(editor => scheduleUpdate(editor)),
    window.onDidChangeTextEditorSelection(event => scheduleUpdate(event.textEditor)),
    workspace.onDidSaveTextDocument((document) => {
      if (document.uri.toString() === activeLineHistory?.uri) {
        cache.clear()
        scheduleUpdate(window.activeTextEditor)
      }
    }),
    workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === activeLineHistory?.uri) {
        cache.clear()
        clearDecorations()
      }
    }),
  ]

  context.value?.subscriptions.push(...disposables)
  scheduleUpdate()
}
