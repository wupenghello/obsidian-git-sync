import { GitExecutor } from '../git/executor';
import type { GitStatus, SyncResult, PullResult, PushResult, SyncStatus } from '../git/types';
import { generateCommitMessage } from '../utils/helpers';
import type GitSyncPlugin from '../../main';

/**
 * 状态变更回调类型
 */
export type StatusChangeCallback = (status: SyncStatus, message: string) => void;

/**
 * 同步管理器
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
   * 获取库路径
   */
  private getVaultPath(): string {
    return (this.plugin.app.vault.adapter as any).basePath;
  }

  /**
   * 设置状态变更回调
   */
  setStatusCallback(callback: StatusChangeCallback): void {
    this.onStatusChange = callback;
  }

  /**
   * 更新状态并通知回调
   */
  private updateStatus(status: SyncStatus, message: string): void {
    if (this.onStatusChange) {
      this.onStatusChange(status, message);
    }
  }

  /**
   * 检查是否正在同步
   */
  isSyncing(): boolean {
    return this.syncLock;
  }

  /**
   * 检查 Git 是否可用且仓库已初始化
   */
  async checkGitStatus(): Promise<{ available: boolean; isRepo: boolean; error?: string }> {
    const gitAvailable = await this.git.isGitAvailable();
    if (!gitAvailable) {
      return { available: false, isRepo: false, error: 'Git 未安装或未找到' };
    }

    const isRepo = await this.git.isRepo();
    return { available: true, isRepo };
  }

  /**
   * 初始化仓库
   */
  async initRepo(): Promise<void> {
    await this.git.init();
  }

  /**
   * 获取 Git 状态
   */
  async getStatus(): Promise<GitStatus> {
    return await this.git.status();
  }

  /**
   * 执行完整同步：拉取 → 提交 → 推送
   */
  async sync(): Promise<SyncResult> {
    if (this.syncLock) {
      return { success: false, message: '同步正在进行中' };
    }

    this.syncLock = true;

    try {
      // 检查 Git 可用性
      const { available, isRepo, error } = await this.checkGitStatus();
      if (!available) {
        this.updateStatus('error', error || 'Git 不可用');
        return { success: false, message: error || 'Git 不可用' };
      }

      if (!isRepo) {
        this.updateStatus('error', '不是 Git 仓库');
        return { success: false, message: '不是 Git 仓库，请先初始化。' };
      }

      // 检查冲突
      if (await this.git.hasConflicts()) {
        this.updateStatus('conflict', '检测到合并冲突');
        return { success: false, message: '检测到合并冲突，请手动解决。', conflicts: [] };
      }

      // 拉取更新
      this.updateStatus('pulling', '正在拉取更新...');
      const pullResult = await this.pullOnly();

      if (!pullResult.success && pullResult.conflicts.length > 0) {
        this.updateStatus('conflict', '检测到合并冲突');
        this.lastSyncResult = { success: false, message: '拉取后存在合并冲突', conflicts: pullResult.conflicts };
        return this.lastSyncResult;
      }

      // 提交并推送
      this.updateStatus('pushing', '正在提交并推送...');
      const pushResult = await this.commitAndPush();

      if (pushResult.success) {
        this.updateStatus('success', '同步完成');
        this.lastSyncTime = new Date();
        this.lastSyncResult = { success: true, message: '同步完成', pulled: pullResult.files.length, pushed: pushResult.pushed };
        return this.lastSyncResult;
      } else {
        this.updateStatus('error', pushResult.message);
        this.lastSyncResult = { success: false, message: pushResult.message };
        return this.lastSyncResult;
      }
    } catch (error: any) {
      const message = error.message || '同步时发生未知错误';
      this.updateStatus('error', message);
      this.lastSyncResult = { success: false, message };
      return this.lastSyncResult;
    } finally {
      this.syncLock = false;
    }
  }

  /**
   * 从远程拉取更新
   */
  async pullOnly(): Promise<PullResult> {
    try {
      // 检查是否有远程仓库
      const remote = await this.git.getRemoteName();
      if (!remote) {
        return { success: true, message: '未配置远程仓库，跳过拉取', files: [], conflicts: [] };
      }

      // 先获取
      await this.git.fetch();

      // 检查是否落后
      const status = await this.git.status();
      if (status.behind === 0) {
        return { success: true, message: '已是最新', files: [], conflicts: [] };
      }

      // 拉取
      this.updateStatus('pulling', '正在拉取更新...');
      const result = await this.git.pull();

      return result;
    } catch (error: any) {
      // 检查冲突
      if (await this.git.hasConflicts()) {
        const conflictFiles = await this.getStatus().then(s => s.conflicts);
        this.updateStatus('conflict', '检测到合并冲突');
        return { success: false, message: '检测到合并冲突', files: [], conflicts: conflictFiles };
      }

      throw error;
    }
  }

  /**
   * 提交所有更改并推送到远程
   */
  async commitAndPush(): Promise<PushResult> {
    try {
      // 获取状态
      const status = await this.git.status();

      if (status.clean) {
        // 无需提交，直接推送
        if (status.ahead > 0) {
          this.updateStatus('pushing', '正在推送...');
          return await this.git.push();
        }
        return { success: true, message: '没有需要提交或推送的内容', pushed: 0 };
      }

      // 添加所有更改
      await this.git.addAll();

      // 提交
      const message = generateCommitMessage(this.plugin.settings.commitMessage);
      await this.git.commit(message);

      // 推送
      const hasUpstream = await this.git.hasUpstream();
      this.updateStatus('pushing', '正在推送...');

      if (hasUpstream) {
        return await this.git.push();
      } else {
        return await this.git.pushWithUpstream();
      }
    } catch (error: any) {
      // 检查是否是"没有内容需要提交"
      if (error.stdout?.includes('nothing to commit')) {
        // 尝试推送
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
   * 获取上次同步结果
   */
  getLastSyncResult(): SyncResult | null {
    return this.lastSyncResult;
  }

  /**
   * 获取上次同步时间
   */
  getLastSyncTime(): Date | null {
    return this.lastSyncTime;
  }

  /**
   * 启动自动同步
   */
  startAutoSync(): void {
    if (this.autoSyncInterval !== null) {
      this.stopAutoSync();
    }

    const intervalMs = this.plugin.settings.syncInterval * 60 * 1000;
    this.autoSyncInterval = window.setInterval(() => {
      this.sync().catch(error => {
        console.error('自动同步错误:', error);
      });
    }, intervalMs);

    // 注册清理
    this.plugin.registerInterval(this.autoSyncInterval);
  }

  /**
   * 停止自动同步
   */
  stopAutoSync(): void {
    if (this.autoSyncInterval !== null) {
      window.clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }

  /**
   * 重启自动同步（设置变更后使用）
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
   * 初始化同步管理器
   */
  async initialize(): Promise<void> {
    const { available, isRepo } = await this.checkGitStatus();

    if (!available) {
      this.updateStatus('error', 'Git 不可用');
      return;
    }

    if (!isRepo) {
      this.updateStatus('error', '不是 Git 仓库');
      return;
    }

    // 启动时自动拉取
    if (this.plugin.settings.autoPullOnStart) {
      try {
        await this.pullOnly();
      } catch (error) {
        console.error('自动拉取错误:', error);
      }
    }

    // 启动自动同步
    if (this.plugin.settings.autoSync) {
      this.startAutoSync();
    }

    this.updateStatus('idle', '就绪');
  }

  /**
   * 销毁同步管理器
   */
  dispose(): void {
    this.stopAutoSync();
  }
}