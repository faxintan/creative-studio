export function openWorkspace(root: string) {
  return {
    root,
    label: 'workspace',
    ready: true,
  };
}
