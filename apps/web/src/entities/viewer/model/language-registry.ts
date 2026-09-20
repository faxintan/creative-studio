const aliases: Record<string, string> = {
  css: 'css',
  html: 'html',
  js: 'javascript',
  json: 'json',
  jsx: 'javascript',
  md: 'markdown',
  sh: 'shell',
  ts: 'typescript',
  tsx: 'typescript',
  yaml: 'yaml',
  yml: 'yaml',
};

export function languageForPath(path: string) {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return aliases[extension] ?? 'plain-text';
}
