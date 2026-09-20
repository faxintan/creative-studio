export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code = 'REQUEST_FAILED',
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string; retryable?: boolean } }
    | T
    | null;
  if (!response.ok) {
    const error = payload as { error?: { code?: string; message?: string; retryable?: boolean } };
    throw new ApiError(
      error.error?.message ?? 'The local Bridge could not complete the request.',
      error.error?.code,
      error.error?.retryable,
    );
  }
  return payload as T;
}
