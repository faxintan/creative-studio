import { responseLimits } from '../config/limits.js';
import { BridgeError } from '../domain/errors.js';

export function validateSearchQuery(query: string) {
  if (query.length > responseLimits.maxSearchQueryChars) {
    throw new BridgeError('SEARCH_QUERY_TOO_LARGE');
  }
  return query;
}

export function clampLimit(value: number | undefined, fallback = responseLimits.maxSearchResults) {
  return Math.min(Math.max(1, value ?? fallback), fallback);
}
