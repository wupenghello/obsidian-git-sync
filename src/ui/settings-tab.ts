import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type GitSyncPlugin from '../../main';

/**
 * Plugin settings interface
 */
export interface GitSyncSettings {
  autoSync: boolean;
  syncInterval: number;
  commitMessage: string;
  autoPullOnStart: boolean;
  showStatusBar: boolean;
  gitPath: string;
  excludePatterns: string[];
  showNotifications: boolean;
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: GitSyncSettings = {
  autoSync: false,
  syncInterval: 10,
  commitMessage: 'vault backup: {{date}}',
  autoPullOnStart: true,
  showStatusBar: true,
  gitPath: 'git',
  excludePatterns: [],
  showNotifications: true,
};

/**
 * Settings tab for the plugin
 */
export class GitSyncSettingTab extends PluginSettingTab {
  private plugin: GitSyncPlugin;

  constructor(app: App, plugin: GitSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('git-sync-settings');

    // Header
    containerEl.createEl('h2', { text: 'Git Sync Settings' });

    // Status section
    this.createStatusSection();

    // Sync settings
    containerEl.createEl('h3', { text: 'Sync Settings' });

    new Setting(containerEl)
      .setName('Automatic sync')
      .setDesc('Enable automatic synchronization at regular intervals')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoSync)
        .onChange(async (value) => {
          this.plugin.settings.autoSync = value;
          await this.plugin.saveSettings();
          this.plugin.restartAutoSync();
        }));

    new Setting(containerEl)
      .setName('Sync interval')
      .setDesc('Time between automatic syncs in minutes (minimum 1)')
      .addText(text => text
        .setValue(String(this.plugin.settings.syncInterval))
        .setPlaceholder('10')
        .onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num) && num >= 1) {
            this.plugin.settings.syncInterval = num;
            await this.plugin.saveSettings();
            this.plugin.restartAutoSync();
          }
        }));

    new Setting(containerEl)
      .setName('Auto pull on start')
      .setDesc('Automatically pull changes when Obsidian starts')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoPullOnStart)
        .onChange(async (value) => {
          this.plugin.settings.autoPullOnStart = value;
          await this.plugin.saveSettings();
        }));

    // Commit settings
    containerEl.createEl('h3', { text: 'Commit Settings' });

    new Setting(containerEl)
      .setName('Commit message')
      .setDesc('Template for commit messages. Supports: {{date}}, {{datetime}}, {{time}}, {{timestamp}}, {{isoDate}}')
      .addText(text => text
        .setValue(this.plugin.settings.commitMessage)
        .setPlaceholder('vault backup: {{date}}')
        .onChange(async (value) => {
          this.plugin.settings.commitMessage = value || DEFAULT_SETTINGS.commitMessage;
          await this.plugin.saveSettings();
        }));

    // Display settings
    containerEl.createEl('h3', { text: 'Display Settings' });

    new Setting(containerEl)
      .setName('Show status bar')
      .setDesc('Display sync status in the status bar')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showStatusBar)
        .onChange(async (value) => {
          this.plugin.settings.showStatusBar = value;
          await this.plugin.saveSettings();
          this.plugin.updateStatusBarVisibility();
        }));

    new Setting(containerEl)
      .setName('Show notifications')
      .setDesc('Show notifications for sync events')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showNotifications)
        .onChange(async (value) => {
          this.plugin.settings.showNotifications = value;
          await this.plugin.saveSettings();
        }));

    // Git settings
    containerEl.createEl('h3', { text: 'Git Settings' });

    new Setting(containerEl)
      .setName('Git path')
      .setDesc('Path to the git executable. Default is "git" which uses system PATH.')
      .addText(text => text
        .setValue(this.plugin.settings.gitPath)
        .setPlaceholder('git')
        .onChange(async (value) => {
          this.plugin.settings.gitPath = value || DEFAULT_SETTINGS.gitPath;
          await this.plugin.saveSettings();
        }));

    // Actions
    containerEl.createEl('h3', { text: 'Actions' });

    new Setting(containerEl)
      .setName('Sync now')
      .setDesc('Perform a full sync (pull, commit, push)')
      .addButton(button => button
        .setButtonText('Sync')
        .setCta()
        .onClick(async () => {
          await this.plugin.sync();
        }));

    new Setting(containerEl)
      .setName('Pull from remote')
      .setDesc('Pull changes from the remote repository')
      .addButton(button => button
        .setButtonText('Pull')
        .onClick(async () => {
          await this.plugin.pull();
        }));

    new Setting(containerEl)
      .setName('Commit and push')
      .setDesc('Commit all changes and push to remote')
      .addButton(button => button
        .setButtonText('Push')
        .onClick(async () => {
          await this.plugin.commitAndPush();
        }));

    // Help section
    containerEl.createEl('h3', { text: 'Help' });

    const helpDiv = containerEl.createDiv();
    helpDiv.innerHTML = `
      <p>This plugin syncs your vault with a Git repository.</p>
      <p><strong>Prerequisites:</strong></p>
      <ul>
        <li>Git must be installed on your system</li>
        <li>Your vault must be a Git repository (git init)</li>
        <li>A remote must be configured (git remote add origin &lt;url&gt;)</li>
        <li>Git credentials must be set up for push/pull operations</li>
      </ul>
      <p><strong>Note:</strong> This plugin only works on desktop (Windows, macOS, Linux).</p>
    `;
  }

  /**
   * Create status section
   */
  private createStatusSection(): void {
    const { containerEl } = this;

    const statusContainer = containerEl.createDiv({ cls: 'status-container' });
    statusContainer.createEl('h4', { text: 'Repository Status' });

    // Check git status asynchronously
    this.checkGitStatus(statusContainer);
  }

  /**
   * Check and display git status
   */
  private async checkGitStatus(container: HTMLElement): Promise<void> {
    const gitAvailable = await this.plugin.isGitAvailable();
    const isRepo = await this.plugin.isRepo();

    const items = [
      { label: 'Git installed', value: gitAvailable ? 'Yes' : 'No', status: gitAvailable ? 'success' : 'error' },
      { label: 'Git repository', value: isRepo ? 'Yes' : 'No', status: isRepo ? 'success' : 'error' },
    ];

    if (isRepo) {
      try {
        const status = await this.plugin.getGitStatus();
        items.push({
          label: 'Current branch',
          value: status.branch,
          status: 'normal'
        });
        items.push({
          label: 'Changes',
          value: status.clean ? 'None' : `${status.staged.length + status.modified.length + status.untracked.length} files`,
          status: status.clean ? 'success' : 'warning'
        });
      } catch (error) {
        items.push({
          label: 'Status',
          value: 'Error reading status',
          status: 'error'
        });
      }
    }

    for (const item of items) {
      const itemEl = container.createDiv({ cls: 'status-item' });
      itemEl.createSpan({ cls: 'status-label', text: item.label });
      itemEl.createSpan({ cls: `status-value ${item.status}`, text: item.value });
    }
  }
}