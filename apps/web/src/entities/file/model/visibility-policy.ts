import type { FileNode } from '@creative-studio/contracts';

export function displayableNode(node: FileNode) {
  return node.visibility !== 'excluded';
}

export function sortNodes(nodes: FileNode[]) {
  return [...nodes].filter(displayableNode).sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}
