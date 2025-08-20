interface WebviewApi<T> {
  getState: () => T | undefined
  setState: (state: T) => void
  postMessage: (message: any) => void
}

interface State {
  commits: CommitGraph
  selectedHash?: string
  filter?: GitHistoryFilter
}

declare function acquireVsCodeApi<T = unknown>(): WebviewApi<T>
