// webview to vscode channel
export const WEBVIEW_CHANNEL = {
  GET_HISTORY: 'get-history',
  SHOW_COMMIT_DETAILS: 'show-commit-details',
} as const

// vscode to webview channel
export const CHANNEL = {
  HISTORY: 'history',
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
