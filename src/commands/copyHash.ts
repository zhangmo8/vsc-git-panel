import { env } from 'vscode'
import { logger } from '@/utils'

export default async function copyHashCommand(hash?: string) {
  if (!hash) {
    logger.warn('No hash provided to copy')
    return
  }

  try {
    await env.clipboard.writeText(hash)
    logger.info(`Copied hash to clipboard: ${hash}`)
  }
  catch (error) {
    logger.error('Failed to copy hash to clipboard:', error)
  }
}
