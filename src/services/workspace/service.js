import {
  normalizeTarget as normalizeTargetFn,
  resolveSearchBases as resolveSearchBasesFn,
  listProjects as listProjectsFn,
  projectTree as projectTreeFn,
  summarizeProject as summarizeProjectFn,
  readFileChunk as readFileChunkFn,
  readLinesWindowStream as readLinesWindowStreamFn,
  walkDirectories as walkDirectoriesFn,
  isLikelyTextFile as isLikelyTextFileFn,
  safeReadText as safeReadTextFn,
  isUnderRoots as isUnderRootsFn,
  splitRootIntoProjects as splitRootIntoProjectsFn,
  looksLikeProjectDir as looksLikeProjectDirFn,
  detectProjectMarkers as detectProjectMarkersFn
} from './helpers.js';

export class WorkspaceService {
  constructor({
    roots,
    ignoreDirs,
    textExtensions,
    projectMarkerFiles,
    projectHintDirs,
    extraProjectMarkers,
    maxFileBytes,
    autoProjectSplit,
    maxAutoProjects,
    forceSplitChildren
  }) {
    this.roots = roots;
    this.ignoreDirs = ignoreDirs;
    this.textExtensions = textExtensions;
    this.projectMarkerFiles = projectMarkerFiles;
    this.projectHintDirs = projectHintDirs;
    this.extraProjectMarkers = extraProjectMarkers;
    this.maxFileBytes = maxFileBytes;
    this.autoProjectSplit = autoProjectSplit;
    this.maxAutoProjects = maxAutoProjects;
    this.forceSplitChildren = forceSplitChildren;
  }

  listRoots() {
    return this.roots;
  }

  normalizeTarget(inputPath) {
    return normalizeTargetFn(this, inputPath);
  }

  resolveSearchBases(projectPath, allRoots) {
    return resolveSearchBasesFn(this, projectPath, allRoots);
  }

  listProjects(rootPath, maxEntries) {
    return listProjectsFn(this, rootPath, maxEntries);
  }

  projectTree(projectPath, maxDepth, maxEntries) {
    return projectTreeFn(this, projectPath, maxDepth, maxEntries);
  }

  summarizeProject(projectPath, maxFiles) {
    return summarizeProjectFn(this, projectPath, maxFiles);
  }

  async readFileChunk(requestedPath, startLine, endLine, maxSpan) {
    return readFileChunkFn(this, requestedPath, startLine, endLine, maxSpan);
  }

  async readLinesWindowStream(filePath, from, to) {
    return readLinesWindowStreamFn(filePath, from, to);
  }

  *walkDirectories(base) {
    yield * walkDirectoriesFn(this, base);
  }

  isLikelyTextFile(filePath) {
    return isLikelyTextFileFn(this, filePath);
  }

  safeReadText(filePath) {
    return safeReadTextFn(this, filePath);
  }

  isUnderRoots(targetPath) {
    return isUnderRootsFn(this, targetPath);
  }

  splitRootIntoProjects(rootPath) {
    return splitRootIntoProjectsFn(this, rootPath);
  }

  looksLikeProjectDir(dirPath) {
    return looksLikeProjectDirFn(this, dirPath);
  }

  detectProjectMarkers(projectPath) {
    return detectProjectMarkersFn(projectPath);
  }
}
