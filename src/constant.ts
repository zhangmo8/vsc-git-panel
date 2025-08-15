// webview to vscode channel
export const WEBVIEW_CHANNEL = {
  GET_HISTORY: 'get-history',
  GET_ALL_BRANCHES: 'get-all-branches',
  GET_ALL_AUTHORS: 'get-all-authors',
  SHOW_COMMIT_DETAILS: 'show-commit-details',
  SHOW_CHANGES_PANEL: 'show-changes-panel',
} as const

// vscode to webview channel
export const CHANNEL = {
  HISTORY: 'history',
  BRANCHES: 'branches',
  AUTHORS: 'authors',
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
