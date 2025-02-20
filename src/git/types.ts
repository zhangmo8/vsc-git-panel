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
}

export interface ExtendedLogResult extends LogResult<CommitFields> {
}
