import { describe, expect, it } from 'vitest'
import { getBranchRefs, getPrimaryBranch, normalizeRef } from '../src/git/utils'
import { buildHistoryLogArgs, buildOperations, createCacheKey, extractBranches, parseRawGitLog } from '../src/git/historyUtils'
import { parseGitBlameLine, parseGitDiffPreviousLine } from '../src/git/lineHistoryUtils'

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

describe('git line history helpers', () => {
  it('parses line porcelain blame output with previous revision metadata', () => {
    const rawBlame = [
      'abcdef1234567890abcdef1234567890abcdef12 8 12 1',
      'author Alice',
      'author-mail <alice@example.com>',
      'author-time 1717200000',
      'author-tz +0800',
      'summary feat: add inline history',
      'previous 1234567890abcdef1234567890abcdef12345678 src/old-index.ts',
      'filename src/index.ts',
      '\t  initLineHistory()',
    ].join('\n')

    expect(parseGitBlameLine(rawBlame, '  initOldHistory()')).toMatchObject({
      hash: 'abcdef1234567890abcdef1234567890abcdef12',
      shortHash: 'abcdef1',
      summary: 'feat: add inline history',
      authorName: 'Alice',
      authorEmail: 'alice@example.com',
      authorTime: 1717200000,
      authorTz: '+0800',
      filePath: 'src/index.ts',
      previousHash: '1234567890abcdef1234567890abcdef12345678',
      previousFilePath: 'src/old-index.ts',
      originalLine: 8,
      finalLine: 12,
      previousLineText: '  initOldHistory()',
      isUncommitted: false,
    })
  })

  it('detects uncommitted blame rows', () => {
    const rawBlame = [
      '0000000000000000000000000000000000000000 3 3 1',
      'author Not Committed Yet',
      'author-mail <not.committed.yet>',
      'summary Not Committed Yet',
      'filename src/index.ts',
      '\t  changed line',
    ].join('\n')

    expect(parseGitBlameLine(rawBlame)).toMatchObject({
      hash: '0000000000000000000000000000000000000000',
      shortHash: '0000000',
      summary: 'Not Committed Yet',
      authorName: 'Not Committed Yet',
      authorEmail: 'not.committed.yet',
      isUncommitted: true,
    })
  })

  it('finds the previous line text from a modified diff', () => {
    const rawDiff = [
      'diff --git a/a.txt b/a.txt',
      'index 4cb29ea..ae95719 100644',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -0,0 +1 @@',
      '+zero',
      '@@ -2 +3 @@ one',
      '-two',
      '+TWO',
    ].join('\n')

    expect(parseGitDiffPreviousLine(rawDiff, 3)).toBe('two')
  })

  it('matches the removed line by added line index in a modified hunk', () => {
    const rawDiff = [
      'diff --git a/a.txt b/a.txt',
      'index 4cb29ea..ae95719 100644',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -10,2 +10,2 @@',
      '-old first',
      '-old second',
      '+new first',
      '+new second',
    ].join('\n')

    expect(parseGitDiffPreviousLine(rawDiff, 10)).toBe('old first')
    expect(parseGitDiffPreviousLine(rawDiff, 11)).toBe('old second')
  })

  it('leaves pure additions without previous line text', () => {
    const rawDiff = [
      'diff --git a/a.txt b/a.txt',
      'index 4cb29ea..ae95719 100644',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -0,0 +1 @@',
      '+zero',
    ].join('\n')

    expect(parseGitDiffPreviousLine(rawDiff, 1)).toBeUndefined()
  })
})
