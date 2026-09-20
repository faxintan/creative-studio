import type { FastifyRequest } from 'fastify';
import { config } from '../../config.js';
import { BridgeError } from '../../domain/errors.js';

export function assertAllowedOrigin(request: FastifyRequest) {
  const origin = request.headers.origin;
  if (!origin || config.origins.has(origin)) return;
  throw new BridgeError('ORIGIN_NOT_ALLOWED');
}
