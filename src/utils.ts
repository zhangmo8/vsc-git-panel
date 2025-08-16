import type { Uri } from 'vscode'
import { useLogger } from 'reactive-vscode'
import { extensions } from 'vscode'

import { displayName } from './generated/meta'
import type { GIT_STATUS } from './constant'

const branchColorCache = new Map<string, string>()
let colorCounter = 0
const goldenRatio = 0.618033988749895

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

/**
 * @param branchName
 * @returns HSL color string
 */
export function getBranchColor(branchName: string): string {
  if (branchColorCache.has(branchName)) {
    return branchColorCache.get(branchName)!
  }

  let hash = 0
  for (let i = 0; i < branchName.length; i++) {
    hash = branchName.charCodeAt(i) + ((hash << 5) - hash)
  }

  const baseHue = Math.abs(hash) % 360

  const hue = (baseHue + colorCounter * goldenRatio * 360) % 360
  colorCounter++

  const saturation = 75
  const lightness = 50

  const color = `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`

  branchColorCache.set(branchName, color)

  return color
}

export function shortHash(hash: string): string {
  return hash.substring(0, 7)
}

export function getFileNameByPath(path: string): string {
  return path.split('/').pop() || ''
}
