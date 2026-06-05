// webview to vscode channel
export const WEBVIEW_CHANNEL = {
  GET_HISTORY: 'get-history',
  GET_ALL_BRANCHES: 'get-all-branches',
  GET_ALL_AUTHORS: 'get-all-authors',
  SHOW_COMMIT_DETAILS: 'show-commit-details',
  SHOW_CHANGES_PANEL: 'show-changes-panel',
  GET_STASH_LIST: 'get-stash-list',
  GET_FILE_HISTORY: 'get-file-history',
  EXIT_FILE_HISTORY: 'exit-file-history',
  GET_GIT_REFS: 'get-git-refs',
  FETCH_REMOTE: 'fetch-remote',
  RUN_BRANCH_ACTION: 'run-branch-action',
  APPLY_STASH: 'apply-stash',
  POP_STASH: 'pop-stash',
  DROP_STASH: 'drop-stash',
  CLEAR_STASH: 'clear-stash',
  SHOW_STASH_DIFF: 'show-stash-diff',
  SHOW_STASH_DETAILS: 'show-stash-details',
} as const

// vscode to webview channel
export const CHANNEL = {
  HISTORY: 'history',
  BRANCHES: 'branches',
  AUTHORS: 'authors',
  CLEAR_SELECTED: 'clear-selected',
  BACK_TO_HEAD: 'back-to-head',
  ERROR: 'error',
  FILE_HISTORY: 'file-history',
  STASH_LIST: 'stash-list',
  STASH_ACTION_RESULT: 'stash-action-result',
  GIT_REFS: 'git-refs',
} as const

export const EXTENSION_SYMBOL = 'git-panel'
export const HISTORY_VIEW_ID = `${EXTENSION_SYMBOL}.historyView`
export const CHANGES_VIEW_ID = `${EXTENSION_SYMBOL}.changes`
export const PANEL_HISTORY_VIEW_ID = `${EXTENSION_SYMBOL}.panelHistoryView`
export const PANEL_CHANGES_VIEW_ID = `${EXTENSION_SYMBOL}.panelChanges`

export const GIT_STATUS = {
  MODIFIED: 'M',
  ADDED: 'A',
  DELETED: 'D',
  RENAMED: 'R',
  COPIED: 'C',
  UNTRACKED: 'U',
  IGNORED: 'I',
}
