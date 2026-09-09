import type { GitWorktree } from './types'

/**
 * 归一化路径以便跨平台
 */
export function normalizeWorktreePath(input: string): string {
  if (!input)
    return ''

  let path = input.replace(/\\/g, '/')

  // Windows 盘符转小写（C:/ -> c:/）
  path = path.replace(/^([a-z]):\//i, (_match, drive: string) => `${drive.toLowerCase()}:/`)

  if (path.length > 1 && path.endsWith('/'))
    path = path.slice(0, -1)

  return path
}

/**
 * 将 `git worktree list --porcelain` 输出拆分为多条记录，每条为属性行数组。
 */
function splitRecords(raw: string): string[][] {
  if (raw.includes('\0')) {
    const records: string[][] = []
    let current: string[] = []
    for (const token of raw.split('\0')) {
      if (token === '') {
        // 记录边界（空行编码为额外的 NUL）。
        if (current.length > 0) {
          records.push(current)
          current = []
        }
        continue
      }
      current.push(token)
    }
    if (current.length > 0)
      records.push(current)
    return records
  }

  // 换行形式：记录间以空行分隔。不对属性值 trim，以保留路径原样字符。
  return raw
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(block => block.split('\n').filter(line => line.length > 0))
    .filter(record => record.length > 0)
}

export function parseWorktreeList(raw: string, currentPath?: string): GitWorktree[] {
  if (!raw)
    return []

  const normalizedCurrent = currentPath ? normalizeWorktreePath(currentPath) : undefined
  const records = splitRecords(raw)
  const worktrees: GitWorktree[] = []

  records.forEach((lines, index) => {
    let path = ''
    let head: string | undefined
    let fullBranch: string | undefined
    let detached = false
    let bare = false
    let locked = false
    let lockReason: string | undefined
    let prunable = false
    let prunableReason: string | undefined

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length)
      }
      else if (line.startsWith('HEAD ')) {
        head = line.slice('HEAD '.length).trim()
      }
      else if (line.startsWith('branch ')) {
        fullBranch = line.slice('branch '.length).trim()
      }
      else if (line === 'detached') {
        detached = true
      }
      else if (line === 'bare') {
        bare = true
      }
      else if (line === 'locked' || line.startsWith('locked ')) {
        locked = true
        const reason = line.slice('locked'.length).trim()
        lockReason = reason || undefined
      }
      else if (line === 'prunable' || line.startsWith('prunable ')) {
        prunable = true
        const reason = line.slice('prunable'.length).trim()
        prunableReason = reason || undefined
      }
    }

    if (!path)
      return

    const normalizedPath = normalizeWorktreePath(path)
    const branch = fullBranch ? shortenBranch(fullBranch) : undefined

    worktrees.push({
      path,
      branch,
      fullBranch,
      head: head || undefined,
      shortHead: head ? head.slice(0, 7) : undefined,
      isMain: index === 0,
      isCurrent: normalizedCurrent !== undefined && normalizedPath === normalizedCurrent,
      detached,
      locked,
      lockReason,
      prunable,
      prunableReason,
      bare,
    })
  })

  return worktrees
}

/** 将完整 ref（refs/heads/foo）转为短名（foo）。 */
export function shortenBranch(fullBranch: string): string {
  return fullBranch
    .replace(/^refs\/heads\//, '')
    .replace(/^refs\/remotes\//, '')
}

/** 从解析结果中取主工作树分支短名。 */
export function getMainWorktreeBranch(worktrees: GitWorktree[]): string | undefined {
  const main = worktrees.find(worktree => worktree.isMain)
  return main?.branch
}
