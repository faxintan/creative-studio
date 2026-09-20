import { z } from 'zod';

export const errorCodeSchema = z.string().min(1);

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
  }),
});

export const workspaceSchema = z.object({
  workspaceId: z.string().min(1),
  displayName: z.string().min(1),
  status: z.enum(['opening', 'ready', 'error']),
  errorCode: z.string().nullable().optional(),
});

export const createWorkspaceRequestSchema = z.object({
  directoryReference: z.string().min(1),
});

export const fileNodeSchema = z.object({
  nodeId: z.string().min(1),
  parentId: z.string().nullable().optional(),
  name: z.string().min(1),
  relativePath: z.string(),
  kind: z.enum(['directory', 'file']),
  contentType: z.enum(['text', 'binary', 'unknown']).optional(),
  visibility: z.enum(['visible', 'hidden', 'excluded']),
  availability: z.enum(['readable', 'unreadable', 'missing']),
  hasChildren: z.boolean(),
});

export const treeResponseSchema = z.object({
  workspaceId: z.string(),
  path: z.string(),
  entries: z.array(fileNodeSchema),
  nextCursor: z.string().nullable(),
});

export const contentResponseSchema = z.object({
  workspaceId: z.string(),
  documentId: z.string(),
  relativePath: z.string(),
  contentType: z.enum(['text', 'binary', 'unknown']),
  languageId: z.string(),
  encoding: z.string(),
  lineEnding: z.enum(['lf', 'crlf', 'cr', 'mixed', 'unknown']),
  content: z.string(),
});

export const searchRequestSchema = z.object({
  query: z.string().max(2000),
  scope: z.enum(['document', 'workspace']),
  documentId: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  caseSensitive: z.boolean().default(false),
  includeHidden: z.boolean().default(true),
  limit: z.number().int().positive().max(500).default(200),
});

export const searchResponseSchema = z.object({
  workspaceId: z.string(),
  query: z.string(),
  scope: z.enum(['document', 'workspace']),
  truncated: z.boolean(),
  results: z.array(
    z.object({
      resultId: z.string(),
      relativePath: z.string(),
      line: z.number().int().positive(),
      column: z.number().int().positive(),
      preview: z.string(),
      matchStart: z.number().int().nonnegative(),
      matchLength: z.number().int().positive(),
    }),
  ),
});

export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;
export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type TreeResponse = z.infer<typeof treeResponseSchema>;
export type ContentResponse = z.infer<typeof contentResponseSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
