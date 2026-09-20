import { useEffect, useRef } from 'react';
import type { ContentResponse } from '@creative-studio/contracts';
import { lineCount, splitLines } from '../../../entities/viewer/model/line-map';

interface Props {
  content: ContentResponse | null;
  error: string | null;
  revealLine?: number | null;
}

function highlight(line: string) {
  const parts = line.split(/(\b(?:const|let|function|return|import|from|export|class|if|else|true|false)\b|\/\/.*|#.*|(["'`]).*?\2)/g);
  return parts.map((part, index) => {
    if (!part) return null;
    const className =
      /^\/\//.test(part) || /^#/.test(part) ? 'token-comment' : /^(const|let|function|return|import|from|export|class|if|else|true|false)$/.test(part) ? 'token-keyword' : /^["'`]/.test(part) ? 'token-string' : undefined;
    return <span className={className} key={`${part}-${index}`}>{part}</span>;
  });
}

export function CodeViewport({ content, error, revealLine }: Props) {
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (revealLine) lineRefs.current[revealLine]?.scrollIntoView({ block: 'center' });
  }, [revealLine, content?.documentId]);

  if (error) {
    return <div className="viewer-state error-state"><strong>Unable to open file</strong><span>{error}</span></div>;
  }
  if (!content) {
    return <div className="viewer-state"><span>Select a file to start reading.</span></div>;
  }
  if (!content.content) {
    return <div className="viewer-state"><strong>Empty file</strong><span>This file has no readable content.</span></div>;
  }

  return (
    <div className="code-viewport" aria-label={`${content.relativePath} code`}>
      <div className="code-meta">
        <span>{content.languageId}</span>
        <span>{content.encoding}</span>
        <span>{lineCount(content.content)} lines</span>
      </div>
      <div className="code-scroll">
        {splitLines(content.content).map((line, index) => {
          const lineNumber = index + 1;
          return (
            <div className="code-line" key={lineNumber} ref={(element) => { lineRefs.current[lineNumber] = element; }}>
              <span className="line-number">{lineNumber}</span>
              <code>{highlight(line)}</code>
            </div>
          );
        })}
      </div>
    </div>
  );
}
