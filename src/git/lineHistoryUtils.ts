import type { GitLineHistory } from './types'

const EMPTY_HASH = '0000000000000000000000000000000000000000'

function stripMailBrackets(value: string): string {
  return value.replace(/^<|>$/g, '').trim()
}

function toIsoDate(authorTime?: number): string | undefined {
  if (!authorTime)
    return undefined

  return new Date(authorTime * 1000).toISOString()
}

export function parseGitBlameLine(rawBlame: string, previousLineText?: string): GitLineHistory | null {
  if (!rawBlame.trim())
    return null

  const lines = rawBlame.split('\n')
  const header = lines[0]?.trim()
  const headerMatch = header?.match(/^\^?([0-9a-f]{40})\s+(\d+)\s+(\d+)/i)

  if (!headerMatch)
    return null

  const [, hash, originalLine, finalLine] = headerMatch
  const fields = new Map<string, string>()

  for (const line of lines.slice(1)) {
    if (!line || line.startsWith('\t'))
      continue

    const spaceIndex = line.indexOf(' ')
    if (spaceIndex === -1)
      continue

    fields.set(line.slice(0, spaceIndex), line.slice(spaceIndex + 1))
  }

  const authorTime = Number.parseInt(fields.get('author-time') || '', 10)
  const isUncommitted = hash === EMPTY_HASH
  const summary = fields.get('summary') || (isUncommitted ? 'Not Committed Yet' : '(no commit message)')
  const previous = fields.get('previous')?.match(/^([0-9a-f]{40})\s+(.+)$/i)

  return {
    hash,
    shortHash: hash.slice(0, 7),
    summary,
    authorName: fields.get('author') || 'Unknown',
    authorEmail: stripMailBrackets(fields.get('author-mail') || ''),
    authorTime: Number.isNaN(authorTime) ? undefined : authorTime,
    authorTz: fields.get('author-tz') || undefined,
    authorDate: Number.isNaN(authorTime) ? undefined : toIsoDate(authorTime),
    filePath: fields.get('filename') || '',
    previousHash: previous?.[1],
    previousFilePath: previous?.[2],
    originalLine: Number.parseInt(originalLine, 10),
    finalLine: Number.parseInt(finalLine, 10),
    previousLineText: previousLineText ?? undefined,
    isUncommitted,
  }
}

export function parseGitDiffPreviousLine(rawDiff: string, targetNewLine: number): string | undefined {
  let newLine = 0
  let addedIndex = 0
  let removedLines: string[] = []

  for (const line of rawDiff.split('\n')) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      newLine = Number.parseInt(hunk[1], 10)
      addedIndex = 0
      removedLines = []
      continue
    }

    if (newLine === 0 || line.startsWith('\\ No newline'))
      continue

    if (line.startsWith('-') && !line.startsWith('---')) {
      removedLines.push(line.slice(1))
      continue
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      if (newLine === targetNewLine && removedLines.length > 0)
        return removedLines[Math.min(addedIndex, removedLines.length - 1)]

      newLine += 1
      addedIndex += 1
      continue
    }

    if (line.startsWith(' ')) {
      newLine += 1
      addedIndex = 0
      removedLines = []
    }
  }

  return undefined
}
