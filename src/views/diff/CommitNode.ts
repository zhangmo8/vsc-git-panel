import * as vscode from 'vscode'
import type { DiffTreeItem } from './types'

export class CommitNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public description: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly iconName: string,
    public readonly children?: any[],
  ) {
    super(label, collapsibleState)
    this.tooltip = description
    this.description = description
    this.iconPath = new vscode.ThemeIcon(iconName)
    this.children = children
  }

  static fromDiffItem(item: DiffTreeItem): CommitNode {
    return new CommitNode(
      item.label,
      item.description,
      item.collapsibleState,
      item.iconName,
      item.children,
    )
  }
}
