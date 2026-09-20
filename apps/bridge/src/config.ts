export const config = {
  host: process.env.BRIDGE_HOST ?? '127.0.0.1',
  port: Number(process.env.BRIDGE_PORT ?? 8787),
  token: process.env.BRIDGE_TOKEN ?? '',
  origins: new Set(
    (process.env.BRIDGE_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ),
  limits: {
    directoryEntries: 200,
    fileBytes: 1_500_000,
    searchResults: 200,
    searchQuery: 2000,
    previewChars: 240,
  },
};
