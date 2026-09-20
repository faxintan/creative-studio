export type WorkspaceStatus = 'opening' | 'ready' | 'error';
export type FileKind = 'directory' | 'file';
export type ContentType = 'text' | 'binary' | 'unknown';
export type FileVisibility = 'visible' | 'hidden' | 'excluded';
export type FileAvailability = 'readable' | 'unreadable' | 'missing';
export type ContentState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';
export type SearchScope = 'document' | 'workspace';
export type SearchStatus = 'idle' | 'searching' | 'complete' | 'error';

export interface Workspace {
  workspaceId: string;
  displayName: string;
  rootReference?: string;
  status: WorkspaceStatus;
  errorCode?: string | null;
}

export interface FileNode {
  nodeId: string;
  parentId?: string | null;
  name: string;
  relativePath: string;
  kind: FileKind;
  contentType?: ContentType;
  visibility: FileVisibility;
  availability: FileAvailability;
  hasChildren: boolean;
}

export interface OpenDocument {
  documentId: string;
  nodeId: string;
  relativePath: string;
  title: string;
  active: boolean;
  contentState: ContentState;
  lastErrorCode?: string | null;
}

export interface ViewerContent {
  documentId: string;
  text: string;
  lineCount: number;
  languageId: string;
  encoding: string;
  lineEnding: 'lf' | 'crlf' | 'cr' | 'mixed' | 'unknown';
  renderState: ContentState;
}

export interface SearchQuery {
  query: string;
  scope: SearchScope;
  documentId?: string | null;
  path?: string | null;
  caseSensitive: boolean;
  includeHidden: boolean;
  status: SearchStatus;
}

export interface SearchResult {
  resultId: string;
  relativePath: string;
  line: number;
  column: number;
  preview: string;
  matchStart: number;
  matchLength: number;
}
