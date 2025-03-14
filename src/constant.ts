// webview to vscode channel
export const WEBVIEW_CHANNEL = {
  GET_HISTORY: 'get-history',
  SHOW_COMMIT_DETAILS: 'show-commit-details',
  SHOW_CHANGES_PANEL: 'show-changes-panel',
  CLEAR_HISTORY: 'clear-history',
} as const

// vscode to webview channel
export const CHANNEL = {
  HISTORY: 'history',
  CLEAR_SELECTED: 'clear-selected',
}

export const EXTENSION_SYMBOL = 'git-panel'

export const GIT_STATUS = {
  MODIFIED: 'M',
  ADDED: 'A',
  DELETED: 'D',
  RENAMED: 'R',
  COPIED: 'C',
  UNTRACKED: 'U',
  IGNORED: 'I',
}
