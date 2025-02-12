import simpleGit from 'simple-git'
import * as vscode from 'vscode'

import type { SimpleGit } from 'simple-git'
import type { ExtendedLogResult } from './types'

export * from './types'

export class GitService {
  private readonly rootRepoPath: string
  private _git: SimpleGit

  constructor() {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0)
      throw new Error('No workspace folder found. Please open a folder first.')

    this.rootRepoPath = vscode.workspace.workspaceFolders[0].uri.fsPath

    try {
      this._git = simpleGit(this.rootRepoPath, {
        binary: 'git',
        maxConcurrentProcesses: 10,
      })
    }
    catch (error) {
      throw new Error(`Fail to init git service: ${error}`)
    }
  }

  get git(): SimpleGit {
    return this._git
  }

  async getHistory(): Promise<ExtendedLogResult> {
    try {
      const logResult = await this.git.log([
        '--all',
        '--max-count=100',
        '--decorate=full',
      ]) as ExtendedLogResult

      // Get stats for each commit
      for (const commit of logResult.all) {
        try {
          const stats = await this.git.raw(['show', '--stat', '--format=', commit.hash])
          const lines = stats.trim().split('\n')
          const lastLine = lines[lines.length - 1]

          if (lastLine && lastLine.includes('changed')) {
            const filesMatch = lastLine.match(/(\d+) files? changed/)
            const addMatch = lastLine.match(/(\d+) insertions?\(\+\)/)
            const delMatch = lastLine.match(/(\d+) deletions?\(-\)/)

            commit.stats = {
              files: filesMatch ? Number.parseInt(filesMatch[1]) : 0,
              additions: addMatch ? Number.parseInt(addMatch[1]) : 0,
              deletions: delMatch ? Number.parseInt(delMatch[1]) : 0,
            }
          }
        }
        catch (error) {
          console.warn(`Failed to get stats for commit ${commit.hash}:`, error)
          commit.stats = { files: 0, additions: 0, deletions: 0 }
        }
      }

      return logResult
    }
    catch (error) {
      console.error('Error getting git history:', error)
      throw error
    }
  }

  async getPreviousCommit(commitHash: string): Promise<string | null> {
    try {
      const result = await this.git.raw(['rev-list', '--parents', '-n', '1', commitHash])
      const [, parentHash] = result.trim().split(' ')
      return parentHash || null
    }
    catch (error) {
      console.error('Failed to get parent commit:', error)
      return null
    }
  }

  static toGitUri(uri: vscode.Uri, ref: string): vscode.Uri {
    return uri.with({
      scheme: 'git',
      path: uri.path,
      query: JSON.stringify({
        path: uri.path,
        ref,
      }),
    })
  }
}
