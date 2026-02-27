import { GitExecutor } from '../git/executor';
import type { GitStatus, SyncResult, PullResult, PushResult, SyncStatus } from '../git/types';
import { generateCommitMessage } from '../utils/helpers';
import type GitSyncPlugin from '../../main';

/**
 * Callback types for sync events
 */
export type StatusChangeCallback = (status: SyncStatus, message: string) => void;

/**
 * Manages the Git sync workflow
 */
export class SyncManager {
  private git: GitExecutor;
  private plugin: GitSyncPlugin;
  private syncLock: boolean = false;
  private autoSyncInterval: number | null = null;
  private onStatusChange: StatusChangeCallback | null = null;
  private lastSyncTime: Date | null = null;
  private lastSyncResult: SyncResult | null = null;

  constructor(plugin: GitSyncPlugin) {
    this.plugin = plugin;
    this.git = new GitExecutor(plugin.settings.gitPath, this.getVaultPath());
  }

  /**
   * Get the vault path
   */
  private getVaultPath(): string {
    return (this.plugin.app.vault.adapter as any).basePath;
  }

  /**
   * Set the status change callback
   */
  setStatusCallback(callback: StatusChangeCallback): void {
    this.onStatusChange = callback;
  }

  /**
   * Update status and notify callback
   */
  private updateStatus(status: SyncStatus, message: string): void {
    if (this.onStatusChange) {
      this.onStatusChange(status, message);
    }
  }

  /**
   * Check if sync is in progress
   */
  isSyncing(): boolean {
    return this.syncLock;
  }

  /**
   * Check if git is available and repository is initialized
   */
  async checkGitStatus(): Promise<{ available: boolean; isRepo: boolean; error?: string }> {
    const gitAvailable = await this.git.isGitAvailable();
    if (!gitAvailable) {
      return { available: false, isRepo: false, error: 'Git is not installed or not found in PATH' };
    }

    const isRepo = await this.git.isRepo();
    return { available: true, isRepo };
  }

  /**
   * Initialize repository
   */
  async initRepo(): Promise<void> {
    await this.git.init();
  }

  /**
   * Get current git status
   */
  async getStatus(): Promise<GitStatus> {
    return await this.git.status();
  }

  /**
   * Perform a full sync: pull -> commit -> push
   */
  async sync(): Promise<SyncResult> {
    if (this.syncLock) {
      return { success: false, message: 'Sync already in progress' };
    }

    this.syncLock = true;

    try {
      // Check git availability
      const { available, isRepo, error } = await this.checkGitStatus();
      if (!available) {
        this.updateStatus('error', error || 'Git not available');
        return { success: false, message: error || 'Git not available' };
      }

      if (!isRepo) {
        this.updateStatus('error', 'Not a git repository');
        return { success: false, message: 'Not a git repository. Please initialize a git repository first.' };
      }

      // Check for conflicts
      if (await this.git.hasConflicts()) {
        this.updateStatus('conflict', 'Merge conflicts detected');
        return { success: false, message: 'Merge conflicts detected. Please resolve them manually.', conflicts: [] };
      }

      // Pull changes
      this.updateStatus('pulling', 'Pulling changes...');
      const pullResult = await this.pullOnly();

      if (!pullResult.success && pullResult.conflicts.length > 0) {
        this.updateStatus('conflict', 'Merge conflicts detected');
        this.lastSyncResult = { success: false, message: 'Merge conflicts after pull', conflicts: pullResult.conflicts };
        return this.lastSyncResult;
      }

      // Commit and push
      this.updateStatus('pushing', 'Committing and pushing changes...');
      const pushResult = await this.commitAndPush();

      if (pushResult.success) {
        this.updateStatus('success', 'Sync completed successfully');
        this.lastSyncTime = new Date();
        this.lastSyncResult = { success: true, message: 'Sync completed', pulled: pullResult.files.length, pushed: pushResult.pushed };
        return this.lastSyncResult;
      } else {
        this.updateStatus('error', pushResult.message);
        this.lastSyncResult = { success: false, message: pushResult.message };
        return this.lastSyncResult;
      }
    } catch (error: any) {
      const message = error.message || 'Unknown error during sync';
      this.updateStatus('error', message);
      this.lastSyncResult = { success: false, message };
      return this.lastSyncResult;
    } finally {
      this.syncLock = false;
    }
  }

