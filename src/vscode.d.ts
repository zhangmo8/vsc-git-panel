interface WebviewApi<T> {
  getState: () => T | undefined
  setState: (state: T) => void
  postMessage: (message: any) => void
}

declare function acquireVsCodeApi<T = unknown>(): WebviewApi<T>
