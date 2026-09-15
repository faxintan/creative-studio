'use strict';
function shouldReportPath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  if (!normalized || normalized.endsWith('/')) {
    return false;
  }
  const parts = normalized.split('/');
  const excludedDirs = new Set([
    '.git', 'node_modules', 'target', 'dist', 'build', 'out', 'coverage', '.next', '.turbo',
    '.cache', 'vendor', '__pycache__', '.venv', 'venv', 'bazel-bin', 'bazel-out', 'buck-out',
  ]);
  if (parts.some((part) => excludedDirs.has(part))) {
    return false;
  }
  const base = parts[parts.length - 1].toLowerCase();
  if (/^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|cargo\.lock|go\.sum)$/.test(base) || /\.min\.(js|css)$/.test(base)) {
    return false;
  }
  if (/\.(md|mdx|txt|text|rst|adoc|csv|tsv|map|lock|snap|log|out|tmp|temp|png|jpg|jpeg|gif|webp|ico|pdf|zip|gz|tgz|tar|mp4|mov|wasm)$/i.test(base)) {
    return false;
  }
  return true;
}

module.exports = { shouldReportPath };
