import type { ListLogLine, LogResult } from 'simple-git'

export interface CommitFile {
  path: string
  status: string
}

export interface Commit extends ListLogLine {
  hash: string
  authorName: string
  authorEmail: string
  message: string
  body: string
  date: string
  stats?: {
    files: number
    additions: number
    deletions: number
  }
  files?: Array<CommitFile>
}

export interface CommitStats {
  files: number
  additions: number
  deletions: number
}

export interface ExtendedLogResult extends LogResult {
  all: Array<LogResult['all'][0] & { stats?: CommitStats }>
}
