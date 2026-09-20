export type ErrorCode =
  | 'INVALID_DIRECTORY_REFERENCE'
  | 'ORIGIN_NOT_ALLOWED'
  | 'WORKSPACE_NOT_FOUND'
  | 'WORKSPACE_NOT_READABLE'
  | 'INVALID_RELATIVE_PATH'
  | 'DIRECTORY_NOT_FOUND'
  | 'DIRECTORY_NOT_READABLE'
  | 'FILE_NOT_FOUND'
  | 'FILE_NOT_READABLE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'INVALID_SEARCH_QUERY'
  | 'SEARCH_UNAVAILABLE'
  | 'SEARCH_QUERY_TOO_LARGE';

const messages: Record<ErrorCode, string> = {
  INVALID_DIRECTORY_REFERENCE: 'The selected directory reference is invalid.',
  ORIGIN_NOT_ALLOWED: 'This browser origin is not allowed to access the local Bridge.',
  WORKSPACE_NOT_FOUND: 'The selected workspace is not available.',
  WORKSPACE_NOT_READABLE: 'The selected workspace cannot be read.',
  INVALID_RELATIVE_PATH: 'The requested path is invalid.',
  DIRECTORY_NOT_FOUND: 'The requested directory is not available.',
  DIRECTORY_NOT_READABLE: 'The requested directory cannot be read.',
  FILE_NOT_FOUND: 'The requested file is not available.',
  FILE_NOT_READABLE: 'The requested file cannot be read.',
  UNSUPPORTED_FILE_TYPE: 'This file type cannot be displayed as text.',
  FILE_TOO_LARGE: 'This file is too large to display.',
  INVALID_SEARCH_QUERY: 'The search request is invalid.',
  SEARCH_UNAVAILABLE: 'Search is temporarily unavailable.',
  SEARCH_QUERY_TOO_LARGE: 'The search query is too long.',
};

export class BridgeError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly retryable = false,
    message = messages[code],
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

export function errorPayload(error: unknown) {
  const bridgeError =
    error instanceof BridgeError
      ? error
      : new BridgeError('SEARCH_UNAVAILABLE', true, 'The local Bridge could not complete the request.');

  return {
    error: {
      code: bridgeError.code,
      message: bridgeError.message,
      retryable: bridgeError.retryable,
    },
  };
}
