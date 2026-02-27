/**
 * Git related type definitions
 */

export interface GitStatus {
  isRepo: boolean;
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
  conflicts: string[];
  clean: boolean;
}

export interface GitError extends Error {
  code?: string;
  stderr?: string;
  stdout?: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
  pulled?: number;
  pushed?: number;
  conflicts?: string[];
}

export interface PullResult {
  success: boolean;
  message: string;
  files: string[];
  conflicts: string[];
}

export interface PushResult {
  success: boolean;
  message: string;
  pushed: number;
}

export interface CommitResult {
  success: boolean;
  message: string;
  files: number;
}

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'pulling'
  | 'pushing'
  | 'committing'
  | 'error'
  | 'conflict'
  | 'success';

export interface StatusInfo {
  status: SyncStatus;
  message: string;
  lastSync?: Date;
  error?: string;
}