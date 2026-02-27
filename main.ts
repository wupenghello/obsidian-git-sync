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
    console.log('加载 Git 同步插件');

    // 加载设置
    await this.loadSettings();

    // 初始化 Git 执行器
    this.git = new GitExecutor(this.settings.gitPath, this.getVaultPath());

    // 初始化状态栏
    this.statusBar = new StatusBar(this);
    this.statusBar.initialize();

    // 初始化同步管理器
    this.syncManager = new SyncManager(this);
    this.syncManager.setStatusCallback((status, message) => {
      this.statusBar.updateStatus(status, message);
    });

    // 添加设置面板
    this.addSettingTab(new GitSyncSettingTab(this.app, this));

    // 注册命令
    this.registerCommands();

    // 添加功能区图标
    this.addRibbonIcon('git-branch', 'Git 同步', () => {
      this.sync();
    });

    // 初始化同步管理器
    await this.syncManager.initialize();
  }

  onunload(): void {
    console.log('卸载 Git 同步插件');
    this.syncManager.dispose();
    this.statusBar.destroy();
  }

  /**
   * 获取库路径
   */
  private getVaultPath(): string {
    return (this.app.vault.adapter as any).basePath;
  }

  /**
   * 加载设置
   */
  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  /**
   * 保存设置
   */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * 注册命令
   */
  private registerCommands(): void {
    // 同步命令
    this.addCommand({
      id: 'git-sync',
      name: '同步',
      callback: () => this.sync()
    });

    // 拉取命令
    this.addCommand({
      id: 'git-pull',
      name: '拉取更新',
      callback: () => this.pull()
    });

    // 推送命令
    this.addCommand({
      id: 'git-push',
      name: '提交并推送',
      callback: () => this.commitAndPush()
    });

    // 状态命令
    this.addCommand({
      id: 'git-status',
      name: '显示状态',
      callback: () => this.showStatus()
    });

    // 初始化命令
    this.addCommand({
      id: 'git-init',
      name: '初始化仓库',
      callback: () => this.initRepo()
    });
  }

  /**
   * 执行完整同步
   */
  async sync(): Promise<void> {
    if (this.syncManager.isSyncing()) {
      this.showNotice('同步正在进行中');
      return;
    }

    this.showNotice('开始同步...');
    const result = await this.syncManager.sync();

    if (result.success) {
      this.showNotice(result.message);
    } else {
      this.showNotice(`同步失败: ${result.message}`, true);
    }
  }

  /**
   * 拉取更新
   */
  async pull(): Promise<void> {
    if (this.syncManager.isSyncing()) {
      this.showNotice('同步正在进行中');
      return;
    }

    const result = await this.syncManager.pullOnly();

    if (result.success) {
      this.showNotice(result.message);
    } else {
      this.showNotice(`拉取失败: ${result.message}`, true);
    }
  }

  /**
   * 提交并推送
   */
  async commitAndPush(): Promise<void> {
    if (this.syncManager.isSyncing()) {
      this.showNotice('同步正在进行中');
      return;
    }

    const result = await this.syncManager.commitAndPush();

    if (result.success) {
      this.showNotice(result.message);
    } else {
      this.showNotice(`推送失败: ${result.message}`, true);
    }
  }

  /**
   * 显示 Git 状态
   */
  async showStatus(): Promise<void> {
    const { available, isRepo, error } = await this.checkGitStatus();

    if (!available) {
      this.showNotice(`Git 不可用: ${error}`, true);
      return;
    }

    if (!isRepo) {
      this.showNotice('不是 Git 仓库，请使用"初始化仓库"命令创建。', true);
      return;
    }

    const status = await this.getGitStatus();
    const lines: string[] = [];

    lines.push(`分支: ${status.branch}`);

    if (status.clean) {
      lines.push('状态: 干净');
    } else {
      if (status.staged.length > 0) {
        lines.push(`已暂存: ${status.staged.length} 个文件`);
      }
      if (status.modified.length > 0) {
        lines.push(`已修改: ${status.modified.length} 个文件`);
      }
      if (status.untracked.length > 0) {
        lines.push(`未跟踪: ${status.untracked.length} 个文件`);
      }
      if (status.conflicts.length > 0) {
        lines.push(`冲突: ${status.conflicts.length} 个文件`);
      }
    }

    if (status.ahead > 0) {
      lines.push(`领先: ${status.ahead} 个提交`);
    }
    if (status.behind > 0) {
      lines.push(`落后: ${status.behind} 个提交`);
    }

    this.showNotice(lines.join('\n'));
  }

  /**
   * 初始化仓库
   */
  async initRepo(): Promise<void> {
    const { isRepo } = await this.checkGitStatus();

    if (isRepo) {
      this.showNotice('已经是 Git 仓库');
      return;
    }

    try {
      await this.git.init();
      this.showNotice('Git 仓库已初始化');
    } catch (error: any) {
      this.showNotice(`初始化失败: ${error.message}`, true);
    }
  }

  /**
   * 检查 Git 状态
   */
  async checkGitStatus(): Promise<{ available: boolean; isRepo: boolean; error?: string }> {
    const available = await this.git.isGitAvailable();
    if (!available) {
      return { available: false, isRepo: false, error: 'Git 未安装或未找到' };
    }

    const isRepo = await this.git.isRepo();
    return { available: true, isRepo };
  }

  /**
   * 检查 Git 是否可用
   */
  async isGitAvailable(): Promise<boolean> {
    return await this.git.isGitAvailable();
  }

  /**
   * 检查是否为 Git 仓库
   */
  async isRepo(): Promise<boolean> {
    return await this.git.isRepo();
  }

  /**
   * 获取 Git 状态
   */
  async getGitStatus(): Promise<GitStatus> {
    return await this.git.status();
  }

  /**
   * 重启自动同步
   */
  restartAutoSync(): void {
    this.syncManager.restartAutoSync();
  }

  /**
   * 更新状态栏可见性
   */
  updateStatusBarVisibility(): void {
    if (this.settings.showStatusBar) {
      this.statusBar.show();
    } else {
      this.statusBar.hide();
    }
  }

  /**
   * 显示通知
   */
  private showNotice(message: string, isError: boolean = false): void {
    if (!this.settings.showNotifications) {
      return;
    }

    if (isError) {
      new Notice(`Git 同步: ${message}`, 5000);
    } else {
      new Notice(`Git 同步: ${message}`);
    }
  }
}