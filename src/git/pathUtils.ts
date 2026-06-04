import path from 'node:path'
import type { Uri } from 'vscode'

export function isInsideRepo(rootRepoPath: string, filePath: string): boolean {
  const relativePath = path.relative(rootRepoPath, filePath)
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

export function getRelativePath(rootRepoPath: string, uri: Uri): string | null {
  if (uri.scheme !== 'file')
    return null

  if (!isInsideRepo(rootRepoPath, uri.fsPath))
    return null

  const relativePath = path.relative(rootRepoPath, uri.fsPath)
  return relativePath ? relativePath.split(path.sep).join('/') : '.'
}
