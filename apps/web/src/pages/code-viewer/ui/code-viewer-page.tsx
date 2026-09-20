import { useEffect, useState } from 'react';
import type { ContentResponse, FileNode, SearchResponse, Workspace } from '@creative-studio/contracts';
import { getFileContent, getTree, pickWorkspace, searchWorkspace } from '../../../shared/api/bridge-client';
import { ApiError } from '../../../shared/api/api-error';
import { documentIdFor, type DocumentRecord } from '../../../entities/document/model/document-store';
import { WorkspaceExplorer } from '../../../widgets/workspace-explorer/ui/workspace-explorer';
import { OpenDocumentTabs } from '../../../widgets/open-documents/ui/open-document-tabs';
import { CodeViewport } from '../../../widgets/code-viewport/ui/code-viewport';
import { SearchPanel } from '../../../widgets/search-panel/ui/search-panel';
import '../../../styles.css';

function messageFor(error: unknown) {
  return error instanceof ApiError ? error.message : 'The local Bridge is unavailable.';
}

export function CodeViewerPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [entriesByPath, setEntriesByPath] = useState<Record<string, FileNode[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [documents, setDocuments] = useState<Record<string, DocumentRecord>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'document' | 'workspace'>('workspace');
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [revealLine, setRevealLine] = useState<number | null>(null);

  const activeDocument = activeId ? documents[activeId] : null;
  const rootEntries = entriesByPath[''] ?? [];
  const openDocuments = Object.values(documents);

  async function loadTree(path = '') {
    if (!workspace) return;
    setLoadingPaths((current) => new Set(current).add(path));
    try {
      const result = await getTree(workspace.workspaceId, path);
      setEntriesByPath((current) => ({ ...current, [path]: result.entries }));
    } catch (error) {
      setWorkspaceError(messageFor(error));
    } finally {
      setLoadingPaths((current) => {
        const next = new Set(current);
        next.delete(path);
        return next;
      });
    }
  }

  async function openSelectedWorkspace() {
    setWorkspaceError(null);
    try {
      const selected = await pickWorkspace();
      setWorkspace(selected);
      setEntriesByPath({});
      setExpanded(new Set());
      setDocuments({});
      setActiveId(null);
      await loadTreeForWorkspace(selected);
    } catch (error) {
      setWorkspaceError(messageFor(error));
    }
  }

  async function loadTreeForWorkspace(selected: Workspace, path = '') {
    setLoadingPaths((current) => new Set(current).add(path));
    try {
      const result = await getTree(selected.workspaceId, path);
      setEntriesByPath((current) => ({ ...current, [path]: result.entries }));
    } catch (error) {
      setWorkspaceError(messageFor(error));
    } finally {
      setLoadingPaths((current) => {
        const next = new Set(current);
        next.delete(path);
        return next;
      });
    }
  }

  async function toggleFolder(node: FileNode) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(node.relativePath)) next.delete(node.relativePath);
      else next.add(node.relativePath);
      return next;
    });
    if (!entriesByPath[node.relativePath]) await loadTree(node.relativePath);
  }

  async function openFile(node: FileNode) {
    if (!workspace || node.kind !== 'file') return;
    const id = documentIdFor(workspace.workspaceId, node.relativePath);
    setContentError(null);
    setActiveId(id);
    setDocuments((current) => ({
      ...current,
      [id]: current[id] ?? {
        documentId: id,
        nodeId: node.nodeId,
        relativePath: node.relativePath,
        title: node.name,
        active: true,
        contentState: 'loading',
        node,
      },
    }));
    try {
      const content = await getFileContent(workspace.workspaceId, node.relativePath);
      setDocuments((current) => {
        const document = current[id];
        if (!document) return current;
        return {
          ...current,
          [id]: { ...document, contentState: content.content ? 'ready' : 'empty', content },
        };
      });
    } catch (error) {
      const message = messageFor(error);
      setContentError(message);
      setDocuments((current) => {
        const document = current[id];
        if (!document) return current;
        return {
          ...current,
          [id]: {
            ...document,
            contentState: 'error',
            lastErrorCode: error instanceof ApiError ? error.code : 'REQUEST_FAILED',
          },
        };
      });
    }
  }

  function closeDocument(id: string) {
    setDocuments((current) => {
      const next = { ...current };
      delete next[id];
      const remaining = Object.keys(next);
      setActiveId((currentActive) => (currentActive === id ? remaining.at(-1) ?? null : currentActive));
      return next;
    });
  }

  useEffect(() => {
    if (!workspace || !query.trim()) {
      setSearch(null);
      setSearchError(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const result = await searchWorkspace(workspace.workspaceId, {
          query: query.trim(),
          scope,
          path: scope === 'document' ? activeDocument?.relativePath ?? null : null,
          documentId: scope === 'document' ? activeDocument?.documentId ?? null : null,
          caseSensitive: false,
          includeHidden: true,
          limit: 200,
        });
        if (!controller.signal.aborted) setSearch(result);
      } catch (error) {
        if (!controller.signal.aborted) setSearchError(messageFor(error));
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [activeDocument?.documentId, activeDocument?.relativePath, query, scope, workspace]);

  const title = workspace?.displayName ?? 'Code Viewer';
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark" aria-hidden="true" /> Creative Studio</div>
        <div className="workspace-head">
          <div>
            <div className="eyebrow">WORKSPACE</div>
            <div className="workspace-name">{workspace?.displayName ?? 'No workspace'}</div>
          </div>
          <button className="icon-button" onClick={openSelectedWorkspace} aria-label="Open workspace" title="Open workspace">+</button>
        </div>
        {workspaceError && <div className="search-error" role="alert">{workspaceError}</div>}
        {workspace && (
          <WorkspaceExplorer
            entries={rootEntries}
            entriesByPath={entriesByPath}
            expanded={expanded}
            loading={loadingPaths}
            activePath={activeDocument?.relativePath ?? null}
            onToggle={toggleFolder}
            onOpen={openFile}
          />
        )}
      </aside>

      <header className="toolbar">
        <span className="toolbar-title">{title}</span>
        <div className="toolbar-actions">
          <span className="eyebrow">READ ONLY</span>
          <button className="toolbar-button" onClick={openSelectedWorkspace}>Open workspace</button>
        </div>
      </header>

      <main className="main">
        <OpenDocumentTabs
          documents={openDocuments}
          activeId={activeId}
          onActivate={(id) => { setActiveId(id); setContentError(null); }}
          onClose={closeDocument}
        />
        <CodeViewport content={activeDocument?.content ?? null} error={contentError} revealLine={revealLine} />
      </main>

      <aside className="search-sidebar">
        <SearchPanel
          query={query}
          scope={scope}
          loading={searching}
          error={searchError}
          response={search}
          onQuery={setQuery}
          onScope={setScope}
          onSelect={(path, line) => {
            const node = Object.values(entriesByPath)
              .flat()
              .find((entry) => entry.relativePath === path) ?? {
              nodeId: `${workspace?.workspaceId}:${path}`,
              name: path.split('/').pop() ?? path,
              relativePath: path,
              kind: 'file' as const,
              contentType: 'text' as const,
              visibility: 'visible' as const,
              availability: 'readable' as const,
              hasChildren: false,
            };
            void openFile(node);
            setRevealLine(line);
          }}
        />
      </aside>
    </div>
  );
}
