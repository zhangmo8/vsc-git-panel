import { TreeItem, TreeItemCollapsibleState, Uri } from 'vscode'
import { EXTENSION_SYMBOL } from '@/constant'

export class FileNode extends TreeItem {
  constructor(
    public readonly path: string,
    public readonly status: string,
    public readonly commitHash: string,
    public readonly oldPath?: string,
  ) {
    // 为重命名的文件创建特殊的 URI
    const params = new URLSearchParams()
    params.set('status', status)
    if (oldPath) {
      params.set('oldPath', oldPath)
    }

    const uri = Uri.parse(`${EXTENSION_SYMBOL}:${path}?${params.toString()}`)
    super(uri, TreeItemCollapsibleState.None)

    this.tooltip = oldPath
      ? `${status} ${oldPath} → ${path}`
      : `${status} ${path}`

    this.command = {
      command: `${EXTENSION_SYMBOL}.openDiff`,
      title: 'Show Changes',
      arguments: [{ path: this.path, status: this.status, oldPath: this.oldPath, commitHash: this.commitHash }],
    }
  }
}
