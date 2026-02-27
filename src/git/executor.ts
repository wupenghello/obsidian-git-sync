import { exec } from 'child_process';
import { promisify } from 'util';
import type { GitStatus, GitError, PullResult, PushResult, CommitResult } from './types';

const execAsync = promisify(exec);

/**
 * Git command executor
 * Handles all Git operations for the plugin
 */
export class GitExecutor {
  private gitPath: string;
  private workingDir: string;

  constructor(gitPath: string = 'git', workingDir: string) {
    this.gitPath = gitPath;
    this.workingDir = workingDir;
  }

  /**
   * Execute a git command
   */
  private async run(command: string): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await execAsync(`${this.gitPath} ${command}`, {
        cwd: this.workingDir,
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
        timeout: 120000, // 2 minute timeout
      });
      return result;
    } catch (error: any) {
      const gitError: GitError = new Error(error.message);
      gitError.code = error.code;
      gitError.stderr = error.stderr || '';
      gitError.stdout = error.stdout || '';
      throw gitError;
    }
  }

  /**
   * Check if git is available
   */
  async isGitAvailable(): Promise<boolean> {
    try {
      await execAsync(`${this.gitPath} --version`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if current directory is a git repository
   */
  async isRepo(): Promise<boolean> {
    try {
      await this.run('rev-parse --is-inside-work-tree');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize a new git repository
   */
  async init(): Promise<void> {
    await this.run('init');
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    const result = await this.run('rev-parse --abbrev-ref HEAD');
    return result.stdout.trim();
  }

  /**
   * Get remote name (usually 'origin')
   */
  async getRemoteName(): Promise<string | null> {
    try {
      const result = await this.run('remote');
      const remotes = result.stdout.trim().split('\n').filter(Boolean);
      return remotes.includes('origin') ? 'origin' : remotes[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Get current remote URL
   */
  async getRemoteUrl(): Promise<string | null> {
    try {
      const remote = await this.getRemoteName();
      if (!remote) return null;
      const result = await this.run(`remote get-url ${remote}`);
      return result.stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * Fetch from remote
   */
  async fetch(): Promise<void> {
    const remote = await this.getRemoteName();
    if (remote) {
      await this.run(`fetch ${remote}`);
    }
  }

  /**
   * Get detailed status of repository
   */
  async status(): Promise<GitStatus> {
    const result = await this.run('status --porcelain=v1 --branch');
    const lines = result.stdout.trim().split('\n').filter(Boolean);

    const branchLine = lines[0] || '';
    const statusLines = lines.slice(1);

    // Parse branch info
    const branchMatch = branchLine.match(/^## (?:No branch|\S+)(?:\.\.\.\S+)?(?:\s+\[(?:ahead (\d+))?(?:, )?(?:behind (\d+))?\])?/);
    const branch = branchLine.replace(/^## /, '').split('...')[0].split(' ')[0];
    const ahead = branchMatch?.[1] ? parseInt(branchMatch[1]) : 0;
    const behind = branchMatch?.[2] ? parseInt(branchMatch[2]) : 0;

    // Parse file status
    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];
    const conflicts: string[] = [];

    for (const line of statusLines) {
      const indexStatus = line[0];
      const workTreeStatus = line[1];
      const fileName = line.substring(3);

      // Conflict states
      if (indexStatus === 'U' || workTreeStatus === 'U' ||
          (indexStatus === 'A' && workTreeStatus === 'A') ||
          (indexStatus === 'D' && workTreeStatus === 'D')) {
        conflicts.push(fileName);
        continue;
      }

      // Staged changes
      if (indexStatus !== ' ' && indexStatus !== '?') {
        staged.push(fileName);
      }

      // Modified in working tree
      if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
        modified.push(fileName);
      }

      // Untracked
      if (indexStatus === '?' && workTreeStatus === '?') {
        untracked.push(fileName);
      }
    }

    return {
      isRepo: true,
      branch: branch === 'HEAD' ? '(detached)' : branch,
      ahead,
      behind,
      staged,
      modified,
      untracked,
      conflicts,
      clean: staged.length === 0 && modified.length === 0 && untracked.length === 0 && conflicts.length === 0
    };
  }

  /**
   * Check if there are any conflicts
   */
  async hasConflicts(): Promise<boolean> {
    try {
      const result = await this.run('diff --name-only --diff-filter=U');
      return result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Add all changes to staging
   */
  async addAll(): Promise<void> {
    await this.run('add -A');
  }

  /**
   * Add specific files to staging
   */
  async add(files: string[]): Promise<void> {
    if (files.length === 0) return;
    const escapedFiles = files.map(f => `"${f.replace(/"/g, '\\"')}"`).join(' ');
    await this.run(`add ${escapedFiles}`);
  }

  /**
   * Commit changes
   */
  async commit(message: string): Promise<CommitResult> {
    try {
      await this.run(`commit -m "${message.replace(/"/g, '\\"')}"`);
      return { success: true, message: 'Commit successful', files: 0 };
    } catch (error: any) {
      // Check if there's nothing to commit
      if (error.stdout?.includes('nothing to commit')) {
        return { success: true, message: 'Nothing to commit', files: 0 };
      }
      throw error;
    }
  }

  /**
   * Pull from remote
   */
  async pull(): Promise<PullResult> {
    try {
      const branch = await this.getCurrentBranch();
      const remote = await this.getRemoteName();

      if (!remote) {
        return { success: false, message: 'No remote configured', files: [], conflicts: [] };
      }

      // Fetch first
      await this.fetch();

      // Check for local changes that would be overwritten
      const status = await this.status();
      if (status.modified.length > 0 || status.staged.length > 0) {
        // Stash changes if any
        await this.run('stash push -m "obsidian-git-sync-auto-stash"');
      }

      // Pull with rebase to avoid unnecessary merge commits
      const result = await this.run(`pull ${remote} ${branch} --rebase`);

      // Pop stash if we stashed
      try {
        await this.run('stash pop');
      } catch {
        // Stash pop might fail if there are conflicts
      }

      // Parse changed files from output
      const files = this.parsePullFiles(result.stdout);

      return { success: true, message: 'Pull successful', files, conflicts: [] };
    } catch (error: any) {
      // Check for conflicts
      if (await this.hasConflicts()) {
        const conflictFiles = await this.getConflictFiles();
        return {
          success: false,
          message: 'Merge conflicts detected',
          files: [],
          conflicts: conflictFiles
        };
      }

      throw error;
    }
  }

  /**
   * Push to remote
   */
  async push(): Promise<PushResult> {
    try {
      const branch = await this.getCurrentBranch();
      const remote = await this.getRemoteName();

      if (!remote) {
        return { success: false, message: '未配置远程仓库', pushed: 0 };
      }

      await this.run(`push ${remote} ${branch}`);
      return { success: true, message: '推送成功', pushed: 1 };
    } catch (error: any) {
      return { success: false, message: this.parsePushError(error), pushed: 0 };
    }
  }

  /**
   * Push with --set-upstream flag for new branches
   */
  async pushWithUpstream(): Promise<PushResult> {
    try {
      const branch = await this.getCurrentBranch();
      const remote = await this.getRemoteName();

      if (!remote) {
        return { success: false, message: '未配置远程仓库', pushed: 0 };
      }

      await this.run(`push -u ${remote} ${branch}`);
      return { success: true, message: '推送成功', pushed: 1 };
    } catch (error: any) {
      return { success: false, message: this.parsePushError(error), pushed: 0 };
    }
  }

  /**
   * Get list of conflict files
   */
  private async getConflictFiles(): Promise<string[]> {
    try {
      const result = await this.run('diff --name-only --diff-filter=U');
      return result.stdout.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Parse files changed from pull output
   */
  private parsePullFiles(output: string): string[] {
    const files: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // Match lines like " file.txt | 1 +"
      const match = line.match(/^\s+(.+?)\s*\|/);
      if (match) {
        files.push(match[1].trim());
      }
    }

    return files;
  }

  /**
   * Get log of recent commits
   */
  async log(count: number = 5): Promise<string[]> {
    const result = await this.run(`log --oneline -${count}`);
    return result.stdout.trim().split('\n').filter(Boolean);
  }

  /**
   * Check if there's an upstream branch
   */
  async hasUpstream(): Promise<boolean> {
    try {
      const branch = await this.getCurrentBranch();
      await this.run(`rev-parse --abbrev-ref ${branch}@{upstream}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set upstream branch
   */
  async setUpstream(): Promise<void> {
    const branch = await this.getCurrentBranch();
    const remote = await this.getRemoteName();
    if (remote) {
      await this.run(`branch --set-upstream-to=${remote}/${branch}`);
    }
  }

  /**
   * Abort an ongoing rebase
   */
  async abortRebase(): Promise<void> {
    await this.run('rebase --abort');
  }

  /**
   * Abort an ongoing merge
   */
  async abortMerge(): Promise<void> {
    await this.run('merge --abort');
  }

  /**
   * Configure git user name
   */
  async setUserName(name: string): Promise<void> {
    await this.run(`config user.name "${name}"`);
  }

  /**
   * Configure git user email
   */
  async setUserEmail(email: string): Promise<void> {
    await this.run(`config user.email "${email}"`);
  }

  /**
   * Get git user name
   */
  async getUserName(): Promise<string | null> {
    try {
      const result = await this.run('config user.name');
      return result.stdout.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Get git user email
   */
  async getUserEmail(): Promise<string | null> {
    try {
      const result = await this.run('config user.email');
      return result.stdout.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * 检查远程仓库是否存在
   */
  async hasRemote(name: string = 'origin'): Promise<boolean> {
    try {
      const result = await this.run('remote');
      const remotes = result.stdout.trim().split('\n').filter(Boolean);
      return remotes.includes(name);
    } catch {
      return false;
    }
  }

  /**
   * 添加远程仓库
   */
  async addRemote(name: string, url: string): Promise<void> {
    await this.run(`remote add ${name} "${url}"`);
  }

  /**
   * 设置远程仓库 URL
   */
  async setRemoteUrl(name: string, url: string): Promise<void> {
    await this.run(`remote set-url ${name} "${url}"`);
  }

  /**
   * 获取凭证助手配置
   */
  async getCredentialHelper(): Promise<string | null> {
    try {
      const result = await this.run('config --global credential.helper');
      return result.stdout.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * 解析推送错误信息
   */
  private parsePushError(error: GitError): string {
    const stderr = error.stderr || '';

    // HTTPS 认证错误
    if (stderr.includes('Authentication failed') ||
        stderr.includes('403') ||
        stderr.includes('fatal: unable to access')) {
      return '认证失败：HTTPS 推送需要配置凭证。请在终端运行: git config --global credential.helper store，然后手动执行一次 git push 输入用户名和 Personal Access Token';
    }

    // SSH 认证错误
    if (stderr.includes('Permission denied (publickey)')) {
      return 'SSH 认证失败：请检查 SSH 密钥是否已添加到 GitHub/GitLab';
    }

    // 权限错误
    if (stderr.includes('Permission to') && stderr.includes('denied')) {
      return '无推送权限：请检查是否有仓库写入权限';
    }

    // 网络错误
    if (stderr.includes('Could not resolve host')) {
      return '网络错误：无法解析远程主机';
    }

    // 返回原始错误的关键信息
    if (stderr.includes('fatal:')) {
      const fatalLine = stderr.split('\n').find(line => line.includes('fatal:'));
      if (fatalLine) {
        return fatalLine.replace('fatal: ', '').trim();
      }
    }

    return '推送失败，请检查网络和凭证配置';
  }
}