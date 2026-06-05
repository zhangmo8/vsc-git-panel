export const COMMIT_TABLE_COLUMNS = [
  { key: 'branchName', label: 'Refs' },
  { key: 'branch', label: 'Graph' },
  { key: 'hash', label: 'CommitId' },
  { key: 'message', label: 'Message' },
  { key: 'stats', label: 'Changes' },
  { key: 'author', label: 'Author' },
  { key: 'date', label: 'Date' },
] as const

export type CommitTableColumn = typeof COMMIT_TABLE_COLUMNS[number]['key']
export type ColumnWidths = Record<CommitTableColumn, number>
export type ColumnVisibility = Record<CommitTableColumn, boolean>

export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  branch: 120,
  branchName: 140,
  hash: 80,
  message: 200,
  stats: 140,
  author: 120,
  date: 160,
}

export const MIN_COLUMN_WIDTHS: ColumnWidths = {
  branchName: 80,
  branch: 60,
  hash: 60,
  message: 110,
  stats: 90,
  author: 70,
  date: 90,
}

export const DEFAULT_COLUMN_VISIBILITY: ColumnVisibility = {
  branchName: true,
  branch: true,
  hash: true,
  message: true,
  stats: true,
  author: true,
  date: true,
}

const FLEXIBLE_COLUMN_PREFERENCE: readonly CommitTableColumn[] = [
  'branchName',
  'message',
  'author',
  'date',
  'hash',
  'stats',
  'branch',
]

export function normalizeColumnVisibility(visibility?: Partial<ColumnVisibility>): ColumnVisibility {
  return COMMIT_TABLE_COLUMNS.reduce((normalized, column) => {
    normalized[column.key] = visibility?.[column.key] !== false
    return normalized
  }, {} as ColumnVisibility)
}

export function isCommitColumnVisible(visibility: Partial<ColumnVisibility> | undefined, column: CommitTableColumn) {
  return visibility?.[column] !== false
}

export function getFlexibleColumn(visibility: Partial<ColumnVisibility> | undefined): CommitTableColumn {
  return FLEXIBLE_COLUMN_PREFERENCE.find(column => isCommitColumnVisible(visibility, column)) ?? 'message'
}

export function getCommitColumnStyle(
  column: CommitTableColumn,
  widths: Partial<ColumnWidths> | undefined,
  flexibleColumn: CommitTableColumn,
) {
  const width = widths?.[column] ?? DEFAULT_COLUMN_WIDTHS[column]
  const minWidth = MIN_COLUMN_WIDTHS[column]

  if (column === flexibleColumn) {
    return {
      flex: `1 1 ${width}px`,
      minWidth: `${minWidth}px`,
    }
  }

  if (column === 'branch') {
    return {
      flex: `0 0 ${width}px`,
      minWidth: `${minWidth}px`,
      width: `${width}px`,
    }
  }

  return {
    flex: `0 1 ${width}px`,
    minWidth: `${minWidth}px`,
  }
}
