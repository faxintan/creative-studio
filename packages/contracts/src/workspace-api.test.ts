import { describe, expect, it } from 'vitest';
import { errorEnvelopeSchema, searchRequestSchema } from './workspace-api.js';

describe('workspace API contracts', () => {
  it('accepts a bounded workspace search request', () => {
    const result = searchRequestSchema.parse({
      query: 'workspace',
      scope: 'workspace',
      includeHidden: true,
      limit: 20,
    });

    expect(result.caseSensitive).toBe(false);
    expect(result.limit).toBe(20);
  });

  it('rejects an oversized search query', () => {
    expect(() =>
      searchRequestSchema.parse({
        query: 'x'.repeat(2001),
        scope: 'workspace',
      }),
    ).toThrow();
  });

  it('keeps the stable error envelope', () => {
    expect(
      errorEnvelopeSchema.parse({
        error: { code: 'FILE_NOT_FOUND', message: 'The file is unavailable.', retryable: false },
      }).error.code,
    ).toBe('FILE_NOT_FOUND');
  });
});
