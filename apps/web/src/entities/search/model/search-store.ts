import type { SearchResponse } from '@creative-studio/contracts';

export interface SearchState {
  query: string;
  scope: 'document' | 'workspace';
  response: SearchResponse | null;
  loading: boolean;
  error: string | null;
}

export const initialSearchState: SearchState = {
  query: '',
  scope: 'workspace',
  response: null,
  loading: false,
  error: null,
};
