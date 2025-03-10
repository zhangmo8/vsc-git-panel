import type { DefaultLogFields, ListLogLine, LogResult } from 'simple-git'

export interface CommitFile {
  path: string
  status: string
  oldPath?: string
}

export type Commit = CommitFields & ListLogLine

export interface CommitFields extends DefaultLogFields {
  authorName: string
  authorEmail: string
  files?: Array<CommitFile>
  parents?: Array<string>
  children?: Array<string>
  isMergeCommit?: boolean
}

export interface ExtendedLogResult extends LogResult<CommitFields> {
}

export interface BaseOperation {
  type: 'commit' | 'merge'
  branch: string
  hash: string
  message: string
  branchChanged: boolean
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
