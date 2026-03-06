import path from 'node:path';

export function makeFileSignature(st) {
  return `${st.mtimeMs}:${st.size}`;
}

export function isUnderBase(filePath, bases) {
  const abs = path.resolve(filePath);
  return bases.some((base) => {
    const rel = path.relative(base, abs);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  });
}

export function stripTrailingSeparators(value) {
  return value.replace(/[\\/]+$/g, '');
}

export function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function scoreFromVecDistance(distance) {
  const raw = Number(distance);
  if (!Number.isFinite(raw)) return 0;
  return 1 / (1 + Math.max(0, raw));
}

export function buildBaseScopeClause(bases, column = 'file_path') {
  const clauses = [];
  const params = [];
  for (const base of bases) {
    const trimmed = stripTrailingSeparators(base);
    const slashDescendants = `${trimmed}/%`;
    const backslashDescendants = `${trimmed}\\%`;
    clauses.push(`(${column} = ? OR ${column} LIKE ? OR ${column} LIKE ?)`);
    params.push(base, slashDescendants, backslashDescendants);
  }
  return {
    where: clauses.length > 0 ? clauses.join(' OR ') : '1=0',
    params
  };
}
