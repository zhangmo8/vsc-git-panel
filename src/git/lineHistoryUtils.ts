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

export function parseGitBlameLine(rawBlame: string): GitLineHistory | null {
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
    originalLine: Number.parseInt(originalLine, 10),
    finalLine: Number.parseInt(finalLine, 10),
    isUncommitted,
  }
}
