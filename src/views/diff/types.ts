import type * as vscode from 'vscode'

export interface DiffTreeItem {
  label: string
  description: string
  collapsibleState: vscode.TreeItemCollapsibleState
  iconName: string
  fileCount?: number
  children?: DiffTreeItem[]
}

export interface FileTreeItem {
  path: string
  status: string
}

export interface CommitDetails {
  hash: string
  authorName: string
  authorEmail: string
  date: string
  stats?: {
    files: number
    additions: number
    deletions: number
  }
}
