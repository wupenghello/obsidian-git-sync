# Obsidian Git Sync

一个用于 Obsidian 的 Git 同步插件，支持自动同步和手动同步。

## 功能

- 自动定时同步（可配置间隔）
- 手动同步、拉取、推送
- 状态栏显示同步状态
- 冲突检测提醒

## 安装

1. 下载 `main.js`、`manifest.json`、`styles.css`
2. 复制到 `<你的库>/.obsidian/plugins/obsidian-git-sync/`
3. 在 Obsidian 中启用插件

## 前置条件

- 系统已安装 Git
- 库已初始化为 Git 仓库 (`git init`)
- 已配置远程仓库 (`git remote add origin <url>`)
- 已配置 Git 凭证

## 命令

| 命令 | 功能 |
|------|------|
| 同步 | 拉取 → 提交 → 推送 |
| 拉取 | 仅拉取远程更新 |
| 推送 | 提交并推送 |
| 状态 | 显示仓库状态 |
| 初始化 | 初始化 Git 仓库 |

## 设置

- **自动同步**：启用/禁用定时同步
- **同步间隔**：同步时间间隔（分钟）
- **提交消息**：支持 `{{date}}`、`{{time}}` 模板
- **启动时拉取**：Obsidian 启动时自动拉取

## 开发

```bash
npm install    # 安装依赖
npm run dev    # 开发模式
npm run build  # 构建生产版本
```