import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type GitSyncPlugin from '../../main';

/**
 * 插件设置接口
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
 * 默认设置
 */
export const DEFAULT_SETTINGS: GitSyncSettings = {
  autoSync: false,
  syncInterval: 10,
  commitMessage: '库备份: {{date}}',
  autoPullOnStart: true,
  showStatusBar: true,
  gitPath: 'git',
  excludePatterns: [],
  showNotifications: true,
};

/**
 * 设置面板
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

    // 标题
    containerEl.createEl('h2', { text: 'Git 同步设置' });

    // 仓库状态
    this.createStatusSection();

    // 同步设置
    containerEl.createEl('h3', { text: '同步设置' });

    new Setting(containerEl)
      .setName('自动同步')
      .setDesc('启用定时自动同步')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoSync)
        .onChange(async (value) => {
          this.plugin.settings.autoSync = value;
          await this.plugin.saveSettings();
          this.plugin.restartAutoSync();
        }));

    new Setting(containerEl)
      .setName('同步间隔')
      .setDesc('自动同步的时间间隔（分钟）')
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
      .setName('启动时拉取')
      .setDesc('Obsidian 启动时自动拉取远程更新')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoPullOnStart)
        .onChange(async (value) => {
          this.plugin.settings.autoPullOnStart = value;
          await this.plugin.saveSettings();
        }));

    // 提交设置
    containerEl.createEl('h3', { text: '提交设置' });

    new Setting(containerEl)
      .setName('提交消息')
      .setDesc('提交消息模板，支持: {{date}}, {{time}}, {{datetime}}')
      .addText(text => text
        .setValue(this.plugin.settings.commitMessage)
        .setPlaceholder('库备份: {{date}}')
        .onChange(async (value) => {
          this.plugin.settings.commitMessage = value || DEFAULT_SETTINGS.commitMessage;
          await this.plugin.saveSettings();
        }));

    // 显示设置
    containerEl.createEl('h3', { text: '显示设置' });

    new Setting(containerEl)
      .setName('显示状态栏')
      .setDesc('在状态栏显示同步状态')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showStatusBar)
        .onChange(async (value) => {
          this.plugin.settings.showStatusBar = value;
          await this.plugin.saveSettings();
          this.plugin.updateStatusBarVisibility();
        }));

    new Setting(containerEl)
      .setName('显示通知')
      .setDesc('显示同步事件的通知')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showNotifications)
        .onChange(async (value) => {
          this.plugin.settings.showNotifications = value;
          await this.plugin.saveSettings();
        }));

    // Git设置
    containerEl.createEl('h3', { text: 'Git 设置' });

    new Setting(containerEl)
      .setName('Git 路径')
      .setDesc('Git 可执行文件路径，默认使用系统 PATH 中的 git')
      .addText(text => text
        .setValue(this.plugin.settings.gitPath)
        .setPlaceholder('git')
        .onChange(async (value) => {
          this.plugin.settings.gitPath = value || DEFAULT_SETTINGS.gitPath;
          await this.plugin.saveSettings();
        }));

    // 操作
    containerEl.createEl('h3', { text: '操作' });

    new Setting(containerEl)
      .setName('立即同步')
      .setDesc('执行完整同步（拉取 → 提交 → 推送）')
      .addButton(button => button
        .setButtonText('同步')
        .setCta()
        .onClick(async () => {
          await this.plugin.sync();
        }));

    new Setting(containerEl)
      .setName('拉取更新')
      .setDesc('从远程仓库拉取更新')
      .addButton(button => button
        .setButtonText('拉取')
        .onClick(async () => {
          await this.plugin.pull();
        }));

    new Setting(containerEl)
      .setName('提交并推送')
      .setDesc('提交所有更改并推送到远程')
      .addButton(button => button
        .setButtonText('推送')
        .onClick(async () => {
          await this.plugin.commitAndPush();
        }));

    // 帮助
    containerEl.createEl('h3', { text: '帮助' });

    const helpDiv = containerEl.createDiv({ cls: 'git-sync-help' });
    helpDiv.innerHTML = `
      <p>此插件通过 Git 同步你的库。</p>
      <p><strong>前置条件：</strong></p>
      <ul>
        <li>系统已安装 Git</li>
        <li>库已初始化为 Git 仓库 (git init)</li>
        <li>已配置远程仓库 (git remote add origin &lt;url&gt;)</li>
        <li>已配置 Git 凭证</li>
      </ul>
      <p><strong>HTTPS 凭证配置步骤：</strong></p>
      <ol>
        <li>在 GitHub 创建 Personal Access Token（Settings → Developer settings → Personal access tokens → Tokens (classic)）</li>
        <li>在终端运行: <code>git config --global credential.helper store</code></li>
        <li>手动执行一次 <code>git push</code>，输入用户名和 Token（Token 作为密码）</li>
        <li>之后插件推送将自动使用存储的凭证</li>
      </ol>
      <p><strong>注意：</strong>此插件仅支持桌面端（Windows、macOS、Linux）。</p>
    `;
  }

  /**
   * 创建状态区域
   */
  private createStatusSection(): void {
    const { containerEl } = this;

    const statusContainer = containerEl.createDiv({ cls: 'status-container' });
    statusContainer.createEl('h4', { text: '仓库状态' });

    this.checkGitStatus(statusContainer);
  }

  /**
   * 检查并显示 Git 状态
   */
  private async checkGitStatus(container: HTMLElement): Promise<void> {
    const gitAvailable = await this.plugin.isGitAvailable();
    const isRepo = await this.plugin.isRepo();

    const items = [
      { label: 'Git 已安装', value: gitAvailable ? '是' : '否', status: gitAvailable ? 'success' : 'error' },
      { label: 'Git 仓库', value: isRepo ? '是' : '否', status: isRepo ? 'success' : 'error' },
    ];

    if (isRepo) {
      try {
        const status = await this.plugin.getGitStatus();
        items.push({
          label: '当前分支',
          value: status.branch,
          status: 'normal'
        });
        items.push({
          label: '更改',
          value: status.clean ? '无' : `${status.staged.length + status.modified.length + status.untracked.length} 个文件`,
          status: status.clean ? 'success' : 'warning'
        });

        // 获取远程仓库 URL
        const remoteUrl = await this.plugin.getRemoteUrl();
        items.push({
          label: '远程仓库',
          value: remoteUrl || '未配置',
          status: remoteUrl ? 'success' : 'warning'
        });

        // 获取用户信息
        const userName = await this.plugin.getUserName();
        const userEmail = await this.plugin.getUserEmail();
        items.push({
          label: '用户名',
          value: userName || '未配置',
          status: userName ? 'success' : 'warning'
        });
        items.push({
          label: '邮箱',
          value: userEmail || '未配置',
          status: userEmail ? 'success' : 'warning'
        });

        // 获取凭证助手配置
        const credentialHelper = await this.plugin.getCredentialHelper();
        items.push({
          label: '凭证助手',
          value: credentialHelper || '未配置',
          status: credentialHelper ? 'success' : 'warning'
        });
      } catch (error) {
        items.push({
          label: '状态',
          value: '读取失败',
          status: 'error'
        });
      }
    }

    for (const item of items) {
      const itemEl = container.createDiv({ cls: 'status-item' });
      itemEl.createSpan({ cls: 'status-label', text: item.label });
      itemEl.createSpan({ cls: `status-value ${item.status}`, text: item.value });
    }

    // 添加配置向导按钮
    new Setting(container)
      .setName('配置向导')
      .setDesc('打开 Git 配置向导，引导完成仓库初始化和配置')
      .addButton(button => button
        .setButtonText('打开配置向导')
        .setCta()
        .onClick(() => {
          this.plugin.openSetupWizard();
        }));
  }
}