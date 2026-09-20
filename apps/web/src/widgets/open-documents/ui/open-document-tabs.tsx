import type { DocumentRecord } from '../../../entities/document/model/document-store';

interface Props {
  documents: DocumentRecord[];
  activeId: string | null;
  onActivate: (documentId: string) => void;
  onClose: (documentId: string) => void;
}

export function OpenDocumentTabs({ documents, activeId, onActivate, onClose }: Props) {
  return (
    <div className="tabs" role="tablist" aria-label="Open documents">
      {documents.map((document) => (
        <div className={`tab ${document.documentId === activeId ? 'active' : ''}`} key={document.documentId}>
          <button role="tab" aria-selected={document.documentId === activeId} onClick={() => onActivate(document.documentId)}>
            <span className="tab-dot" aria-hidden="true" />
            <span>{document.title}</span>
          </button>
          <button className="tab-close" onClick={() => onClose(document.documentId)} aria-label={`Close ${document.title}`}>
            ×
          </button>
        </div>
      ))}
      {!documents.length && <span className="tabs-empty">No open files</span>}
    </div>
  );
}
