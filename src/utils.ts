import { useLogger } from 'reactive-vscode'
import { extensions } from 'vscode'

import type { Uri } from 'vscode'

import { displayName } from './generated/meta'

export const logger = useLogger(displayName)

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

export function parseGitStatus(status: string): { type: string, similarity?: number } {
  const match = status.match(/^([A-Z])(\d+)?$/)
  if (match) {
    return {
      type: match[1],
      similarity: match[2] ? Number.parseInt(match[2], 10) : undefined,
    }
  }
  return { type: status }
}
