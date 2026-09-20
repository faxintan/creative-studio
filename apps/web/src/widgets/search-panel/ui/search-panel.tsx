import type { SearchResponse } from '@creative-studio/contracts';

interface Props {
  query: string;
  scope: 'document' | 'workspace';
  loading: boolean;
  error: string | null;
  response: SearchResponse | null;
  onQuery: (value: string) => void;
  onScope: (scope: 'document' | 'workspace') => void;
  onSelect: (path: string, line: number, column: number) => void;
}

export function SearchPanel({ query, scope, loading, error, response, onQuery, onScope, onSelect }: Props) {
  return (
    <section className="search-panel" aria-label="Search">
      <div className="search-heading">
        <span className="eyebrow">SEARCH</span>
        {response && <span className="result-count">{response.results.length}{response.truncated ? '+' : ''} matches</span>}
      </div>
      <div className="search-input-wrap">
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search workspace"
          aria-label="Search workspace"
        />
        {loading && <span className="spinner" aria-label="Searching">◌</span>}
      </div>
      <div className="search-scope" role="group" aria-label="Search scope">
        <button className={scope === 'workspace' ? 'selected' : ''} onClick={() => onScope('workspace')}>Workspace</button>
        <button className={scope === 'document' ? 'selected' : ''} onClick={() => onScope('document')}>File</button>
      </div>
      {error && <div className="search-error">{error}</div>}
      {!query && <div className="search-hint">Type to search the current scope.</div>}
      {query && !loading && !error && response?.results.length === 0 && <div className="search-hint">No matches found.</div>}
      {!!response?.results.length && (
        <div className="search-results">
          {response.results.map((result) => (
            <button className="search-result" key={result.resultId} onClick={() => onSelect(result.relativePath, result.line, result.column)}>
              <span className="result-path">{result.relativePath}</span>
              <span className="result-location">Line {result.line}, column {result.column}</span>
              <span className="result-preview">{result.preview}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
