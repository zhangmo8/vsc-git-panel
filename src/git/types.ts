import type { DefaultLogFields, ListLogLine, LogResult } from 'simple-git'

export interface CommitFile {
  path: string
  status: string
  oldPath?: string
}

export interface CommitDiffStats {
  changed: number
  insertions: number
  deletions: number
}

export type Commit = CommitFields & Omit<ListLogLine, 'diff'>

export interface CommitFields extends DefaultLogFields {
  authorName: string
  authorEmail: string
  files?: Array<CommitFile>
  summary?: string
  diff?: CommitDiffStats
  parents?: Array<string>
  children?: Array<string>
  isMergeCommit?: boolean
  branchName?: string
}

export interface ExtendedLogResult extends LogResult<CommitFields> {
}

export interface BaseOperation {
  type: 'commit' | 'merge'
  branch: string
  hash: string
  message: string
  branchChanged: boolean
  branchExplicit?: boolean
  branchColor?: string
}

export interface CommitOperation extends BaseOperation {
  sourceBranches?: string[]
  targetBranch?: string
  sourceBranchColors?: Record<string, string>
  targetBranchColor?: string
}

export type GitOperation = CommitOperation

export interface CommitGraph {
  logResult: ExtendedLogResult
  operations: GitOperation[]
  branches: string[]
}

export interface GitHistoryFilter {
  search?: string
  branches?: string[]
  author?: string
  page?: number
  pageSize?: number
  filePath?: string // Search commits that modified a specific file
  followRenames?: boolean
  lineRange?: {
    start: number
    end: number
  }
}

export interface GitHeadInfo {
  hash: string
  branch: string
}

export interface GitLineHistory {
  hash: string
  shortHash: string
  summary: string
  authorName: string
  authorEmail: string
  authorTime?: number
  authorTz?: string
  authorDate?: string
  filePath: string
  previousHash?: string
  previousFilePath?: string
  originalLine: number
  finalLine: number
  previousLineText?: string
  isUncommitted: boolean
}

export type GitRefType = 'local' | 'remote'
export type GitBranchAction = 'switch' | 'pull' | 'delete' | 'rename' | 'clone' | 'push'

export type GitWorktreeAction =
  | 'open'
  | 'openNewWindow'
  | 'reveal'
  | 'copyPath'
  | 'lock'
  | 'unlock'
  | 'remove'
  | 'merge'

export interface GitWorktree {
  /** worktree 绝对路径 */
  path: string
  /** 该 worktree 检出的分支短名（detached 时为空） */
  branch?: string
  /** 完整 ref，如 refs/heads/main */
  fullBranch?: string
  /** HEAD commit 完整 hash */
  head?: string
  /** HEAD commit 简短 hash */
  shortHead?: string
  /** 是否为主工作树 */
  isMain: boolean
  /** 是否为扩展当前打开的工作区 */
  isCurrent: boolean
  /** 是否 detached HEAD */
  detached: boolean
  /** 是否被锁定 */
  locked: boolean
  /** 锁定原因（若有） */
  lockReason?: string
  /** git 认为该目录已缺失、可被 prune */
  prunable: boolean
  /** prune 原因（若有） */
  prunableReason?: string
  /** 是否 bare */
  bare: boolean
}

export interface GitWorktreeSummary {
  worktrees: GitWorktree[]
  /** 主项目分支名，供 merge 目标展示 */
  mainBranch?: string
}

export interface AddWorktreeOptions {
  /** 目标目录（绝对或相对仓库根） */
  path: string
  /** 基于的 ref（分支/commit/tag） */
  ref?: string
  /** 若提供则以 -b 创建新分支 */
  newBranch?: string
  /** 以 detached HEAD 检出 */
  detach?: boolean
  /** 强制（覆盖已存在分支等） */
  force?: boolean
}

export interface GitBranchRef {
  /** Short ref name, such as `main` or `origin/main` */
  name: string
  /** Full ref name, such as `refs/heads/main` */
  fullName: string
  type: GitRefType
  current: boolean
  remote?: string
  upstream?: string
  ahead?: number
  behind?: number
  commit: string
  subject: string
  date: string
}

export interface GitRemoteRef {
  name: string
  fetchUrl?: string
  pushUrl?: string
  branches: GitBranchRef[]
}

export interface GitRefsSummary {
  branches: GitBranchRef[]
  remotes: GitRemoteRef[]
}

export interface StashEntry {
  /** stash 索引，如 0 表示 stash@{0} */
  index: number
  /** stash@{N} 形式的引用 */
  ref: string
  /** 完整 commit hash */
  hash: string
  /** 简短 hash */
  shortHash: string
  /** stash 所在分支 */
  branch: string
  /** stash 消息（不含分支/索引前缀） */
  message: string
  /** stash 创建时间 */
  date: string
  /** 相对时间，如 "2 hours ago" */
  relativeDate: string
  /** 作者名 */
  authorName: string
  /** 作者邮箱 */
  authorEmail: string
}
