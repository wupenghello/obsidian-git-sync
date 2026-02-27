# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run dev      # Watch mode for development
npm run build    # Production build (outputs main.js)
```

## Architecture

This is an Obsidian plugin for Git-based vault synchronization. Desktop-only (uses child_process for Git commands).

### Core Components

- **main.ts** - Plugin entry point (`GitSyncPlugin` class). Initializes all components, registers commands, handles lifecycle.

- **src/git/executor.ts** - `GitExecutor` class wraps all Git CLI operations via `child_process.exec`. Handles command execution, error parsing, and result processing.

- **src/sync/sync-manager.ts** - `SyncManager` coordinates the sync workflow (pull → commit → push). Implements sync locking to prevent concurrent operations. Manages auto-sync intervals.

- **src/ui/settings-tab.ts** - Settings panel with sync options (interval, commit message template, auto-pull on start).

- **src/ui/status-bar.ts** - Status bar UI showing sync state (idle, syncing, error, conflict).

### Key Patterns

**Vault Path Access:**
```typescript
const vaultPath = (this.app.vault.adapter as any).basePath;
```

**Auto-sync Registration:**
Uses `this.plugin.registerInterval()` to ensure intervals are cleaned up on plugin unload.

**Sync Locking:**
`SyncManager.syncLock` prevents concurrent sync operations. Check `isSyncing()` before initiating sync.

### Settings

Defined in `src/ui/settings-tab.ts` as `GitSyncSettings`. Default values in `DEFAULT_SETTINGS`. Key settings: `autoSync`, `syncInterval` (minutes), `commitMessage` (supports `{{date}}`, `{{time}}` templates).

### Plugin Installation

Built files (`main.js`, `manifest.json`, `styles.css`) go to: `<vault>/.obsidian/plugins/obsidian-git-sync/`