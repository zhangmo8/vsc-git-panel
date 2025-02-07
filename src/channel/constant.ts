// webview to vscode channel
export const WEBVIEW_CHANNEL = {
  GET_HISTORY: 'get-history',
  SHOW_COMMIT_DETAILS: 'show-commit-details',
} as const

// vscode to webview channel
export const CHANNEL = {
  HISTORY: 'history',
  HISTORY_LOADED: 'history-loaded',
}
