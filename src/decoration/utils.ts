import { ThemeColor } from 'vscode'
import { GIT_STATUS } from '@/constant'

export function getColor(status: typeof GIT_STATUS[keyof typeof GIT_STATUS]): ThemeColor {
  const gitStatusColorMap: Record<typeof GIT_STATUS[keyof typeof GIT_STATUS], string> = {
    [GIT_STATUS.MODIFIED]: 'modifiedResourceForeground',
    [GIT_STATUS.DELETED]: 'deletedResourceForeground',
    [GIT_STATUS.ADDED]: 'addedResourceForeground',
    [GIT_STATUS.RENAMED]: 'renamedResourceForeground',
    [GIT_STATUS.UNTRACKED]: 'untrackedResourceForeground',
    [GIT_STATUS.IGNORED]: 'ignoredResourceForeground',
  }
  return new ThemeColor(`gitDecoration.${gitStatusColorMap[status]}`)
}

export function getTooltipForStatus(status: typeof GIT_STATUS[keyof typeof GIT_STATUS]): string {
  const gitStatusTooltipMap: Record<typeof GIT_STATUS[keyof typeof GIT_STATUS], string> = {
    [GIT_STATUS.MODIFIED]: 'Modified',
    [GIT_STATUS.DELETED]: 'Deleted',
    [GIT_STATUS.ADDED]: 'Added',
    [GIT_STATUS.RENAMED]: 'Renamed',
    [GIT_STATUS.UNTRACKED]: 'Untracked',
    [GIT_STATUS.IGNORED]: 'Ignored',
  }

  return gitStatusTooltipMap[status] || status
}