  /**
   * Pull changes from remote
   */
  async pullOnly(): Promise<PullResult> {
    try {
      // Check if remote exists
      const remote = await this.git.getRemoteName();
      if (!remote) {
        return { success: true, message: 'No remote configured, skipping pull', files: [], conflicts: [] };
      }

      // Fetch first
      await this.git.fetch();

      // Check if we're behind
      const status = await this.git.status();
      if (status.behind === 0) {
        return { success: true, message: 'Already up to date', files: [], conflicts: [] };
      }

      // Pull
      this.updateStatus('pulling', 'Pulling changes...');
      const result = await this.git.pull();

      return result;
    } catch (error: any) {
      // Check for conflicts
      if (await this.git.hasConflicts()) {
        const conflictFiles = await this.getStatus().then(s => s.conflicts);
        this.updateStatus('conflict', 'Merge conflicts detected');
        return { success: false, message: 'Merge conflicts detected', files: [], conflicts: conflictFiles };
      }

      throw error;
    }
  }

  /**
   * Commit all changes and push to remote
   */
  async commitAndPush(): Promise<PushResult> {
    try {
      // Get status
      const status = await this.git.status();

      if (status.clean) {
        // Nothing to commit, just push if we have commits
        if (status.ahead > 0) {
          this.updateStatus('pushing', 'Pushing changes...');
          return await this.git.push();
        }
        return { success: true, message: 'Nothing to commit or push', pushed: 0 };
      }

      // Add all changes
      await this.git.addAll();

      // Commit
      const message = generateCommitMessage(this.plugin.settings.commitMessage);
      await this.git.commit(message);

      // Push
      const hasUpstream = await this.git.hasUpstream();
      this.updateStatus('pushing', 'Pushing changes...');

      if (hasUpstream) {
        return await this.git.push();
      } else {
        return await this.git.pushWithUpstream();
      }
    } catch (error: any) {
      // Check if it's "nothing to commit"
      if (error.stdout?.includes('nothing to commit')) {
        // Try to push anyway
        try {
          return await this.git.push();
        } catch (pushError: any) {
          return { success: false, message: pushError.message, pushed: 0 };
        }
      }
      return { success: false, message: error.message, pushed: 0 };
    }
  }

  /**
   * Get last sync result
   */
  getLastSyncResult(): SyncResult | null {
    return this.lastSyncResult;
  }

  /**
   * Get last sync time
   */
  getLastSyncTime(): Date | null {
    return this.lastSyncTime;
  }

  /**
   * Start automatic sync
   */
  startAutoSync(): void {
    if (this.autoSyncInterval !== null) {
      this.stopAutoSync();
    }

    const intervalMs = this.plugin.settings.syncInterval * 60 * 1000;
    this.autoSyncInterval = window.setInterval(() => {
      this.sync().catch(error => {
        console.error('Auto-sync error:', error);
      });
    }, intervalMs);

    // Register for cleanup
    this.plugin.registerInterval(this.autoSyncInterval);
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync(): void {
    if (this.autoSyncInterval !== null) {
      window.clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }

  /**
   * Restart automatic sync (use after settings change)
   */
  restartAutoSync(): void {
    if (this.plugin.settings.autoSync) {
      this.stopAutoSync();
      this.startAutoSync();
    } else {
      this.stopAutoSync();
    }
  }

  /**
   * Initialize sync manager
   */
  async initialize(): Promise<void> {
    const { available, isRepo } = await this.checkGitStatus();

    if (!available) {
      this.updateStatus('error', 'Git not available');
      return;
    }

    if (!isRepo) {
      this.updateStatus('error', 'Not a git repository');
      return;
    }

    // Auto pull on start if enabled
    if (this.plugin.settings.autoPullOnStart) {
      try {
        await this.pullOnly();
      } catch (error) {
        console.error('Auto-pull error:', error);
      }
    }

    // Start auto sync if enabled
    if (this.plugin.settings.autoSync) {
      this.startAutoSync();
    }

    this.updateStatus('idle', 'Ready');
  }

  /**
   * Dispose the sync manager
   */
  dispose(): void {
    this.stopAutoSync();
  }
}