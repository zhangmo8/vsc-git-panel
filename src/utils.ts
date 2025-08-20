import type { Uri } from 'vscode'
import { useLogger } from 'reactive-vscode'
import { extensions } from 'vscode'

import { displayName } from './generated/meta'
import type { GIT_STATUS } from './constant'

export const logger = useLogger(displayName)

let _vscode: WebviewApi<State>
export function getVscodeApi() {
  if (!_vscode) {
    _vscode = acquireVsCodeApi()
  }
  return _vscode
}

export async function getGitPath() {
  try {
    const extension = extensions.getExtension(
      'vscode.git',
    )

    if (extension !== undefined) {
      const gitExtension = extension.isActive
        ? extension.exports
        : await extension.activate()

      return gitExtension.getAPI(1).git.path
    }
  }
  catch (err) {
    console.error(err)
  }

  return undefined
}

export function toGitUri(uri: Uri, ref: string): Uri {
  return uri.with({
    scheme: 'git',
    path: uri.path,
    query: JSON.stringify({
      path: uri.path,
      ref,
    }),
  })
}

export function parseGitStatus(status: string): { type: keyof typeof GIT_STATUS, similarity?: number } {
  const match = status.match(/^([A-Z])(\d+)?$/)
  if (match) {
    return {
      type: match[1] as keyof typeof GIT_STATUS,
      similarity: match[2] ? Number.parseInt(match[2], 10) : undefined,
    }
  }
  return { type: status as keyof typeof GIT_STATUS }
}

export function shortHash(hash: string): string {
  return hash.substring(0, 7)
}

export function getFileNameByPath(path: string): string {
  return path.split('/').pop() || ''
}
