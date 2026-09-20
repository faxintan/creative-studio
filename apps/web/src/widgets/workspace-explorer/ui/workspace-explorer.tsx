import type { FileNode } from '@creative-studio/contracts';
import { sortNodes } from '../../../entities/file/model/visibility-policy';

interface Props {
  entries?: FileNode[];
  entriesByPath: Record<string, FileNode[]>;
  expanded: Set<string>;
  loading: Set<string>;
  activePath: string | null;
  onToggle: (node: FileNode) => void;
  onOpen: (node: FileNode) => void;
}

function FileIcon({ node }: { node: FileNode }) {
  return (
    <span className={`tree-icon ${node.kind}`} aria-hidden="true">
      {node.kind === 'directory' ? '▾' : '·'}
    </span>
  );
}

export function WorkspaceExplorer(props: Props) {
  return (
    <div className="tree" role="tree" aria-label="Workspace files">
      {sortNodes(props.entries ?? []).map((node) => (
        <TreeNode key={node.nodeId} node={node} depth={0} {...props} />
      ))}
      {!props.entries?.length && <div className="tree-empty">No files in this folder</div>}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  entriesByPath,
  expanded,
  loading,
  activePath,
  onToggle,
  onOpen,
}: Props & { node: FileNode; depth: number }) {
  const isOpen = expanded.has(node.relativePath);
  return (
    <div role="treeitem" aria-expanded={node.kind === 'directory' ? isOpen : undefined}>
      <button
        className={`tree-row ${activePath === node.relativePath ? 'active' : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => (node.kind === 'directory' ? onToggle(node) : onOpen(node))}
        title={node.relativePath}
      >
        <FileIcon node={node} />
        <span className="tree-name">{node.name}</span>
        {node.kind === 'directory' && loading.has(node.relativePath) && (
          <span className="tree-loading">...</span>
        )}
      </button>
      {isOpen &&
        sortNodes(entriesByPath[node.relativePath] ?? []).map((child) => (
          <TreeNode
            key={child.nodeId}
            node={child}
            depth={depth + 1}
            entriesByPath={entriesByPath}
            expanded={expanded}
            loading={loading}
            activePath={activePath}
            onToggle={onToggle}
            onOpen={onOpen}
          />
        ))}
    </div>
  );
}
