// src/monaco/language.ts — map file extensions to Monaco language IDs.

const EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', jsonc: 'json',
  css: 'css', scss: 'scss', less: 'less',
  html: 'html', htm: 'html', handlebars: 'handlebars', hbs: 'handlebars',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp',
  php: 'php', sh: 'shell', bash: 'shell', zsh: 'shell',
  yml: 'yaml', yaml: 'yaml', xml: 'xml', svg: 'xml',
  sql: 'sql', dockerfile: 'dockerfile', makefile: 'makefile',
  ini: 'ini', toml: 'ini', conf: 'ini', gradle: 'ini',
};

export function languageForFile(path: string): string {
  const base = path.split('/').pop() ?? path;
  const lower = base.toLowerCase();
  if (lower === 'dockerfile') return 'dockerfile';
  if (lower === 'makefile') return 'makefile';
  if (lower === '.gitignore' || lower === '.gitattributes') return 'plaintext';
  const ext = base.includes('.') ? base.split('.').pop() ?? '' : '';
  return EXT[ext.toLowerCase()] ?? 'plaintext';
}
