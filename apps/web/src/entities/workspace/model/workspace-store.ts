import type { Workspace } from '@creative-studio/contracts';

export interface WorkspaceState {
  workspace: Workspace | null;
  loading: boolean;
  error: string | null;
}

export const emptyWorkspaceState: WorkspaceState = {
  workspace: null,
  loading: false,
  error: null,
};
