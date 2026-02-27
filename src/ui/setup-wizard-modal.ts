import { App, Modal, Setting, Notice } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type GitSyncPlugin from '../../main';

/**
 * 配置步骤
 */
type SetupStep = 'checkGit' | 'initRepo' | 'configRemote' | 'configUser' | 'configCredential' | 'done';

/**
 * 配置向导模态框
 * 多步骤引导用户完成 Git 仓库配置
 */
export class SetupWizardModal extends Modal {
  private plugin: GitSyncPlugin;
  private currentStep: SetupStep = 'checkGit';
  private remoteUrl: string = '';
  private userName: string = '';
  private userEmail: string = '';
  private githubUsername: string = '';
  private githubToken: string = '';
  private existingRemoteUrl: string | null = null;
  private existingUserName: string | null = null;
  private existingUserEmail: string | null = null;

  constructor(app: App, plugin: GitSyncPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.renderCurrentStep();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  /**
   * 渲染当前步骤
   */
  private renderCurrentStep(): void {
    const { contentEl } = this;
    contentEl.empty();

    switch (this.currentStep) {
      case 'checkGit':
        this.renderCheckGitStep();
        break;
      case 'initRepo':
        this.renderInitRepoStep();
        break;
      case 'configRemote':
        this.renderConfigRemoteStep();
        break;
      case 'configUser':
        this.renderConfigUserStep();
        break;
      case 'configCredential':
        this.renderConfigCredentialStep();
        break;
      case 'done':
        this.renderDoneStep();
        break;
    }
  }

  /**
   * 步骤 1: 检查 Git
   */
  private async renderCheckGitStep(): Promise<void> {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Git 仓库配置向导' });
    contentEl.createEl('p', { text: '正在检查 Git 环境...' });

    const gitAvailable = await this.plugin.isGitAvailable();

    if (gitAvailable) {
      contentEl.empty();
      contentEl.createEl('h2', { text: 'Git 仓库配置向导' });

      const successDiv = contentEl.createDiv({ cls: 'setup-success' });
      successDiv.createEl('p', { text: '✓ Git 已安装并可用' });

      contentEl.createEl('p', { text: '点击"下一步"继续配置仓库。' });

      new Setting(contentEl)
        .addButton(button => button
          .setButtonText('下一步')
          .setCta()
          .onClick(() => {
            this.currentStep = 'initRepo';
            this.renderCurrentStep();
          }));
    } else {
      contentEl.empty();
      contentEl.createEl('h2', { text: 'Git 仓库配置向导' });

      const errorDiv = contentEl.createDiv({ cls: 'setup-error' });
      errorDiv.createEl('p', { text: '✗ Git 未安装或未找到' });
      errorDiv.createEl('p', { text: '请先安装 Git，然后重新打开此向导。' });

      new Setting(contentEl)
        .addButton(button => button
          .setButtonText('关闭')
          .onClick(() => this.close()));
    }
  }

  /**
   * 步骤 2: 初始化仓库
   */
  private async renderInitRepoStep(): Promise<void> {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Git 仓库配置向导' });
    contentEl.createEl('h3', { text: '步骤 1/4: 初始化仓库' });

    const isRepo = await this.plugin.isRepo();

    if (isRepo) {
      contentEl.createEl('p', { text: '✓ 当前库已经是 Git 仓库' });

      new Setting(contentEl)
        .addButton(button => button
          .setButtonText('上一步')
          .onClick(() => {
            this.currentStep = 'checkGit';
            this.renderCurrentStep();
          }))
        .addButton(button => button
          .setButtonText('下一步')
          .setCta()
          .onClick(() => {
            this.currentStep = 'configRemote';
            this.renderCurrentStep();
          }));
    } else {
      contentEl.createEl('p', { text: '当前库还不是 Git 仓库。点击"初始化"创建新仓库。' });

      new Setting(contentEl)
        .addButton(button => button
          .setButtonText('上一步')
          .onClick(() => {
            this.currentStep = 'checkGit';
            this.renderCurrentStep();
          }))
        .addButton(button => button
          .setButtonText('初始化')
          .setCta()
          .onClick(async () => {
            try {
              await this.plugin.initRepo();
              new Notice('Git 仓库已初始化');
              this.currentStep = 'configRemote';
              this.renderCurrentStep();
            } catch (error: any) {
              new Notice(`初始化失败: ${error.message}`);
            }
          }));
    }
  }

  /**
   * 步骤 3: 配置远程仓库
   */
  private async renderConfigRemoteStep(): Promise<void> {
    const { contentEl } = this;

    // 获取现有远程仓库 URL
    this.existingRemoteUrl = await this.plugin.getRemoteUrl();

    contentEl.createEl('h2', { text: 'Git 仓库配置向导' });
    contentEl.createEl('h3', { text: '步骤 2/4: 配置远程仓库' });

    if (this.existingRemoteUrl) {
      contentEl.createEl('p', { text: `当前远程仓库: ${this.existingRemoteUrl}` });
    }

    contentEl.createEl('p', { text: '输入远程仓库 URL（如 GitHub、GitLab 仓库地址）' });

    new Setting(contentEl)
      .setName('远程仓库 URL')
      .setDesc('例如: https://github.com/username/repo.git 或 git@github.com:username/repo.git')
      .addText(text => text
        .setPlaceholder('https://github.com/username/repo.git')
        .setValue(this.existingRemoteUrl || '')
        .onChange(value => {
          this.remoteUrl = value.trim();
        }));

    new Setting(contentEl)
      .addButton(button => button
        .setButtonText('上一步')
        .onClick(() => {
          this.currentStep = 'initRepo';
          this.renderCurrentStep();
        }))
      .addButton(button => button
        .setButtonText('跳过')
        .onClick(() => {
          this.currentStep = 'configUser';
          this.renderCurrentStep();
        }))
      .addButton(button => button
        .setButtonText('下一步')
        .setCta()
        .onClick(async () => {
          if (this.remoteUrl) {
            try {
              const hasOrigin = await this.plugin.hasRemote('origin');
              if (hasOrigin) {
                await this.plugin.setRemoteUrl('origin', this.remoteUrl);
              } else {
                await this.plugin.addRemote('origin', this.remoteUrl);
              }
              new Notice('远程仓库已配置');
            } catch (error: any) {
              new Notice(`配置远程仓库失败: ${error.message}`);
              return;
            }
          }
          this.currentStep = 'configUser';
          this.renderCurrentStep();
        }));
  }

  /**
   * 步骤 4: 配置用户信息
   */
  private async renderConfigUserStep(): Promise<void> {
    const { contentEl } = this;

    // 获取现有用户信息
    this.existingUserName = await this.plugin.getUserName();
    this.existingUserEmail = await this.plugin.getUserEmail();

    contentEl.createEl('h2', { text: 'Git 仓库配置向导' });
    contentEl.createEl('h3', { text: '步骤 3/4: 配置用户信息' });

    contentEl.createEl('p', { text: '配置 Git 提交者信息（用于标识提交记录）' });

    new Setting(contentEl)
      .setName('用户名')
      .setDesc('提交记录中显示的名称')
      .addText(text => text
        .setPlaceholder('Your Name')
        .setValue(this.existingUserName || '')
        .onChange(value => {
          this.userName = value.trim();
        }));

    new Setting(contentEl)
      .setName('邮箱')
      .setDesc('提交记录中显示的邮箱')
      .addText(text => text
        .setPlaceholder('your.email@example.com')
        .setValue(this.existingUserEmail || '')
        .onChange(value => {
          this.userEmail = value.trim();
        }));

    new Setting(contentEl)
      .addButton(button => button
        .setButtonText('上一步')
        .onClick(() => {
          this.currentStep = 'configRemote';
          this.renderCurrentStep();
        }))
      .addButton(button => button
        .setButtonText('跳过')
        .onClick(() => {
          this.currentStep = 'configCredential';
          this.renderCurrentStep();
        }))
      .addButton(button => button
        .setButtonText('下一步')
        .setCta()
        .onClick(async () => {
          try {
            if (this.userName) {
              await this.plugin.setUserName(this.userName);
            }
            if (this.userEmail) {
              await this.plugin.setUserEmail(this.userEmail);
            }
            if (this.userName || this.userEmail) {
              new Notice('用户信息已配置');
            }
            this.currentStep = 'configCredential';
            this.renderCurrentStep();
          } catch (error: any) {
            new Notice(`配置用户信息失败: ${error.message}`);
          }
        }));
  }

  /**
   * 步骤 5: 配置凭证
   */
  private async renderConfigCredentialStep(): Promise<void> {
    const { contentEl } = this;
    const remoteUrl = await this.plugin.getRemoteUrl();
    const isHttps = remoteUrl?.startsWith('https://') || remoteUrl?.startsWith('http://');

    contentEl.createEl('h2', { text: 'Git 仓库配置向导' });
    contentEl.createEl('h3', { text: '步骤 4/4: 配置凭证' });

    if (!remoteUrl) {
      contentEl.createEl('p', { text: '未配置远程仓库，跳过凭证配置。' });
      new Setting(contentEl)
        .addButton(button => button
          .setButtonText('完成')
          .setCta()
          .onClick(() => {
            this.currentStep = 'done';
            this.renderCurrentStep();
          }));
      return;
    }

    if (!isHttps) {
      contentEl.createEl('p', { text: '检测到 SSH 远程仓库。' });
      contentEl.createEl('p', { text: 'SSH 方式需要配置 SSH 密钥。请确保已将公钥添加到 GitHub/GitLab。' });
      new Setting(contentEl)
        .addButton(button => button
          .setButtonText('上一步')
          .onClick(() => {
            this.currentStep = 'configUser';
            this.renderCurrentStep();
          }))
        .addButton(button => button
          .setButtonText('完成')
          .setCta()
          .onClick(() => {
            this.currentStep = 'done';
            this.renderCurrentStep();
          }));
      return;
    }

    // HTTPS 方式
    contentEl.createEl('p', { text: '检测到 HTTPS 远程仓库，需要配置凭证才能推送。' });

    const helpDiv = contentEl.createDiv();
    helpDiv.innerHTML = `
      <p><strong>如何获取 GitHub Personal Access Token：</strong></p>
      <ol>
        <li>访问 GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)</li>
        <li>点击 "Generate new token (classic)"</li>
        <li>勾选 <code>repo</code> 权限</li>
        <li>生成并复制 Token</li>
      </ol>
    `;

    new Setting(contentEl)
      .setName('GitHub 用户名')
      .setDesc('你的 GitHub 用户名')
      .addText(text => text
        .setPlaceholder('username')
        .onChange(value => {
          this.githubUsername = value.trim();
        }));

    new Setting(contentEl)
      .setName('Personal Access Token')
      .setDesc('GitHub Personal Access Token（不是账户密码）')
      .addText(text => text
        .setPlaceholder('ghp_xxxxxxxxxxxx')
        .onChange(value => {
          this.githubToken = value.trim();
        }));

    new Setting(contentEl)
      .addButton(button => button
        .setButtonText('上一步')
        .onClick(() => {
          this.currentStep = 'configUser';
          this.renderCurrentStep();
        }))
      .addButton(button => button
        .setButtonText('跳过')
        .onClick(() => {
          this.currentStep = 'done';
          this.renderCurrentStep();
        }))
      .addButton(button => button
        .setButtonText('保存凭证')
        .setCta()
        .onClick(async () => {
          if (!this.githubUsername || !this.githubToken) {
            new Notice('请填写用户名和 Token');
            return;
          }
          try {
            await this.saveCredential(this.githubUsername, this.githubToken, remoteUrl);
            new Notice('凭证已保存');
            this.currentStep = 'done';
            this.renderCurrentStep();
          } catch (error: any) {
            new Notice(`保存凭证失败: ${error.message}`);
          }
        }));
  }

  /**
   * 保存凭证到 Git credential store
   */
  private async saveCredential(username: string, token: string, remoteUrl: string): Promise<void> {
    // 确保 credential.helper store 已配置
    const vaultPath = this.plugin.getVaultPath();

    // 使用 git credential approve 来保存凭证
    // 首先解析 URL 获取协议和主机
    const url = new URL(remoteUrl);
    const protocol = url.protocol.replace(':', '');
    const host = url.host;

    // 创建 credential 输入
    const credentialInput = `protocol=${protocol}\nhost=${host}\nusername=${username}\npassword=${token}\n`;

    // 使用 exec 直接执行
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    // 先配置 credential.helper 为 store
    await execAsync('git config --global credential.helper store');

    // 通过 git credential approve 保存凭证
    await new Promise((resolve, reject) => {
      const child = exec('git credential approve', { cwd: vaultPath }, (error: any) => {
        if (error) reject(error);
        else resolve(undefined);
      });
      child.stdin?.write(credentialInput);
      child.stdin?.end();
    });
  }

  /**
   * 步骤 6: 完成
   */
  private async renderDoneStep(): Promise<void> {
    const { contentEl } = this;

    contentEl.createEl('h2', { text: 'Git 仓库配置向导' });
    contentEl.createEl('h3', { text: '配置完成!' });

    // 显示配置摘要
    const summaryDiv = contentEl.createDiv({ cls: 'setup-summary' });

    const isRepo = await this.plugin.isRepo();
    const remoteUrl = await this.plugin.getRemoteUrl();
    const userName = await this.plugin.getUserName();
    const userEmail = await this.plugin.getUserEmail();
    const credentialHelper = await this.plugin.getCredentialHelper();

    const items = [
      { label: 'Git 仓库', value: isRepo ? '已初始化' : '未初始化', success: isRepo },
      { label: '远程仓库', value: remoteUrl || '未配置', success: !!remoteUrl },
      { label: '用户名', value: userName || '未配置', success: !!userName },
      { label: '邮箱', value: userEmail || '未配置', success: !!userEmail },
      { label: '凭证助手', value: credentialHelper || '未配置', success: !!credentialHelper },
    ];

    for (const item of items) {
      const itemEl = summaryDiv.createDiv({ cls: 'summary-item' });
      itemEl.createSpan({ cls: 'summary-label', text: `${item.label}: ` });
      itemEl.createSpan({
        cls: item.success ? 'summary-value-success' : 'summary-value-warning',
        text: item.value
      });
    }

    contentEl.createEl('p', { text: '现在可以使用 Git 同步功能了。' });

    new Setting(contentEl)
      .addButton(button => button
        .setButtonText('关闭')
        .setCta()
        .onClick(() => this.close()));
  }
}