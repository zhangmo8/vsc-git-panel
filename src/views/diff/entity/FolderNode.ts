import { TreeItem, TreeItemCollapsibleState, Uri } from 'vscode'
import type { FileNode } from './FileNode'
import { EXTENSION_SYMBOL } from '@/constant'

export class FolderNode extends TreeItem {
  children: (FolderNode | FileNode)[] = []

  constructor(
    public readonly name: string,
    public readonly path: string,
  ) {
    super(name, TreeItemCollapsibleState.Expanded)
    const uri = Uri.parse(`${EXTENSION_SYMBOL}:${path}?type=folder`)
    this.resourceUri = uri
    this.contextValue = 'folder'
  }

  addChild(child: FolderNode | FileNode) {
    this.children.push(child)
  }
}
