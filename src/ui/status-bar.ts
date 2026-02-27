import { setIcon } from 'obsidian';
import type { SyncStatus } from '../git/types';
import type GitSyncPlugin from '../../main';

/**
 * Status bar manager for the plugin
 */
export class StatusBar {
  private plugin: GitSyncPlugin;
  private statusBarEl: HTMLElement | null = null;
  private iconEl: HTMLElement | null = null;
  private textEl: HTMLElement | null = null;

  constructor(plugin: GitSyncPlugin) {
    this.plugin = plugin;
  }

  /**
   * Initialize the status bar
   */
  initialize(): void {
    if (!this.plugin.settings.showStatusBar) {
      return;
    }

    this.statusBarEl = this.plugin.addStatusBarItem();
    this.statusBarEl.addClass('git-sync-status-bar');

    this.iconEl = this.statusBarEl.createSpan({ cls: 'git-sync-status-icon' });
    this.textEl = this.statusBarEl.createSpan({ cls: 'git-sync-status-text' });

    // Add click handler
    this.statusBarEl.addEventListener('click', () => {
      this.plugin.sync();
    });

    this.updateStatus('idle', 'Ready');
  }

  /**
   * Update the status bar display
   */
  updateStatus(status: SyncStatus, message: string): void {
    if (!this.statusBarEl || !this.iconEl || !this.textEl) {
      return;
    }

    // Remove all status classes
    this.statusBarEl.removeClass('syncing');
    this.statusBarEl.removeClass('error');
    this.statusBarEl.removeClass('success');
    this.statusBarEl.removeClass('conflict');

    // Set icon and text based on status
    switch (status) {
      case 'idle':
        setIcon(this.iconEl, 'git-branch');
        this.textEl.setText(message || 'Ready');
        break;

      case 'syncing':
        this.statusBarEl.addClass('syncing');
        setIcon(this.iconEl, 'sync');
        this.textEl.setText(message || 'Syncing...');
        break;

      case 'pulling':
        this.statusBarEl.addClass('syncing');
        setIcon(this.iconEl, 'arrow-down');
        this.textEl.setText(message || 'Pulling...');
        break;

      case 'pushing':
        this.statusBarEl.addClass('syncing');
        setIcon(this.iconEl, 'arrow-up');
        this.textEl.setText(message || 'Pushing...');
        break;

      case 'committing':
        this.statusBarEl.addClass('syncing');
        setIcon(this.iconEl, 'check');
        this.textEl.setText(message || 'Committing...');
        break;

      case 'success':
        this.statusBarEl.addClass('success');
        setIcon(this.iconEl, 'check-circle');
        this.textEl.setText(message || 'Sync complete');
        // Reset to idle after 3 seconds
        setTimeout(() => {
          if (this.statusBarEl && this.statusBarEl.hasClass('success')) {
            this.updateStatus('idle', 'Ready');
          }
        }, 3000);
        break;

      case 'error':
        this.statusBarEl.addClass('error');
        setIcon(this.iconEl, 'alert-circle');
        this.textEl.setText(message || 'Error');
        break;

      case 'conflict':
        this.statusBarEl.addClass('conflict');
        setIcon(this.iconEl, 'alert-triangle');
        this.textEl.setText(message || 'Conflicts');
        break;
    }
  }

  /**
   * Show the status bar
   */
  show(): void {
    if (this.statusBarEl) {
      this.statusBarEl.style.display = 'flex';
    }
  }

  /**
   * Hide the status bar
   */
  hide(): void {
    if (this.statusBarEl) {
      this.statusBarEl.style.display = 'none';
    }
  }

  /**
   * Remove the status bar
   */
  destroy(): void {
    if (this.statusBarEl) {
      this.statusBarEl.remove();
      this.statusBarEl = null;
      this.iconEl = null;
      this.textEl = null;
    }
  }
}