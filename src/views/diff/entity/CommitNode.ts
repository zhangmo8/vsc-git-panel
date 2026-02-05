import type { TreeItemCollapsibleState } from 'vscode'
import { ThemeIcon, TreeItem } from 'vscode'

import type { DiffTreeItem } from '../types'

export class CommitNode extends TreeItem {
  constructor(
    public readonly label: string,
    public description: string,
    public readonly collapsibleState: TreeItemCollapsibleState,
    public readonly iconName: string,
    public readonly children?: any[],
    public readonly hash?: string,
  ) {
    super(label, collapsibleState)
    this.tooltip = description
    this.description = description
    this.iconPath = new ThemeIcon(iconName)
    this.children = children

    // Set context value for menu integration
    if (iconName === 'git-commit' && hash) {
      this.contextValue = 'git-commit'
      // Enable copy functionality
      this.command = {
        title: 'Copy Hash',
        command: 'git-panel.copyHash',
        arguments: [hash],
      }
    }
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
