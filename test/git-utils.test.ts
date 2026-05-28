import { describe, expect, it } from 'vitest'
import { getBranchRefs, getPrimaryBranch, normalizeRef } from '../src/git/utils'
import { buildHistoryLogArgs, buildOperations, createCacheKey, extractBranches, parseRawGitLog } from '../src/git/historyUtils'

import type { Commit } from '../src/git/types'

describe('git ref utils', () => {
  it('normalizes common git ref formats', () => {
    expect(normalizeRef('(HEAD -> main)')).toBe('main')
    expect(normalizeRef('refs/heads/feature/demo')).toBe('feature/demo')
    expect(normalizeRef('refs/remotes/origin/main')).toBe('origin/main')
    expect(normalizeRef(',refs/heads/dev,')).toBe('dev')
  })

  it('extracts branch refs and ignores tags', () => {
    const refs = 'HEAD -> main, refs/remotes/origin/main, tag: v1.0.0'
    expect(getBranchRefs(refs)).toEqual(['main', 'origin/main'])
    expect(getPrimaryBranch(refs)).toBe('main')
  })
})

describe('git history helpers', () => {
  it('creates stable cache keys without mutating branch filters', () => {
    const filter = { branches: ['z', 'a'], author: 'alice', page: 2, pageSize: 20 }

    expect(createCacheKey(filter)).toBe('a,z|alice|||2|20')
    expect(filter.branches).toEqual(['z', 'a'])
  })

  it('builds log args for hash search without adding --all', () => {
    expect(buildHistoryLogArgs({ search: 'abcdef1' })).toEqual([
      '--max-count=1',
      'abcdef1',
      '--decorate=full',
      '--pretty=format:%H%x01%P%x01%an%x01%ae%x01%ad%x01%s%x01%d%x01%b',
      '--stat',
    ])
  })

  it('parses raw git log output with stats', () => {
    const rawLog = [
      'abcdef1234567890\x01parent1 parent2\x01Alice\x01alice@example.com\x012024-01-01\x01Merge branch\x01HEAD -> main\x01Body line',
      ' src/index.ts | 10 +++++-----',
      ' 1 file changed, 5 insertions(+), 5 deletions(-)',
    ].join('\n')

    const result = parseRawGitLog(rawLog)

    expect(result.all).toHaveLength(1)
    expect(result.all[0]).toMatchObject({
      hash: 'abcdef1234567890',
      parents: ['parent1', 'parent2'],
      authorName: 'Alice',
      authorEmail: 'alice@example.com',
      branchName: 'main',
      isMergeCommit: true,
      diff: { changed: 1, insertions: 5, deletions: 5 },
    })
  })

  it('extracts branches and builds operations', () => {
    const commits = [
      {
        hash: 'a',
        refs: 'refs/heads/main',
        message: 'first',
        isMergeCommit: false,
      },
      {
        hash: 'b',
        refs: 'tag: v1.0.0',
        message: 'second',
        isMergeCommit: true,
      },
    ] as Commit[]

    expect(extractBranches(commits)).toEqual(['main'])
    expect(buildOperations(commits)).toEqual([
      {
        type: 'commit',
        branch: 'main',
        hash: 'a',
        message: 'first',
        branchChanged: false,
        branchExplicit: true,
      },
      {
        type: 'merge',
        branch: 'main',
        hash: 'b',
        message: 'second',
        branchChanged: false,
        branchExplicit: false,
      },
    ])
  })
})
