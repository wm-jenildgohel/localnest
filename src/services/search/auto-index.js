export async function maybeBootstrapSemanticIndex({
  vectorIndex,
  autoIndex,
  autoIndexedScopes,
  getScopeKey,
  projectPath,
  allRoots,
  query,
  maxResults,
  minSemanticScore,
  defaultAutoIndexMaxFiles
}) {
  let semantic = vectorIndex
    ? await vectorIndex.semanticSearch({
      query,
      projectPath,
      allRoots,
      maxResults: maxResults * 3,
      minScore: minSemanticScore
    })
    : [];
  let autoIndexMeta = null;

  if (!vectorIndex || autoIndex === false || semantic.length > 0) {
    return { semantic, autoIndexMeta };
  }
  const scopeKey = typeof getScopeKey === 'function' ? getScopeKey() : '';

  if (autoIndexedScopes.has(scopeKey)) {
    return {
      semantic,
      autoIndexMeta: {
        attempted: false,
        scope: scopeKey,
        skipped_reason: 'already_attempted_for_scope'
      }
    };
  }

  autoIndexedScopes.add(scopeKey);
  try {
    const indexResult = await vectorIndex.indexProject({
      projectPath,
      allRoots,
      force: false,
      maxFiles: defaultAutoIndexMaxFiles
    });
    semantic = await vectorIndex.semanticSearch({
      query,
      projectPath,
      allRoots,
      maxResults: maxResults * 3,
      minScore: minSemanticScore
    });
    autoIndexMeta = {
      attempted: true,
      scope: scopeKey,
      success: true,
      indexed_files: indexResult?.indexed_files ?? null,
      failed_files: Array.isArray(indexResult?.failed_files) ? indexResult.failed_files.length : null
    };
  } catch (error) {
    autoIndexMeta = {
      attempted: true,
      scope: scopeKey,
      success: false,
      error: String(error?.message || error)
    };
  }

  return { semantic, autoIndexMeta };
}
