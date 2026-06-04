import type { Commit, CommitDiffStats, CommitFile, ExtendedLogResult, GitHistoryFilter, GitOperation } from './types'
import { getBranchRefs, getPrimaryBranch } from './utils'

export function createCacheKey(filter?: GitHistoryFilter): string {
  if (!filter)
    return 'default'

  const branches = filter.branches ? [...filter.branches].sort() : undefined
  const parts = [
    branches?.join(',') || 'all',
    filter.author || 'any',
    filter.search || '',
    filter.filePath || '',
    filter.followRenames ? 'follow' : '',
    filter.lineRange ? `${filter.lineRange.start}-${filter.lineRange.end}` : '',
    filter.page || 1,
    filter.pageSize || 45,
  ]
  return parts.join('|')
}

function isHashSearch(search?: string): boolean {
  return !!search && search.length >= 7 && /^[a-f0-9]+$/i.test(search)
}

export function buildHistoryLogArgs(filter?: GitHistoryFilter): string[] {
  const search = filter?.search?.trim()
  const hashSearch = isHashSearch(search)
  const pageSize = filter?.pageSize || 45
  const page = filter?.page || 1
  const skip = (page - 1) * pageSize
  const prettyFormat = '--pretty=format:%H%x01%P%x01%an%x01%ae%x01%ad%x01%s%x01%d%x01%b'
  const lineRange = filter?.lineRange

  if (filter?.filePath && lineRange) {
    const lineStart = Math.max(1, Math.min(lineRange.start, lineRange.end))
    const lineEnd = Math.max(lineStart, Math.max(lineRange.start, lineRange.end))
    const logArgs: string[] = []

    if (filter.branches && filter.branches.length === 1)
      logArgs.push(filter.branches[0])

    if (skip > 0)
      logArgs.push(`--skip=${skip}`)

    logArgs.push(
      `--max-count=${pageSize}`,
      '--decorate=full',
      prettyFormat,
      '-L',
      `${lineStart},${lineEnd}:${filter.filePath}`,
    )

    return logArgs
  }

  const logArgs: string[] = []

  if (filter?.branches && filter.branches.length > 0) {
    logArgs.push(...filter.branches)
  }
  else if (!hashSearch) {
    logArgs.push('--all')
  }

  if (filter?.author) {
    logArgs.push(`--author=${filter.author}`)
  }

  if (filter?.filePath && filter.followRenames) {
    logArgs.push('--follow')
  }

  if (skip > 0) {
    logArgs.push(`--skip=${skip}`)
  }

  if (search) {
    if (hashSearch) {
      logArgs.push('--max-count=1', search)
    }
    else {
      logArgs.push(`--max-count=${pageSize}`, `--grep=${search}`, '--regexp-ignore-case')
    }
  }
  else {
    logArgs.push(`--max-count=${pageSize}`)
  }

  logArgs.push('--decorate=full', prettyFormat, '--stat')

  if (filter?.filePath) {
    logArgs.push('--', filter.filePath)
  }

  return logArgs
}

function splitRawGitLog(rawLog: string): string[] {
  const lines = rawLog.split('\n')
  const commitsRaw: string[] = []
  let current = ''

  for (const line of lines) {
    const parts = line.split('\x01')
    const isCommitStart = parts.length > 1 && /^[a-f0-9]{7,40}$/i.test(parts[0])
    if (isCommitStart) {
      if (current)
        commitsRaw.push(current)
      current = line
    }
    else {
      current += (current ? '\n' : '') + line
    }
  }

  if (current)
    commitsRaw.push(current)

  return commitsRaw
}

function parseCommitStats(bodyAndStats: string): Pick<Commit, 'files' | 'summary' | 'diff'> {
  let files: CommitFile[] = []
  let summary = ''
  let diff: CommitDiffStats | undefined

  if (!bodyAndStats) {
    return { files, summary, diff }
  }

  const lines = bodyAndStats.split('\n')
  const statLines = lines.filter(l => /\s+[AMDCR]\s+/.test(l) || /^\s*[AMDCR]\s+/.test(l))
  files = statLines.map((line) => {
    const match = line.match(/([AMDCR])\s+(.+)/)
    return match ? { status: match[1], path: match[2] } : null
  }).filter((file): file is CommitFile => file !== null)

  const summaryLine = lines.find(l => /files? changed/.test(l))
  if (summaryLine) {
    summary = summaryLine.trim()
    const changed = Number.parseInt((summary.match(/(\d+) files? changed/) || [])[1] || '0', 10)
    const insertions = Number.parseInt((summary.match(/(\d+) insertions?\(\+\)/) || [])[1] || '0', 10)
    const deletions = Number.parseInt((summary.match(/(\d+) deletions?\(-\)/) || [])[1] || '0', 10)
    diff = { changed, insertions, deletions }
  }

  return { files, summary, diff }
}

function parseCommitBlock(block: string): Commit | undefined {
  if (!block.trim()) {
    return undefined
  }

  const parts = block.split('\x01')
  const [hash, parents, author_name, author_email, date, message, refs] = parts
  const bodyAndStats = parts.slice(7).join('\x01')
  const parentArr = parents ? parents.split(' ').filter(Boolean) : []
  const { files, summary, diff } = parseCommitStats(bodyAndStats)

  return {
    hash,
    parents: parentArr,
    author_name,
    author_email,
    date,
    message,
    refs,
    body: bodyAndStats?.split('\n')[0] || '',
    files,
    summary,
    diff,
    isMergeCommit: parentArr.length > 1,
    authorName: author_name,
    authorEmail: author_email,
    branchName: getPrimaryBranch(refs, ''),
  } as Commit
}

export function parseRawGitLog(rawLog: string): ExtendedLogResult {
  const all = splitRawGitLog(rawLog)
    .map(parseCommitBlock)
    .filter((commit): commit is Commit => commit !== undefined)

  return {
    all,
    total: all.length,
    latest: all[0] || null,
  } as ExtendedLogResult
}

export function isBadRevisionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return msg.includes('bad revision') || msg.includes('unknown revision') || msg.includes('fatal:')
}

export function extractBranches(commits: readonly Commit[]): string[] {
  const branchSet = new Set<string>()

  for (const commit of commits) {
    getBranchRefs(commit.refs).forEach(branch => branchSet.add(branch))
  }

  if (branchSet.size === 0) {
    branchSet.add('main')
  }

  return Array.from(branchSet)
}

export function buildOperations(commits: readonly Commit[]): GitOperation[] {
  return commits.map((commit) => {
    const branchRefs = getBranchRefs(commit.refs)
    const mainBranch = branchRefs[0] || 'main'

    return {
      type: commit.isMergeCommit ? 'merge' : 'commit',
      branch: mainBranch,
      hash: commit.hash,
      message: commit.message,
      branchChanged: false,
      branchExplicit: branchRefs.length > 0,
    }
  })
}
