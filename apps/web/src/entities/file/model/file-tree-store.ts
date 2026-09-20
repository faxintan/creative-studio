import type { FileNode } from '@creative-studio/contracts';

export interface TreeState {
  entries: Record<string, FileNode[]>;
  expanded: Set<string>;
  loading: Set<string>;
}

export function createTreeState(): TreeState {
  return { entries: {}, expanded: new Set(), loading: new Set() };
}
