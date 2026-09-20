import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { registerRoutes } from './transport/routes.js';
import { assertAllowedOrigin } from './transport/security/origin-guard.js';
import { assertLocalToken } from './transport/security/token-guard.js';
import { requestLog } from './transport/logging.js';

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: [...config.origins],
  allowedHeaders: ['content-type', 'x-bridge-token'],
});

app.addHook('onRequest', async (request) => {
  assertAllowedOrigin(request);
  assertLocalToken(request);
});
app.addHook('onResponse', async (request, reply) => {
  request.log.info(requestLog(request, reply.statusCode));
});

app.get('/health', async () => ({ status: 'ok' }));
await registerRoutes(app);

await app.listen({ host: config.host, port: config.port });
