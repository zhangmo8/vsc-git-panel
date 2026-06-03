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
