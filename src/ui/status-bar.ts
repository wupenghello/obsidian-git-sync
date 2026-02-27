import { setIcon } from 'obsidian';
import type { SyncStatus } from '../git/types';
import type GitSyncPlugin from '../../main';

/**
 * 状态栏管理器
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
   * 初始化状态栏
   */
  initialize(): void {
    if (!this.plugin.settings.showStatusBar) {
      return;
    }

    this.statusBarEl = this.plugin.addStatusBarItem();
    this.statusBarEl.addClass('git-sync-status-bar');

    this.iconEl = this.statusBarEl.createSpan({ cls: 'git-sync-status-icon' });
    this.textEl = this.statusBarEl.createSpan({ cls: 'git-sync-status-text' });

    // 点击同步
    this.statusBarEl.addEventListener('click', () => {
      this.plugin.sync();
    });

    this.updateStatus('idle', '就绪');
  }

  /**
   * 更新状态栏显示
   */
  updateStatus(status: SyncStatus, message: string): void {
    if (!this.statusBarEl || !this.iconEl || !this.textEl) {
      return;
    }

    // 移除所有状态类
    this.statusBarEl.removeClass('syncing');
    this.statusBarEl.removeClass('error');
    this.statusBarEl.removeClass('success');
    this.statusBarEl.removeClass('conflict');

    // 根据状态设置图标和文本
    switch (status) {
      case 'idle':
        setIcon(this.iconEl, 'git-branch');
        this.textEl.setText(message || '就绪');
        break;

      case 'syncing':
        this.statusBarEl.addClass('syncing');
        setIcon(this.iconEl, 'sync');
        this.textEl.setText(message || '同步中...');
        break;

      case 'pulling':
        this.statusBarEl.addClass('syncing');
        setIcon(this.iconEl, 'arrow-down');
        this.textEl.setText(message || '拉取中...');
        break;

      case 'pushing':
        this.statusBarEl.addClass('syncing');
        setIcon(this.iconEl, 'arrow-up');
        this.textEl.setText(message || '推送中...');
        break;

      case 'committing':
        this.statusBarEl.addClass('syncing');
        setIcon(this.iconEl, 'check');
        this.textEl.setText(message || '提交中...');
        break;

      case 'success':
        this.statusBarEl.addClass('success');
        setIcon(this.iconEl, 'check-circle');
        this.textEl.setText(message || '同步完成');
        // 3秒后重置为就绪
        setTimeout(() => {
          if (this.statusBarEl && this.statusBarEl.hasClass('success')) {
            this.updateStatus('idle', '就绪');
          }
        }, 3000);
        break;

      case 'error':
        this.statusBarEl.addClass('error');
        setIcon(this.iconEl, 'alert-circle');
        this.textEl.setText(message || '错误');
        break;

      case 'conflict':
        this.statusBarEl.addClass('conflict');
        setIcon(this.iconEl, 'alert-triangle');
        this.textEl.setText(message || '有冲突');
        break;
    }
  }

  /**
   * 显示状态栏
   */
  show(): void {
    if (this.statusBarEl) {
      this.statusBarEl.style.display = 'flex';
    }
  }

  /**
   * 隐藏状态栏
   */
  hide(): void {
    if (this.statusBarEl) {
      this.statusBarEl.style.display = 'none';
    }
  }

  /**
   * 销毁状态栏
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