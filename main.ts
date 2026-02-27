import { Plugin, Notice, Command } from 'obsidian';
import { GitExecutor } from './src/git/executor';
import { SyncManager } from './src/sync/sync-manager';
import { StatusBar } from './src/ui/status-bar';
import { GitSyncSettingTab, GitSyncSettings, DEFAULT_SETTINGS } from './src/ui/settings-tab';
import type { GitStatus, SyncResult } from './src/git/types';

export default class GitSyncPlugin extends Plugin {
  settings: GitSyncSettings;
  private git: GitExecutor;
  private syncManager: SyncManager;
  private statusBar: StatusBar;

  async onload(): Promise<void> {
    console.log('Loading Git Sync plugin');

    // Load settings
    await this.loadSettings();

    // Initialize git executor
    this.git = new GitExecutor(this.settings.gitPath, this.getVaultPath());

    // Initialize status bar
    this.statusBar = new StatusBar(this);
    this.statusBar.initialize();

    // Initialize sync manager
    this.syncManager = new SyncManager(this);
    this.syncManager.setStatusCallback((status, message) => {
      this.statusBar.updateStatus(status, message);
    });

    // Add settings tab
    this.addSettingTab(new GitSyncSettingTab(this.app, this));

    // Register commands
    this.registerCommands();

    // Add ribbon icon
    this.addRibbonIcon('git-branch', 'Git Sync', () => {
      this.sync();
    });

    // Initialize sync manager
    await this.syncManager.initialize();
  }

  onunload(): void {
    console.log('Unloading Git Sync plugin');
    this.syncManager.dispose();
    this.statusBar.destroy();
  }

  /**
   * Get the vault path
   */
  private getVaultPath(): string {
    return (this.app.vault.adapter as any).basePath;
  }

  /**
   * Load plugin settings
   */
  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  /**
   * Save plugin settings
   */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Register plugin commands
   */
  private registerCommands(): void {
    // Sync command
    this.addCommand({
      id: 'git-sync',
      name: 'Sync with remote',
      callback: () => this.sync()
    });

    // Pull command
    this.addCommand({
      id: 'git-pull',
      name: 'Pull from remote',
      callback: () => this.pull()
    });

    // Push command
    this.addCommand({
      id: 'git-push',
      name: 'Commit and push',
      callback: () => this.commitAndPush()
    });

    // Status command
    this.addCommand({
      id: 'git-status',
      name: 'Show Git status',
      callback: () => this.showStatus()
    });

    // Init command
    this.addCommand({
      id: 'git-init',
      name: 'Initialize Git repository',
      callback: () => this.initRepo()
    });
  }

  /**
   * Perform full sync
   */
  async sync(): Promise<void> {
    if (this.syncManager.isSyncing()) {
      this.showNotice('Sync already in progress');
      return;
    }

    this.showNotice('Starting sync...');
    const result = await this.syncManager.sync();

    if (result.success) {
      this.showNotice(result.message);
    } else {
      this.showNotice(`Sync failed: ${result.message}`, true);
    }
  }

  /**
   * Pull from remote
   */
  async pull(): Promise<void> {
    if (this.syncManager.isSyncing()) {
      this.showNotice('Sync already in progress');
      return;
    }

    const result = await this.syncManager.pullOnly();

    if (result.success) {
      this.showNotice(result.message);
    } else {
      this.showNotice(`Pull failed: ${result.message}`, true);
    }
  }

  /**
   * Commit and push
   */
  async commitAndPush(): Promise<void> {
    if (this.syncManager.isSyncing()) {
      this.showNotice('Sync already in progress');
      return;
    }

    const result = await this.syncManager.commitAndPush();

    if (result.success) {
      this.showNotice(result.message);
    } else {
      this.showNotice(`Push failed: ${result.message}`, true);
    }
  }

  /**
   * Show git status
   */
  async showStatus(): Promise<void> {
    const { available, isRepo, error } = await this.checkGitStatus();

    if (!available) {
      this.showNotice(`Git not available: ${error}`, true);
      return;
    }

    if (!isRepo) {
      this.showNotice('Not a git repository. Use "Initialize Git repository" command to create one.', true);
      return;
    }

    const status = await this.getGitStatus();
    const lines: string[] = [];

    lines.push(`Branch: ${status.branch}`);

    if (status.clean) {
      lines.push('Status: Clean');
    } else {
      if (status.staged.length > 0) {
        lines.push(`Staged: ${status.staged.length} files`);
      }
      if (status.modified.length > 0) {
        lines.push(`Modified: ${status.modified.length} files`);
      }
      if (status.untracked.length > 0) {
        lines.push(`Untracked: ${status.untracked.length} files`);
      }
      if (status.conflicts.length > 0) {
        lines.push(`Conflicts: ${status.conflicts.length} files`);
      }
    }

    if (status.ahead > 0) {
      lines.push(`Ahead: ${status.ahead} commits`);
    }
    if (status.behind > 0) {
      lines.push(`Behind: ${status.behind} commits`);
    }

    this.showNotice(lines.join('\n'));
  }

  /**
   * Initialize repository
   */
  async initRepo(): Promise<void> {
    const { isRepo } = await this.checkGitStatus();

    if (isRepo) {
      this.showNotice('Already a git repository');
      return;
    }

    try {
      await this.git.init();
      this.showNotice('Git repository initialized');
    } catch (error: any) {
      this.showNotice(`Failed to initialize repository: ${error.message}`, true);
    }
  }

  /**
   * Check git status
   */
  async checkGitStatus(): Promise<{ available: boolean; isRepo: boolean; error?: string }> {
    const available = await this.git.isGitAvailable();
    if (!available) {
      return { available: false, isRepo: false, error: 'Git is not installed or not found in PATH' };
    }

    const isRepo = await this.git.isRepo();
    return { available: true, isRepo };
  }

  /**
   * Check if git is available
   */
  async isGitAvailable(): Promise<boolean> {
    return await this.git.isGitAvailable();
  }

  /**
   * Check if current directory is a git repository
   */
  async isRepo(): Promise<boolean> {
    return await this.git.isRepo();
  }

  /**
   * Get git status
   */
  async getGitStatus(): Promise<GitStatus> {
    return await this.git.status();
  }

  /**
   * Restart auto sync
   */
  restartAutoSync(): void {
    this.syncManager.restartAutoSync();
  }

  /**
   * Update status bar visibility
   */
  updateStatusBarVisibility(): void {
    if (this.settings.showStatusBar) {
      this.statusBar.show();
    } else {
      this.statusBar.hide();
    }
  }

  /**
   * Show notice (notification)
   */
  private showNotice(message: string, isError: boolean = false): void {
    if (!this.settings.showNotifications) {
      return;
    }

    if (isError) {
      new Notice(`Git Sync: ${message}`, 5000);
    } else {
      new Notice(`Git Sync: ${message}`);
    }
  }
}