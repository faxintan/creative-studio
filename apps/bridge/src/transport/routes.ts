import type { FastifyInstance } from 'fastify';
import { openWorkspace } from '../application/workspace/open-workspace.js';
import { listTree } from '../application/workspace/list-tree.js';
import { readFile } from '../application/files/read-file.js';
import { runSearch } from '../application/search/run-search.js';
import { pickDirectory } from '../infrastructure/system-picker.js';
import { createWorkspaceRequestSchema, searchRequestSchema } from '@creative-studio/contracts';
import { sendError } from './error-handler.js';
import { clampLimit, validateSearchQuery } from './validation.js';

function queryString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export async function registerRoutes(app: FastifyInstance) {
  app.post('/api/v1/workspaces/pick', async (request, reply) => {
    try {
      const directoryReference = await pickDirectory();
      const workspace = await openWorkspace(directoryReference);
      return reply.code(201).send({ workspace });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post<{ Body: unknown }>('/api/v1/workspaces', async (request, reply) => {
    try {
      const input = createWorkspaceRequestSchema.parse(request.body);
      const workspace = await openWorkspace(input.directoryReference);
      return reply.code(201).send({ workspace });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get<{ Params: { workspaceId: string }; Querystring: { path?: string; cursor?: string } }>(
    '/api/v1/workspaces/:workspaceId/tree',
    async (request, reply) => {
      try {
        const tree = await listTree(
          request.params.workspaceId,
          queryString(request.query.path),
          Number(queryString(request.query.cursor, '0')),
        );
        return reply.send({
          workspaceId: request.params.workspaceId,
          path: queryString(request.query.path),
          ...tree,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get<{
    Params: { workspaceId: string };
    Querystring: { path?: string };
  }>('/api/v1/workspaces/:workspaceId/files/content', async (request, reply) => {
    try {
      const content = await readFile(request.params.workspaceId, queryString(request.query.path));
      return reply.send(content);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post<{ Params: { workspaceId: string }; Body: unknown }>(
    '/api/v1/workspaces/:workspaceId/search',
    async (request, reply) => {
      try {
        const input = searchRequestSchema.parse(request.body);
        const search = await runSearch(request.params.workspaceId, {
          ...input,
          query: validateSearchQuery(input.query),
          limit: clampLimit(input.limit),
        });
        return reply.send({
          workspaceId: request.params.workspaceId,
          query: input.query,
          scope: input.scope,
          ...search,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
