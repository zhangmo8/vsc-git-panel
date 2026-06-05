import { describe, expect, it } from 'vitest'
import { buildCommitWebUrl, getBranchRefs, getPrimaryBranch, normalizeRef, parseFileRevisions, parseRemoteUrl } from '../src/git/utils'
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

describe('remote url -> web commit url', () => {
  it('parses https, ssh-scp and ssh-protocol remotes', () => {
    expect(parseRemoteUrl('https://github.com/user/repo.git')).toEqual({ host: 'github.com', path: 'user/repo' })
    expect(parseRemoteUrl('git@github.com:user/repo.git')).toEqual({ host: 'github.com', path: 'user/repo' })
    expect(parseRemoteUrl('ssh://git@github.com:22/user/repo.git')).toEqual({ host: 'github.com', path: 'user/repo' })
    expect(parseRemoteUrl('https://user:token@gitlab.com/group/sub/repo.git')).toEqual({ host: 'gitlab.com', path: 'group/sub/repo' })
  })

  it('returns null for empty or unparseable remotes', () => {
    expect(parseRemoteUrl('')).toBeNull()
    expect(parseRemoteUrl(undefined)).toBeNull()
    expect(parseRemoteUrl('not a url')).toBeNull()
  })

  it('builds commit web urls per host flavor', () => {
    const hash = 'abc1234def5678'
    expect(buildCommitWebUrl('git@github.com:user/repo.git', hash)).toBe(`https://github.com/user/repo/commit/${hash}`)
    expect(buildCommitWebUrl('https://gitlab.com/group/repo.git', hash)).toBe(`https://gitlab.com/group/repo/commit/${hash}`)
    expect(buildCommitWebUrl('git@bitbucket.org:team/repo.git', hash)).toBe(`https://bitbucket.org/team/repo/commits/${hash}`)
  })

  it('returns null when remote or hash is missing', () => {
    expect(buildCommitWebUrl(undefined, 'abc1234')).toBeNull()
    expect(buildCommitWebUrl('git@github.com:user/repo.git', '')).toBeNull()
  })
})

describe('parse file revisions (git log --follow --name-status)', () => {
  it('lists revisions newest-first with the path at each commit', () => {
    const raw = [
      'f19350ebb5c0e3f987a6d5c385cd596ab6b0a847',
      '',
      'M\tpackage.json',
      '3829871f596a1fd0608b47f4f39ce1a5dbcba632',
      '',
      'M\tpackage.json',
    ].join('\n')

    expect(parseFileRevisions(raw)).toEqual([
      { commit: 'f19350ebb5c0e3f987a6d5c385cd596ab6b0a847', path: 'package.json' },
      { commit: '3829871f596a1fd0608b47f4f39ce1a5dbcba632', path: 'package.json' },
    ])
  })

  it('uses the new path for renamed files', () => {
    const raw = [
      '1111111111111111111111111111111111111111',
      'R096\tsrc/old/type.ts\tsrc/new/type.ts',
      '2222222222222222222222222222222222222222',
      'A\tsrc/old/type.ts',
    ].join('\n')

    expect(parseFileRevisions(raw)).toEqual([
      { commit: '1111111111111111111111111111111111111111', path: 'src/new/type.ts' },
      { commit: '2222222222222222222222222222222222222222', path: 'src/old/type.ts' },
    ])
  })

  it('returns an empty array for empty output', () => {
    expect(parseFileRevisions('')).toEqual([])
  })
})

describe('git history helpers', () => {
  it('creates stable cache keys without mutating branch filters', () => {
    const filter = { branches: ['z', 'a'], author: 'alice', page: 2, pageSize: 20 }

    expect(createCacheKey(filter)).toBe('a,z|alice|||||2|20')
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

  it('builds file history args with rename following when requested', () => {
    expect(buildHistoryLogArgs({ filePath: 'src/index.ts', followRenames: true, pageSize: 10 })).toEqual([
      '--all',
      '--follow',
      '--max-count=10',
      '--decorate=full',
      '--pretty=format:%H%x01%P%x01%an%x01%ae%x01%ad%x01%s%x01%d%x01%b',
      '--stat',
      '--',
      'src/index.ts',
    ])
  })

  it('builds line history args without pathspec', () => {
    expect(buildHistoryLogArgs({
      filePath: 'src/index.ts',
      lineRange: { start: 12, end: 10 },
      page: 2,
      pageSize: 5,
    })).toEqual([
      '--skip=5',
      '--max-count=5',
      '--decorate=full',
      '--pretty=format:%H%x01%P%x01%an%x01%ae%x01%ad%x01%s%x01%d%x01%b',
      '-L',
      '10,12:src/index.ts',
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
