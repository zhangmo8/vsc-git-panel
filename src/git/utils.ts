export function normalizeRef(ref: string): string {
  if (!ref)
    return ''

  let cleaned = ref.trim()
  cleaned = cleaned.replace(/^\(+/, '').replace(/\)+$/, '').trim()
  cleaned = cleaned.replace(/^,+/, '').replace(/,+$/, '').trim()

  if (cleaned.startsWith('HEAD -> '))
    cleaned = cleaned.replace('HEAD -> ', '')

  if (cleaned.startsWith('refs/heads/'))
    cleaned = cleaned.substring('refs/heads/'.length)

  if (cleaned.startsWith('refs/remotes/'))
    cleaned = cleaned.substring('refs/remotes/'.length)

  if (cleaned.startsWith('ref:'))
    cleaned = cleaned.substring('ref:'.length)

  return cleaned.replace(/[()]/g, '').trim()
}

export function isBranchRef(ref: string): boolean {
  return ref.includes('refs/heads/')
    || ref.includes('refs/remotes/')
    || ref.startsWith('HEAD -> ')
    || (!ref.includes('refs/') && !ref.includes('tag:'))
}

export function getBranchRefs(refs?: string): string[] {
  if (!refs)
    return []

  return refs
    .split(',')
    .map(ref => ref.trim())
    .filter(isBranchRef)
    .map(ref => normalizeRef(ref))
    .filter(Boolean)
}

export function getPrimaryBranch(refs?: string, fallback = 'main'): string {
  return getBranchRefs(refs)[0] || fallback
}

/**
 * Normalize a git remote URL (https / ssh / git protocol) into its
 * `{ host, path }` web parts, dropping credentials, ports and the `.git` suffix.
 */
export function parseRemoteUrl(remoteUrl?: string): { host: string, path: string } | null {
  if (!remoteUrl)
    return null

  let url = remoteUrl.trim()
  if (!url)
    return null

  // scp-like syntax: git@github.com:user/repo.git
  const scpMatch = url.match(/^[\w.-]+@([^:/]+):(.+)$/)
  if (scpMatch) {
    url = `https://${scpMatch[1]}/${scpMatch[2]}`
  }
  else {
    // ssh://git@host:port/user/repo.git or git://host/...
    url = url.replace(/^[a-z][\w+.-]*:\/\//i, 'https://')
    if (!/^https?:\/\//i.test(url))
      return null
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    return null
  }

  const host = parsed.host.replace(/:\d+$/, '')
  const path = parsed.pathname
    .replace(/^\/+/, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')

  if (!host || !path)
    return null

  return { host, path }
}

export interface FileRevision {
  /** Commit SHA that touched the file */
  commit: string
  /** File path as it existed at that commit (follows renames) */
  path: string
}

/**
 * Parse the output of
 * `git log --follow --format=%H --name-status <ref> -- <file>`
 * into the file's revisions, newest first. The path of each revision reflects
 * the file name at that commit, so renames are handled.
 */
export function parseFileRevisions(raw: string): FileRevision[] {
  const revisions: FileRevision[] = []
  let commit: string | null = null

  for (const line of raw.split('\n')) {
    if (!line.trim())
      continue

    // Commit hash line emitted by `--format=%H` (no tab, pure hex)
    if (!line.includes('\t') && /^[0-9a-f]{7,40}$/i.test(line.trim())) {
      commit = line.trim()
      continue
    }

    if (!commit)
      continue

    // name-status line: "M\t<path>" or "R100\t<old>\t<new>"
    const parts = line.split('\t')
    if (parts.length < 2)
      continue

    const path = parts[parts.length - 1].trim()
    if (path) {
      revisions.push({ commit, path })
      commit = null
    }
  }

  return revisions
}

/**
 * Build a browser URL that points to a single commit for the given remote.
 * Supports GitHub, GitLab, Bitbucket and Gitea-style hosts.
 */
export function buildCommitWebUrl(remoteUrl: string | undefined, hash: string): string | null {
  if (!hash)
    return null

  const parts = parseRemoteUrl(remoteUrl)
  if (!parts)
    return null

  const { host, path } = parts
  const lowerHost = host.toLowerCase()

  // Bitbucket uses /commits/, others use /commit/
  const segment = lowerHost.includes('bitbucket') ? 'commits' : 'commit'

  return `https://${host}/${path}/${segment}/${hash}`
}
