import { useLogger } from 'reactive-vscode'
import { extensions } from 'vscode'

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
