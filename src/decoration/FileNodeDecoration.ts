import { EventEmitter, FileDecoration } from 'vscode'
import type { FileDecorationProvider, Uri } from 'vscode'

import { getColor, getTooltipForStatus } from './utils'
import { EXTENSION_SYMBOL } from '@/constant'
import { logger } from '@/utils'

export class FileNodeDecorationProvider implements FileDecorationProvider {
  private readonly _onDidChangeFileDecorations = new EventEmitter<Uri[]>()
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event

  provideFileDecoration(uri: Uri): FileDecoration | undefined {
    if (uri.scheme !== EXTENSION_SYMBOL) {
      return undefined
    }

    try {
      const params = new URLSearchParams(decodeURIComponent(uri.query))
      const status = params.get('status')

      if (!status) {
        logger.warn('No status in URI:', uri.toString())
        return undefined
      }

      return this.getDecorationForStatus(status)
    }
    catch (error) {
      logger.error('Error providing decoration:', error)
      return undefined
    }
  }

  private getDecorationForStatus(status: string): FileDecoration {
    const trimmedStatus = status.trim()

    return new FileDecoration(
      trimmedStatus,
      getTooltipForStatus(trimmedStatus),
      getColor(trimmedStatus),
    )
  }
}
