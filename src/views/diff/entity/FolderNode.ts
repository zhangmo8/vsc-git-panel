import * as vscode from 'vscode'
import type { FileNode } from './FileNode'

export class FolderNode extends vscode.TreeItem {
  children: (FolderNode | FileNode)[] = []

  constructor(
    public readonly name: string,
    public readonly path: string,
  ) {
    super(name, vscode.TreeItemCollapsibleState.Expanded)
    this.iconPath = new vscode.ThemeIcon('folder')
    this.contextValue = 'folder'
  }

  addChild(child: FolderNode | FileNode) {
    this.children.push(child)
  }
}
