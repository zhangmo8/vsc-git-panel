import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { createSingletonComposable, extensionContext, useWorkspaceFolders } from 'reactive-vscode'
import { Uri, workspace } from 'vscode'
import { logger } from './utils'

import type {
  Commit,
  CommitGraph,
  GitOperation,
  ProjectHotData,
  ProjectStorageInfo,
  StorageConfig,
} from '@/git/types'

const STORAGE_VERSION = '1.0.0'
const PROJECT_INDEX_FILE = 'project-index.json'
const GLOBAL_CONFIG_FILE = 'global-config.json'

// 默认配置
const DEFAULT_CONFIG: StorageConfig = {
  hotCacheSize: 50,
  warmCacheSize: 1000,
  maxProjects: 10,
  cleanupInterval: 60 * 60 * 1000, // 1小时
  compressionEnabled: true,
  preloadStrategy: 'conservative',
}

export const useStorage = createSingletonComposable(() => {
  const workspaceFolders = useWorkspaceFolders()

  // 内存缓存
  const hotCache = new Map<string, ProjectHotData>()
  const projectIndex = new Map<string, ProjectStorageInfo>()
  let config: StorageConfig = { ...DEFAULT_CONFIG }
  let currentProjectKey = ''

  // 获取存储基础路径
  function getStorageUri(): Uri {
    if (!extensionContext.value?.storageUri) {
      throw new Error('Extension storage URI not available')
    }
    return extensionContext.value.storageUri
  }

  // 获取项目唯一标识
  async function getProjectKey(workspacePath?: string): Promise<string> {
    try {
      const path = workspacePath || workspaceFolders.value?.[0]?.uri.fsPath
      if (!path) {
        throw new Error('No workspace path available')
      }

      // 尝试获取Git远程地址
      try {
        const { useGitService } = await import('@/git')
        const git = useGitService()
        const remoteUrl = await git.git.raw(['config', '--get', 'remote.origin.url'])
        return normalizeGitUrl(remoteUrl.trim())
      }
      catch {
        // 降级到本地路径hash
        return createHash('sha256').update(path).digest('hex').substring(0, 16)
      }
    }
    catch (error) {
      logger.error('Failed to get project key:', error)
      return 'default-project'
    }
  }

  // 标准化Git地址
  function normalizeGitUrl(url: string): string {
    return url
      .replace(/^https?:\/\/[^@]+@/, 'https://') // 移除认证信息
      .replace(/^git@([^:]+):/, 'https://$1/') // 转换SSH到HTTPS
      .replace(/\.git$/, '') // 移除.git后缀
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-') // 转换为文件名安全格式
  }

  // 获取项目存储路径
  function getProjectStorageUri(projectKey: string): Uri {
    return Uri.joinPath(getStorageUri(), 'projects', projectKey)
  }

  // 初始化存储系统
  async function initializeStorage(): Promise<void> {
    try {
      await workspace.fs.createDirectory(getStorageUri())
      await loadGlobalConfig()
      await loadProjectIndex()

      // 获取当前项目key
      currentProjectKey = await getProjectKey()

      // 预加载当前项目数据
      await preloadCurrentProject()

      // 启动清理任务
      scheduleCleanup()

      logger.info(`Storage initialized for project: ${currentProjectKey}`)
    }
    catch (error) {
      logger.error('Failed to initialize storage:', error)
      // 降级到内存模式
      config = { ...DEFAULT_CONFIG }
    }
  }

  // 加载全局配置
  async function loadGlobalConfig(): Promise<void> {
    try {
      const configUri = Uri.joinPath(getStorageUri(), GLOBAL_CONFIG_FILE)
      const data = await workspace.fs.readFile(configUri)
      const loaded = JSON.parse(data.toString())
      config = { ...DEFAULT_CONFIG, ...loaded }
    }
    catch {
      // 配置文件不存在，使用默认配置
      config = { ...DEFAULT_CONFIG }
      await saveGlobalConfig()
    }
  }

  // 保存全局配置
  async function saveGlobalConfig(): Promise<void> {
    try {
      const configUri = Uri.joinPath(getStorageUri(), GLOBAL_CONFIG_FILE)
      const data = JSON.stringify({ ...config, version: STORAGE_VERSION }, null, 2)
      await workspace.fs.writeFile(configUri, Buffer.from(data))
    }
    catch (error) {
      logger.error('Failed to save global config:', error)
    }
  }

  // 加载项目索引
  async function loadProjectIndex(): Promise<void> {
    try {
      const indexUri = Uri.joinPath(getStorageUri(), PROJECT_INDEX_FILE)
      const data = await workspace.fs.readFile(indexUri)
      const projects: ProjectStorageInfo[] = JSON.parse(data.toString())

      projectIndex.clear()
      projects.forEach((project) => {
        projectIndex.set(project.gitRemoteUrl, project)
      })
    }
    catch {
      // 索引文件不存在，创建空索引
      projectIndex.clear()
      await saveProjectIndex()
    }
  }

  // 保存项目索引
  async function saveProjectIndex(): Promise<void> {
    try {
      const indexUri = Uri.joinPath(getStorageUri(), PROJECT_INDEX_FILE)
      const projects = Array.from(projectIndex.values())
      const data = JSON.stringify(projects, null, 2)
      await workspace.fs.writeFile(indexUri, Buffer.from(data))
    }
    catch (error) {
      logger.error('Failed to save project index:', error)
    }
  }

  // 预加载当前项目
  async function preloadCurrentProject(): Promise<void> {
    if (!currentProjectKey)
      return

    try {
      const hotData = await loadHotData(currentProjectKey)
      if (hotData) {
        hotCache.set(currentProjectKey, hotData)
        logger.info(`Preloaded hot data for project: ${currentProjectKey}`)
      }
    }
    catch (error) {
      logger.error('Failed to preload current project:', error)
    }
  }

  // 加载热数据
  async function loadHotData(projectKey: string): Promise<ProjectHotData | null> {
    try {
      const projectUri = getProjectStorageUri(projectKey)
      const hotDataUri = Uri.joinPath(projectUri, 'hot-cache.json')
      const data = await workspace.fs.readFile(hotDataUri)
      return JSON.parse(data.toString())
    }
    catch {
      return null
    }
  }

  // 保存热数据
  async function saveHotData(projectKey: string, hotData: ProjectHotData): Promise<void> {
    try {
      const projectUri = getProjectStorageUri(projectKey)
      await workspace.fs.createDirectory(projectUri)

      const hotDataUri = Uri.joinPath(projectUri, 'hot-cache.json')
      const data = JSON.stringify(hotData, null, 2)
      await workspace.fs.writeFile(hotDataUri, Buffer.from(data))
    }
    catch (error) {
      logger.error('Failed to save hot data:', error)
    }
  }

  // 加载温数据
  async function loadWarmData(projectKey: string): Promise<CommitGraph | null> {
    try {
      const projectUri = getProjectStorageUri(projectKey)
      const warmDataUri = Uri.joinPath(projectUri, 'warm-cache.json')
      const data = await workspace.fs.readFile(warmDataUri)
      return JSON.parse(data.toString())
    }
    catch {
      return null
    }
  }

  // 保存温数据
  async function saveWarmData(projectKey: string, commitGraph: CommitGraph): Promise<void> {
    try {
      const projectUri = getProjectStorageUri(projectKey)
      await workspace.fs.createDirectory(projectUri)

      const warmDataUri = Uri.joinPath(projectUri, 'warm-cache.json')
      const data = JSON.stringify(commitGraph, null, 2)
      await workspace.fs.writeFile(warmDataUri, Buffer.from(data))
    }
    catch (error) {
      logger.error('Failed to save warm data:', error)
    }
  }

  // 获取提交数据（主要API）
  async function getCommits(): Promise<CommitGraph> {
    const projectKey = await getProjectKey()

    // 1. 尝试从热缓存获取
    const hotData = hotCache.get(projectKey)
    if (hotData && isHotDataValid(hotData)) {
      return buildCommitGraphFromHotData(hotData)
    }

    // 2. 尝试从温数据获取
    const warmData = await loadWarmData(projectKey)
    if (warmData) {
      // 更新热缓存
      const newHotData = extractHotDataFromCommitGraph(warmData)
      hotCache.set(projectKey, newHotData)
      await saveHotData(projectKey, newHotData)
      return warmData
    }

    // 3. 没有缓存数据，返回空结果
    return {
      operations: [],
      branches: [],
      logResult: {
        all: [],
        total: 0,
        latest: null,
      },
    }
  }

  // 保存提交数据
  async function saveCommits(commitGraph: CommitGraph): Promise<void> {
    const projectKey = await getProjectKey()

    // 更新项目信息
    const projectInfo: ProjectStorageInfo = {
      gitRemoteUrl: projectKey,
      localPath: workspaceFolders.value?.[0]?.uri.fsPath || '',
      lastAccessed: Date.now(),
      totalCommits: commitGraph.logResult.total,
      storageFiles: {
        metadata: 'metadata.json',
        hotData: 'hot-cache.json',
        warmData: 'warm-cache.json',
        coldData: [],
      },
    }

    projectIndex.set(projectKey, projectInfo)
    await saveProjectIndex()

    // 提取并保存热数据
    const hotData = extractHotDataFromCommitGraph(commitGraph)
    hotCache.set(projectKey, hotData)
    await saveHotData(projectKey, hotData)

    // 保存温数据
    await saveWarmData(projectKey, commitGraph)

    logger.info(`Saved commits for project: ${projectKey}, total: ${commitGraph.logResult.total}`)
  }

  // 更新提交文件信息
  async function updateCommitFiles(commitHash: string, files: Array<{ status: string, path: string }>): Promise<void> {
    const projectKey = await getProjectKey()

    // 更新热缓存
    const hotData = hotCache.get(projectKey)
    if (hotData) {
      const commit = hotData.recentCommits.find(c => c.hash === commitHash)
      if (commit) {
        commit.files = files
        await saveHotData(projectKey, hotData)
      }
    }

    // 更新温数据
    const warmData = await loadWarmData(projectKey)
    if (warmData) {
      const commit = warmData.logResult.all.find(c => c.hash === commitHash)
      if (commit) {
        commit.files = files
        await saveWarmData(projectKey, warmData)
      }
    }
  }

  // 获取单个提交
  async function getCommit(hash: string): Promise<Commit | undefined> {
    const projectKey = await getProjectKey()

    // 优先从热缓存查找
    const hotData = hotCache.get(projectKey)
    if (hotData) {
      const commit = hotData.recentCommits.find(c => c.hash === hash)
      if (commit)
        return commit
    }

    // 从温数据查找
    const warmData = await loadWarmData(projectKey)
    if (warmData) {
      return warmData.logResult.all.find(c => c.hash === hash)
    }

    return undefined
  }

  // 清除提交数据
  async function clearCommits(): Promise<void> {
    const projectKey = await getProjectKey()

    // 清除内存缓存
    hotCache.delete(projectKey)

    try {
      // 删除磁盘数据
      const projectUri = getProjectStorageUri(projectKey)
      await workspace.fs.delete(projectUri, { recursive: true, useTrash: false })

      // 从索引中移除
      projectIndex.delete(projectKey)
      await saveProjectIndex()

      logger.info(`Cleared commits for project: ${projectKey}`)
    }
    catch (error) {
      logger.error('Failed to clear commits:', error)
    }
  }

  // 工具函数：检查热数据是否有效
  function isHotDataValid(hotData: ProjectHotData): boolean {
    const maxAge = 60 * 60 * 1000 // 1小时
    return Date.now() - hotData.lastUpdated < maxAge
  }

  // 工具函数：从CommitGraph提取热数据
  function extractHotDataFromCommitGraph(commitGraph: CommitGraph): ProjectHotData {
    return {
      recentCommits: commitGraph.logResult.all.slice(0, config.hotCacheSize),
      activeBranches: commitGraph.branches,
      operations: commitGraph.operations.slice(0, config.hotCacheSize),
      lastUpdated: Date.now(),
    }
  }

  // 工具函数：从热数据构建CommitGraph
  function buildCommitGraphFromHotData(hotData: ProjectHotData): CommitGraph {
    return {
      operations: hotData.operations,
      branches: hotData.activeBranches,
      logResult: {
        all: hotData.recentCommits,
        total: hotData.recentCommits.length,
        latest: null,
      },
    }
  }

  // 清理任务
  let cleanupTimer: NodeJS.Timeout | null = null
  function scheduleCleanup(): void {
    if (cleanupTimer) {
      clearTimeout(cleanupTimer)
    }

    cleanupTimer = setTimeout(async () => {
      await performCleanup()
      scheduleCleanup() // 递归调度下次清理
    }, config.cleanupInterval)
  }

  // 执行清理
  async function performCleanup(): Promise<void> {
    try {
      const now = Date.now()
      const staleThreshold = 30 * 24 * 60 * 60 * 1000 // 30天

      // 查找过期项目
      const staleProjects: string[] = []
      for (const [key, info] of projectIndex) {
        if (now - info.lastAccessed > staleThreshold) {
          staleProjects.push(key)
        }
      }

      // 删除过期项目
      for (const projectKey of staleProjects) {
        try {
          const projectUri = getProjectStorageUri(projectKey)
          await workspace.fs.delete(projectUri, { recursive: true, useTrash: false })
          projectIndex.delete(projectKey)
          hotCache.delete(projectKey)
        }
        catch (error) {
          logger.error(`Failed to cleanup project ${projectKey}:`, error)
        }
      }

      if (staleProjects.length > 0) {
        await saveProjectIndex()
        logger.info(`Cleaned up ${staleProjects.length} stale projects`)
      }

      // 限制项目总数
      if (projectIndex.size > config.maxProjects) {
        const sortedProjects = Array.from(projectIndex.entries())
          .sort(([, a], [, b]) => b.lastAccessed - a.lastAccessed)

        const projectsToRemove = sortedProjects.slice(config.maxProjects)
        for (const [projectKey] of projectsToRemove) {
          try {
            const projectUri = getProjectStorageUri(projectKey)
            await workspace.fs.delete(projectUri, { recursive: true, useTrash: false })
            projectIndex.delete(projectKey)
            hotCache.delete(projectKey)
          }
          catch (error) {
            logger.error(`Failed to remove excess project ${projectKey}:`, error)
          }
        }

        if (projectsToRemove.length > 0) {
          await saveProjectIndex()
          logger.info(`Removed ${projectsToRemove.length} excess projects`)
        }
      }
    }
    catch (error) {
      logger.error('Failed to perform cleanup:', error)
    }
  }

  // 初始化存储
  initializeStorage().catch((error) => {
    logger.error('Storage initialization failed:', error)
  })

  return {
    saveCommits,
    updateCommitFiles,
    getCommits,
    getCommit,
    clearCommits,
    // 新增的API
    getProjectKey,
    getCurrentProjectKey: () => currentProjectKey,
    getStorageStats: () => ({
      hotCacheSize: hotCache.size,
      projectCount: projectIndex.size,
      config,
    }),
  }
})
