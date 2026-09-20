import type { FastifyRequest } from 'fastify';
import { config } from '../../config.js';
import { BridgeError } from '../../domain/errors.js';

export function assertLocalToken(request: FastifyRequest) {
  if (!config.token) return;
  if (request.headers['x-bridge-token'] !== config.token) {
    throw new BridgeError('ORIGIN_NOT_ALLOWED');
  }
}
