import type { FastifyRequest } from 'fastify';

export function requestLog(request: FastifyRequest, statusCode: number) {
  return {
    method: request.method,
    route: request.routeOptions.url,
    statusCode,
    requestId: request.id,
  };
}
