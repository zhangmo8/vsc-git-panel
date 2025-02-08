import * as vscode from 'vscode'
import type { FileTreeItem } from '../types'

export class FileNode extends vscode.TreeItem {
  constructor(
    public readonly path: string,
    public readonly status: string,
  ) {
    const label = path.split('/').pop() || path
    super(label, vscode.TreeItemCollapsibleState.None)
    this.tooltip = `${status} ${path}`
    this.iconPath = this.getIconForStatus(status)
    this.command = {
      command: 'vscGitPanel.openDiff',
      title: 'Show Changes',
      arguments: [{ path: this.path, status: this.status }],
    }
  }

  private getIconForStatus(status: string): vscode.ThemeIcon {
    switch (status.trim()) {
      case 'M':
        return new vscode.ThemeIcon('diff-modified')
      case 'A':
        return new vscode.ThemeIcon('diff-added')
      case 'D':
        return new vscode.ThemeIcon('diff-removed')
      case 'R':
        return new vscode.ThemeIcon('diff-renamed')
      default:
        return new vscode.ThemeIcon('file')
    }
  }

  static fromFileItem(item: FileTreeItem): FileNode {
    return new FileNode(
      item.path,
      item.status,
    )
  }
}
