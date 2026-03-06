import path from 'node:path';

export const LANG_BY_EXT = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hh': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.phtml': 'php',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.kts': 'kotlin',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.lua': 'lua',
  '.dart': 'dart',
  '.scala': 'scala'
};

export const DECL_TYPES_BY_LANG = {
  javascript: new Set(['function_declaration', 'method_definition', 'class_declaration']),
  typescript: new Set(['function_declaration', 'method_definition', 'class_declaration', 'interface_declaration', 'type_alias_declaration', 'enum_declaration']),
  tsx: new Set(['function_declaration', 'method_definition', 'class_declaration', 'interface_declaration', 'type_alias_declaration', 'enum_declaration']),
  python: new Set(['function_definition', 'class_definition']),
  go: new Set(['function_declaration', 'method_declaration', 'type_declaration']),
  rust: new Set(['function_item', 'struct_item', 'impl_item', 'trait_item', 'enum_item', 'mod_item']),
  java: new Set(['class_declaration', 'interface_declaration', 'enum_declaration', 'method_declaration', 'constructor_declaration', 'record_declaration']),
  c: new Set(['function_definition', 'struct_specifier']),
  cpp: new Set(['function_definition', 'class_specifier', 'struct_specifier', 'namespace_definition']),
  csharp: new Set(['class_declaration', 'struct_declaration', 'interface_declaration', 'enum_declaration', 'method_declaration', 'constructor_declaration', 'record_declaration']),
  ruby: new Set(['class', 'module', 'method']),
  php: new Set(['class_declaration', 'interface_declaration', 'trait_declaration', 'function_definition', 'method_declaration', 'enum_declaration']),
  bash: new Set(['function_definition']),
  kotlin: new Set(['class_declaration', 'interface_declaration', 'object_declaration', 'function_declaration', 'enum_class_body']),
  swift: new Set(['class_declaration', 'struct_declaration', 'enum_declaration', 'protocol_declaration', 'function_declaration']),
  lua: new Set(['function_declaration']),
  dart: new Set(['class_definition', 'function_signature', 'function_body', 'enum_type']),
  scala: new Set(['class_definition', 'object_definition', 'trait_definition', 'function_definition'])
};

export const LANGUAGE_LOADERS = {
  javascript: async () => { const mod = await import('tree-sitter-javascript'); return mod.default || mod; },
  typescript: async () => { const mod = await import('tree-sitter-typescript'); return mod.typescript; },
  tsx: async () => { const mod = await import('tree-sitter-typescript'); return mod.tsx; },
  python: async () => { const mod = await import('tree-sitter-python'); return mod.default || mod; },
  go: async () => { const mod = await import('tree-sitter-go'); return mod.default || mod; },
  rust: async () => { const mod = await import('tree-sitter-rust'); return mod.default || mod; },
  java: async () => { const mod = await import('tree-sitter-java'); return mod.default || mod; },
  c: async () => { const mod = await import('tree-sitter-c'); return mod.default || mod; },
  cpp: async () => { const mod = await import('tree-sitter-cpp'); return mod.default || mod; },
  csharp: async () => { const mod = await import('tree-sitter-c-sharp'); return mod.default || mod; },
  ruby: async () => { const mod = await import('tree-sitter-ruby'); return mod.default || mod; },
  php: async () => { const mod = await import('tree-sitter-php'); return mod.php || mod.default || mod; },
  bash: async () => { const mod = await import('tree-sitter-bash'); return mod.default || mod; },
  kotlin: async () => { const mod = await import('tree-sitter-kotlin'); return mod.default || mod; },
  swift: async () => { const mod = await import('tree-sitter-swift'); return mod.default || mod; },
  lua: async () => { const mod = await import('tree-sitter-lua'); return mod.default || mod; },
  dart: async () => { const mod = await import('tree-sitter-dart'); return mod.default || mod; },
  scala: async () => { const mod = await import('tree-sitter-scala'); return mod.default || mod; }
};

export function getExt(filePath) {
  return path.extname(String(filePath || '')).toLowerCase();
}
