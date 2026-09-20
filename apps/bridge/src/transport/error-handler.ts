import type { FastifyReply } from 'fastify';
import { errorPayload } from '../domain/errors.js';

export function sendError(reply: FastifyReply, error: unknown) {
  const payload = errorPayload(error);
  const code = payload.error.code;
  const statusCode =
    code === 'ORIGIN_NOT_ALLOWED'
      ? 403
      : code.includes('NOT_FOUND')
        ? 404
        : code === 'FILE_TOO_LARGE' || code === 'SEARCH_QUERY_TOO_LARGE'
          ? 413
          : code === 'UNSUPPORTED_FILE_TYPE'
            ? 415
            : 400;
  return reply.code(statusCode).send(payload);
}
