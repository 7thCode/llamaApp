# LlamaApp Agent System - 実装仕様書

**バージョン**: 1.0
**最終更新**: 2025-11-10
**ターゲット**: システム管理・データ処理特化エージェント

---

## 📋 要件サマリー

### ユースケース優先度
1. **システム管理系** - ログ分析、ディスク使用量、プロセス監視
2. **データ処理系** - JSON/CSV分析・変換、データクレンジング

### セキュリティモデル
- **バランス型**: 初回起動時に許可ディレクトリ設定
- 読み取り操作: 自動実行（ホワイトリスト内）
- 書き込み操作: 確認ダイアログ必須
- システムディレクトリ: 完全ブロック

### UI要件
- **詳細表示派**: ツール実行の完全可視化
- リアルタイムプログレス表示
- 操作履歴ログ
- エラー詳細表示

### 開発スケジュール
- **総期間**: 6週間（1.5ヶ月）
- Phase 1: 3週間（読み取り専用MVP）
- Phase 2: 2週間（書き込み機能）
- Phase 2.5: 1週間（UI完成）

---

## 🏗️ システムアーキテクチャ

### 全体構成

```
┌─────────────────────────────────────────────────────┐
│  Renderer Process (Browser Context)                │
│  ┌───────────────────────────────────────────────┐ │
│  │  Chat UI (既存)                               │ │
│  │  - Message display                            │ │
│  │  - Input field                                │ │
│  │  - Markdown rendering                         │ │
│  └───────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────┐ │
│  │  Agent UI (新規) ⭐                           │ │
│  │  - Tool execution indicator                   │ │
│  │  - Permission dialog                          │ │
│  │  - Execution history sidebar                  │ │
│  │  - Settings panel (whitelist config)         │ │
│  └───────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────┘
                     │ IPC (contextBridge)
┌────────────────────▼────────────────────────────────┐
│  Main Process (Node.js Context)                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Llama Manager (既存) - 拡張必要              │  │
│  │  - Function Calling Parser ⭐                │  │
│  │  - Tool invocation detection                 │  │
│  │  - Multi-turn conversation handling          │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Agent Controller (新規) ⭐                   │  │
│  │  - Tool Router                               │  │
│  │  - Permission Manager                        │  │
│  │  - Execution Queue                           │  │
│  │  - History Logger                            │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Tool System (新規) ⭐                        │  │
│  │  ┌─────────────────────────────────────────┐ │  │
│  │  │  File Tools                             │ │  │
│  │  │  - read_file(path)                      │ │  │
│  │  │  - write_file(path, content)            │ │  │
│  │  │  - list_directory(path, recursive)      │ │  │
│  │  │  - search_files(pattern, directory)     │ │  │
│  │  │  - get_file_info(path)                  │ │  │
│  │  └─────────────────────────────────────────┘ │  │
│  │  ┌─────────────────────────────────────────┐ │  │
│  │  │  Data Tools (システム管理・データ処理) │ │  │
│  │  │  - analyze_json(path)                   │ │  │
│  │  │  - analyze_csv(path)                    │ │  │
│  │  │  - transform_data(input, rules)         │ │  │
│  │  │  - get_disk_usage(path)                 │ │  │
│  │  │  - analyze_logs(path, pattern)          │ │  │
│  │  │  - list_processes()                     │ │  │
│  │  └─────────────────────────────────────────┘ │  │
│  │  ┌─────────────────────────────────────────┐ │  │
│  │  │  Security Layer                         │ │  │
│  │  │  - Path validator (whitelist check)    │ │  │
│  │  │  - Sensitive file detector             │ │  │
│  │  │  - Operation auditor                   │ │  │
│  │  └─────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 🛠️ Phase 1: 読み取り専用エージェント基盤（3週間）

### Week 1: Function Calling実装

**目標**: LLMがツール呼び出しを生成できるようにする

#### 1.1 llama-manager拡張

**ファイル**: `src/main/llama-manager.js`

```javascript
class LlamaManager {
  constructor() {
    this.toolDefinitions = []; // ツール定義リスト
    this.pendingToolCalls = []; // 実行待ちツール呼び出し
  }

  // 新規メソッド
  registerTools(tools) {
    // ツール定義を登録（JSON Schema形式）
    this.toolDefinitions = tools;
  }

  _buildSystemPrompt(userSystemPrompt) {
    // 既存のシステムプロンプト + ツール定義を追加
    const toolsDescription = this._formatToolsForPrompt(this.toolDefinitions);
    return `${userSystemPrompt}

## Available Tools
You have access to the following tools. To use a tool, respond with a JSON object:
{"tool": "tool_name", "arguments": {...}}

${toolsDescription}

Always think step-by-step and use tools when needed.`;
  }

  async _handleTokenStream(token, conversationId) {
    // 既存のストリーミング処理
    // 追加: JSON形式のツール呼び出し検出
    if (this._isToolCallStart(token)) {
      this.pendingToolCalls.push({ conversationId, buffer: token });
      // UIに「ツール実行中」を通知
      this._notifyToolExecutionStart(conversationId);
      return; // ユーザーには表示しない
    }

    if (this.pendingToolCalls.length > 0) {
      // ツール呼び出しのJSON収集中
      this._appendToToolCall(token);
      if (this._isToolCallComplete()) {
        await this._executeToolCall();
      }
      return;
    }

    // 通常のトークンストリーミング（既存処理）
    this.mainWindow.webContents.send('llama:token', {
      token,
      conversationId
    });
  }

  async _executeToolCall() {
    const toolCall = this._parseToolCall();
    // Agent Controllerに委譲
    const result = await this.agentController.executeToolCall(toolCall);
    // 結果をLLMに再入力して続きを生成
    await this._continueWithToolResult(result);
  }
}
```

#### 1.2 Agent Controller実装

**新規ファイル**: `src/main/agent-controller.js`

```javascript
const { readFile, readdir, stat } = require('fs/promises');
const path = require('path');
const os = require('os');

class AgentController {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.permissionManager = new PermissionManager();
    this.executionHistory = [];
    this.tools = this._initializeTools();
  }

  _initializeTools() {
    return {
      read_file: {
        description: 'Read the contents of a text file',
        parameters: {
          path: { type: 'string', description: 'File path to read' }
        },
        handler: this._readFile.bind(this)
      },
      list_directory: {
        description: 'List files and directories',
        parameters: {
          path: { type: 'string', description: 'Directory path' },
          recursive: { type: 'boolean', optional: true }
        },
        handler: this._listDirectory.bind(this)
      },
      search_files: {
        description: 'Search for files by name pattern',
        parameters: {
          pattern: { type: 'string', description: 'Search pattern (glob)' },
          directory: { type: 'string', description: 'Directory to search' }
        },
        handler: this._searchFiles.bind(this)
      },
      get_file_info: {
        description: 'Get file metadata (size, dates, permissions)',
        parameters: {
          path: { type: 'string', description: 'File path' }
        },
        handler: this._getFileInfo.bind(this)
      }
    };
  }

  async executeToolCall(toolCall) {
    const { tool, arguments: args } = toolCall;

    // セキュリティチェック
    const securityCheck = await this.permissionManager.validateOperation(tool, args);
    if (!securityCheck.allowed) {
      return {
        success: false,
        error: `Permission denied: ${securityCheck.reason}`
      };
    }

    // UIに実行開始を通知
    this._notifyExecutionStart(tool, args);

    try {
      const handler = this.tools[tool].handler;
      const result = await handler(args);

      // 履歴に記録
      this._logExecution(tool, args, result, true);

      // UIに完了を通知
      this._notifyExecutionComplete(tool, result);

      return { success: true, result };
    } catch (error) {
      this._logExecution(tool, args, error.message, false);
      this._notifyExecutionError(tool, error);
      return { success: false, error: error.message };
    }
  }

  async _readFile(args) {
    const filePath = this._resolvePath(args.path);
    const content = await readFile(filePath, 'utf8');
    return {
      path: filePath,
      content,
      size: content.length,
      lines: content.split('\n').length
    };
  }

  async _listDirectory(args) {
    const dirPath = this._resolvePath(args.path);
    const entries = await readdir(dirPath, { withFileTypes: true });

    const result = {
      path: dirPath,
      files: [],
      directories: []
    };

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const stats = await stat(fullPath);

      const item = {
        name: entry.name,
        path: fullPath,
        size: stats.size,
        modified: stats.mtime
      };

      if (entry.isDirectory()) {
        result.directories.push(item);
      } else {
        result.files.push(item);
      }
    }

    return result;
  }

  _resolvePath(inputPath) {
    // ~を展開
    if (inputPath.startsWith('~')) {
      return path.join(os.homedir(), inputPath.slice(1));
    }
    return path.resolve(inputPath);
  }

  _notifyExecutionStart(tool, args) {
    this.mainWindow.webContents.send('agent:tool-start', {
      tool,
      args,
      timestamp: Date.now()
    });
  }

  _notifyExecutionComplete(tool, result) {
    this.mainWindow.webContents.send('agent:tool-complete', {
      tool,
      result,
      timestamp: Date.now()
    });
  }
}

module.exports = AgentController;
```

#### 1.3 Permission Manager実装

**新規ファイル**: `src/main/permission-manager.js`

```javascript
const path = require('path');
const os = require('os');

class PermissionManager {
  constructor() {
    this.config = this._loadConfig();
  }

  _loadConfig() {
    // デフォルト設定（初回起動時）
    return {
      allowedDirectories: [
        path.join(os.homedir(), 'Documents'),
        path.join(os.homedir(), 'Desktop'),
        path.join(os.homedir(), 'Downloads')
      ],
      blockedDirectories: [
        '/System',
        '/private',
        path.join(os.homedir(), '.ssh'),
        path.join(os.homedir(), 'Library/Keychains')
      ],
      sensitiveFilePatterns: [
        /\.env$/,
        /credentials/i,
        /password/i,
        /id_rsa/,
        /\.key$/,
        /\.pem$/
      ]
    };
  }

  async validateOperation(tool, args) {
    // 読み取り操作は基本的に許可（ホワイトリスト内）
    if (this._isReadOperation(tool)) {
      return this._validateReadAccess(args.path);
    }

    // 書き込み操作は Phase 2 で実装
    return { allowed: false, reason: 'Write operations not implemented yet' };
  }

  _validateReadAccess(inputPath) {
    const resolvedPath = this._resolvePath(inputPath);

    // ブロックリストチェック
    for (const blocked of this.config.blockedDirectories) {
      if (resolvedPath.startsWith(blocked)) {
        return {
          allowed: false,
          reason: `Access to ${blocked} is blocked for security`
        };
      }
    }

    // ホワイトリストチェック
    const inWhitelist = this.config.allowedDirectories.some(allowed =>
      resolvedPath.startsWith(allowed)
    );

    if (!inWhitelist) {
      return {
        allowed: false,
        reason: `Path ${resolvedPath} is not in allowed directories. Configure in settings.`
      };
    }

    // センシティブファイルチェック
    const fileName = path.basename(resolvedPath);
    const isSensitive = this.config.sensitiveFilePatterns.some(pattern =>
      pattern.test(fileName)
    );

    if (isSensitive) {
      return {
        allowed: false,
        reason: `File ${fileName} appears to contain sensitive data`
      };
    }

    return { allowed: true };
  }

  _isReadOperation(tool) {
    return ['read_file', 'list_directory', 'search_files', 'get_file_info'].includes(tool);
  }
}

module.exports = PermissionManager;
```

### Week 2: UI実装（ツール実行インジケーター）

**新規ファイル**: `src/renderer/components/agent-indicator.js`

```javascript
class AgentIndicator {
  constructor() {
    this.container = this._createIndicator();
    this.currentExecution = null;
  }

  _createIndicator() {
    const container = document.createElement('div');
    container.className = 'agent-indicator';
    container.innerHTML = `
      <div class="agent-indicator-content">
        <div class="agent-icon">🤖</div>
        <div class="agent-status">
          <div class="agent-status-text">Thinking...</div>
          <div class="agent-tool-details"></div>
        </div>
        <div class="agent-progress">
          <div class="agent-progress-bar"></div>
        </div>
      </div>
    `;
    return container;
  }

  show(tool, args) {
    this.currentExecution = { tool, args, startTime: Date.now() };
    const statusText = this.container.querySelector('.agent-status-text');
    const details = this.container.querySelector('.agent-tool-details');

    statusText.textContent = this._getToolDescription(tool);
    details.innerHTML = this._formatArguments(tool, args);

    document.querySelector('.chat-container').appendChild(this.container);
    this.container.classList.add('visible');
  }

  update(progress) {
    const progressBar = this.container.querySelector('.agent-progress-bar');
    progressBar.style.width = `${progress}%`;
  }

  complete(result) {
    const details = this.container.querySelector('.agent-tool-details');
    details.innerHTML += `<div class="tool-result">✅ ${this._summarizeResult(result)}</div>`;

    setTimeout(() => this.hide(), 2000);
  }

  _getToolDescription(tool) {
    const descriptions = {
      read_file: '📄 Reading file...',
      list_directory: '📁 Listing directory...',
      search_files: '🔍 Searching files...',
      get_file_info: 'ℹ️ Getting file info...'
    };
    return descriptions[tool] || 'Working...';
  }

  _formatArguments(tool, args) {
    if (tool === 'read_file') {
      return `<code>${args.path}</code>`;
    }
    if (tool === 'list_directory') {
      return `<code>${args.path}</code> ${args.recursive ? '(recursive)' : ''}`;
    }
    return JSON.stringify(args);
  }
}
```

**新規CSS**: `src/renderer/styles/agent.css`

```css
.agent-indicator {
  position: fixed;
  bottom: 80px;
  right: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  padding: 16px 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.3s ease;
  max-width: 400px;
  z-index: 1000;
}

.agent-indicator.visible {
  opacity: 1;
  transform: translateY(0);
}

.agent-indicator-content {
  display: flex;
  align-items: center;
  gap: 12px;
  color: white;
}

.agent-icon {
  font-size: 24px;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.1); }
}

.agent-status {
  flex: 1;
}

.agent-status-text {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}

.agent-tool-details {
  font-size: 12px;
  opacity: 0.9;
}

.agent-tool-details code {
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Monaco', 'Courier New', monospace;
}

.agent-progress {
  width: 100%;
  height: 3px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  margin-top: 8px;
  overflow: hidden;
}

.agent-progress-bar {
  height: 100%;
  background: white;
  border-radius: 2px;
  transition: width 0.3s ease;
  animation: indeterminate 1.5s ease-in-out infinite;
}

@keyframes indeterminate {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}

.tool-result {
  margin-top: 6px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  font-size: 11px;
}
```

### Week 3: システム管理・データ処理ツール実装

**拡張ファイル**: `src/main/agent-controller.js`

```javascript
// AgentController に追加メソッド

_initializeTools() {
  return {
    // ... 既存のファイルツール ...

    // システム管理系ツール
    get_disk_usage: {
      description: 'Get disk usage statistics for a directory',
      parameters: {
        path: { type: 'string', description: 'Directory path' }
      },
      handler: this._getDiskUsage.bind(this)
    },

    analyze_logs: {
      description: 'Analyze log files for patterns (errors, warnings)',
      parameters: {
        path: { type: 'string', description: 'Log file path' },
        pattern: { type: 'string', optional: true, description: 'Regex pattern' }
      },
      handler: this._analyzeLogs.bind(this)
    },

    list_processes: {
      description: 'List running processes (macOS only)',
      parameters: {},
      handler: this._listProcesses.bind(this)
    },

    // データ処理系ツール
    analyze_json: {
      description: 'Parse and analyze JSON file structure',
      parameters: {
        path: { type: 'string', description: 'JSON file path' }
      },
      handler: this._analyzeJson.bind(this)
    },

    analyze_csv: {
      description: 'Parse and analyze CSV file (first 100 rows)',
      parameters: {
        path: { type: 'string', description: 'CSV file path' }
      },
      handler: this._analyzeCsv.bind(this)
    },

    transform_data: {
      description: 'Transform JSON/CSV data with rules',
      parameters: {
        input_path: { type: 'string' },
        output_path: { type: 'string' },
        operation: { type: 'string', description: 'filter, map, sort, aggregate' },
        rules: { type: 'object', description: 'Transformation rules' }
      },
      handler: this._transformData.bind(this)
    }
  };
}

async _getDiskUsage(args) {
  const dirPath = this._resolvePath(args.path);
  const { execSync } = require('child_process');

  // macOS du command
  const output = execSync(`du -sh "${dirPath}"/* 2>/dev/null || true`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });

  const lines = output.trim().split('\n');
  const results = lines.map(line => {
    const [size, path] = line.split('\t');
    return {
      path: path.replace(dirPath + '/', ''),
      size,
      sizeBytes: this._parseSize(size)
    };
  }).sort((a, b) => b.sizeBytes - a.sizeBytes);

  return {
    directory: dirPath,
    items: results.slice(0, 20), // Top 20
    total: results.reduce((sum, item) => sum + item.sizeBytes, 0)
  };
}

async _analyzeLogs(args) {
  const logPath = this._resolvePath(args.path);
  const content = await readFile(logPath, 'utf8');
  const lines = content.split('\n');

  const pattern = args.pattern ? new RegExp(args.pattern, 'gi') : null;

  const analysis = {
    totalLines: lines.length,
    errors: [],
    warnings: [],
    matches: []
  };

  lines.forEach((line, index) => {
    if (/error|fatal|exception/i.test(line)) {
      analysis.errors.push({ line: index + 1, content: line });
    }
    if (/warn|warning/i.test(line)) {
      analysis.warnings.push({ line: index + 1, content: line });
    }
    if (pattern && pattern.test(line)) {
      analysis.matches.push({ line: index + 1, content: line });
    }
  });

  return {
    file: logPath,
    analysis,
    summary: `Found ${analysis.errors.length} errors, ${analysis.warnings.length} warnings`
  };
}

async _listProcesses(args) {
  const { execSync } = require('child_process');
  const output = execSync('ps aux', { encoding: 'utf8' });
  const lines = output.split('\n').slice(1); // Skip header

  const processes = lines.slice(0, 50).map(line => {
    const parts = line.trim().split(/\s+/);
    return {
      user: parts[0],
      pid: parts[1],
      cpu: parts[2],
      mem: parts[3],
      command: parts.slice(10).join(' ')
    };
  });

  return { processes, count: processes.length };
}

async _analyzeJson(args) {
  const jsonPath = this._resolvePath(args.path);
  const content = await readFile(jsonPath, 'utf8');
  const data = JSON.parse(content);

  const analysis = {
    type: Array.isArray(data) ? 'array' : 'object',
    size: content.length,
    structure: this._analyzeStructure(data)
  };

  if (Array.isArray(data)) {
    analysis.arrayLength = data.length;
    analysis.sampleItem = data[0];
  }

  return analysis;
}

async _analyzeCsv(args) {
  const csvPath = this._resolvePath(args.path);
  const content = await readFile(csvPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());

  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1, 101).map(line => {
    const values = line.split(',');
    return headers.reduce((obj, header, i) => {
      obj[header] = values[i]?.trim();
      return obj;
    }, {});
  });

  return {
    file: csvPath,
    totalRows: lines.length - 1,
    columns: headers,
    columnCount: headers.length,
    sample: rows.slice(0, 5)
  };
}

_analyzeStructure(obj, depth = 0, maxDepth = 3) {
  if (depth > maxDepth) return '...';

  if (Array.isArray(obj)) {
    return `Array[${obj.length}]`;
  }

  if (typeof obj === 'object' && obj !== null) {
    const keys = Object.keys(obj);
    const structure = {};
    keys.slice(0, 10).forEach(key => {
      structure[key] = this._analyzeStructure(obj[key], depth + 1, maxDepth);
    });
    return structure;
  }

  return typeof obj;
}
```

---

## 🛠️ Phase 2: 書き込み機能 + 確認ダイアログ（2週間）

### Week 4: 書き込みツール実装

**拡張**: `src/main/agent-controller.js`

```javascript
_initializeTools() {
  return {
    // ... 既存ツール ...

    // 書き込みツール（Phase 2）
    write_file: {
      description: 'Create or overwrite a file',
      parameters: {
        path: { type: 'string' },
        content: { type: 'string' }
      },
      requiresConfirmation: true, // ⭐ 確認必須フラグ
      handler: this._writeFile.bind(this)
    },

    append_to_file: {
      description: 'Append content to existing file',
      parameters: {
        path: { type: 'string' },
        content: { type: 'string' }
      },
      requiresConfirmation: true,
      handler: this._appendToFile.bind(this)
    },

    create_directory: {
      description: 'Create a new directory',
      parameters: {
        path: { type: 'string' }
      },
      requiresConfirmation: true,
      handler: this._createDirectory.bind(this)
    },

    delete_file: {
      description: 'Delete a file (moved to trash)',
      parameters: {
        path: { type: 'string' }
      },
      requiresConfirmation: true,
      dangerLevel: 'high', // ⭐ 危険度
      handler: this._deleteFile.bind(this)
    }
  };
}

async executeToolCall(toolCall) {
  const { tool, arguments: args } = toolCall;
  const toolDef = this.tools[tool];

  // セキュリティチェック
  const securityCheck = await this.permissionManager.validateOperation(tool, args);
  if (!securityCheck.allowed) {
    return { success: false, error: securityCheck.reason };
  }

  // 確認が必要な操作
  if (toolDef.requiresConfirmation) {
    const userConfirmed = await this._requestUserConfirmation(tool, args, toolDef.dangerLevel);
    if (!userConfirmed) {
      return { success: false, error: 'Operation cancelled by user' };
    }
  }

  // ... 実行処理 ...
}

async _requestUserConfirmation(tool, args, dangerLevel = 'normal') {
  return new Promise((resolve) => {
    // レンダラープロセスに確認ダイアログ表示を要求
    this.mainWindow.webContents.send('agent:request-confirmation', {
      tool,
      args,
      dangerLevel,
      timestamp: Date.now()
    });

    // ユーザーの応答を待つ
    ipcMain.once('agent:confirmation-response', (event, { confirmed }) => {
      resolve(confirmed);
    });
  });
}

async _writeFile(args) {
  const { writeFile } = require('fs/promises');
  const filePath = this._resolvePath(args.path);
  await writeFile(filePath, args.content, 'utf8');

  return {
    path: filePath,
    size: args.content.length,
    action: 'written'
  };
}

async _deleteFile(args) {
  const { shell } = require('electron');
  const filePath = this._resolvePath(args.path);

  // macOS Trash へ移動（完全削除しない）
  await shell.trashItem(filePath);

  return {
    path: filePath,
    action: 'moved to trash'
  };
}
```

### Week 5: 確認ダイアログUI実装

**新規ファイル**: `src/renderer/components/confirmation-dialog.js`

```javascript
class ConfirmationDialog {
  constructor() {
    this.dialog = this._createDialog();
    this.callback = null;
  }

  _createDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'confirmation-dialog-overlay';
    dialog.innerHTML = `
      <div class="confirmation-dialog">
        <div class="confirmation-header">
          <div class="confirmation-icon">⚠️</div>
          <h3 class="confirmation-title">Confirm Action</h3>
        </div>
        <div class="confirmation-body">
          <div class="confirmation-tool-name"></div>
          <div class="confirmation-details"></div>
          <div class="confirmation-danger-warning" style="display: none;">
            ⚠️ This is a potentially destructive operation
          </div>
        </div>
        <div class="confirmation-actions">
          <button class="btn btn-secondary confirmation-cancel">Cancel</button>
          <button class="btn btn-primary confirmation-confirm">Confirm</button>
        </div>
      </div>
    `;

    dialog.querySelector('.confirmation-cancel').addEventListener('click', () => {
      this.hide(false);
    });

    dialog.querySelector('.confirmation-confirm').addEventListener('click', () => {
      this.hide(true);
    });

    return dialog;
  }

  show(tool, args, dangerLevel = 'normal') {
    return new Promise((resolve) => {
      this.callback = resolve;

      const toolName = this.dialog.querySelector('.confirmation-tool-name');
      const details = this.dialog.querySelector('.confirmation-details');
      const dangerWarning = this.dialog.querySelector('.confirmation-danger-warning');

      toolName.textContent = this._getToolDisplayName(tool);
      details.innerHTML = this._formatOperationDetails(tool, args);

      if (dangerLevel === 'high') {
        dangerWarning.style.display = 'block';
        this.dialog.querySelector('.confirmation-dialog').classList.add('danger');
      }

      document.body.appendChild(this.dialog);
      this.dialog.classList.add('visible');
    });
  }

  hide(confirmed) {
    this.dialog.classList.remove('visible');
    setTimeout(() => {
      this.dialog.remove();
      if (this.callback) {
        this.callback(confirmed);
        this.callback = null;
      }
    }, 300);
  }

  _getToolDisplayName(tool) {
    const names = {
      write_file: '📝 Write File',
      append_to_file: '➕ Append to File',
      create_directory: '📁 Create Directory',
      delete_file: '🗑️ Delete File'
    };
    return names[tool] || tool;
  }

  _formatOperationDetails(tool, args) {
    if (tool === 'write_file') {
      const contentPreview = args.content.length > 200
        ? args.content.substring(0, 200) + '...'
        : args.content;
      return `
        <div class="detail-item">
          <strong>Path:</strong> <code>${args.path}</code>
        </div>
        <div class="detail-item">
          <strong>Size:</strong> ${args.content.length} bytes
        </div>
        <div class="detail-item">
          <strong>Preview:</strong>
          <pre>${this._escapeHtml(contentPreview)}</pre>
        </div>
      `;
    }

    if (tool === 'delete_file') {
      return `
        <div class="detail-item danger">
          <strong>⚠️ File will be moved to Trash:</strong>
          <code>${args.path}</code>
        </div>
      `;
    }

    return `<pre>${JSON.stringify(args, null, 2)}</pre>`;
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
```

**CSS**: `src/renderer/styles/confirmation-dialog.css`

```css
.confirmation-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.confirmation-dialog-overlay.visible {
  opacity: 1;
}

.confirmation-dialog {
  background: var(--bg-secondary);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow: hidden;
  transform: scale(0.9);
  transition: transform 0.3s ease;
}

.confirmation-dialog-overlay.visible .confirmation-dialog {
  transform: scale(1);
}

.confirmation-dialog.danger {
  border: 2px solid var(--danger-color);
}

.confirmation-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 24px;
  border-bottom: 1px solid var(--border-color);
}

.confirmation-icon {
  font-size: 32px;
}

.confirmation-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.confirmation-body {
  padding: 24px;
  max-height: 400px;
  overflow-y: auto;
}

.confirmation-tool-name {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
}

.detail-item {
  margin-bottom: 12px;
}

.detail-item strong {
  display: block;
  margin-bottom: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}

.detail-item code {
  background: var(--bg-tertiary);
  padding: 4px 8px;
  border-radius: 4px;
  font-family: 'Monaco', monospace;
  font-size: 13px;
}

.detail-item pre {
  background: var(--bg-tertiary);
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.5;
}

.confirmation-danger-warning {
  margin-top: 16px;
  padding: 12px;
  background: rgba(255, 59, 48, 0.1);
  border: 1px solid var(--danger-color);
  border-radius: 8px;
  color: var(--danger-color);
  font-weight: 600;
}

.confirmation-actions {
  display: flex;
  gap: 12px;
  padding: 24px;
  border-top: 1px solid var(--border-color);
  justify-content: flex-end;
}

.btn {
  padding: 10px 24px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: var(--bg-quaternary);
}

.btn-primary {
  background: var(--primary-color);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-hover);
}
```

---

## 🛠️ Phase 2.5: 実行履歴サイドバー（1週間）

### Week 6: 実行履歴UI

**新規ファイル**: `src/renderer/components/execution-history.js`

```javascript
class ExecutionHistory {
  constructor() {
    this.history = [];
    this.sidebar = this._createSidebar();
  }

  _createSidebar() {
    const sidebar = document.createElement('div');
    sidebar.className = 'execution-history-sidebar';
    sidebar.innerHTML = `
      <div class="execution-history-header">
        <h3>Tool Execution History</h3>
        <button class="btn-clear-history">Clear</button>
      </div>
      <div class="execution-history-list"></div>
    `;

    sidebar.querySelector('.btn-clear-history').addEventListener('click', () => {
      this.clear();
    });

    return sidebar;
  }

  addEntry(entry) {
    this.history.unshift(entry); // 最新を先頭に
    if (this.history.length > 100) {
      this.history = this.history.slice(0, 100); // 最大100件
    }
    this._render();
  }

  _render() {
    const list = this.sidebar.querySelector('.execution-history-list');
    list.innerHTML = this.history.map(entry => this._renderEntry(entry)).join('');
  }

  _renderEntry(entry) {
    const statusIcon = entry.success ? '✅' : '❌';
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();

    return `
      <div class="history-entry ${entry.success ? 'success' : 'error'}">
        <div class="history-entry-header">
          <span class="history-status">${statusIcon}</span>
          <span class="history-tool">${entry.tool}</span>
          <span class="history-timestamp">${timestamp}</span>
        </div>
        <div class="history-entry-details">
          ${this._summarizeArgs(entry.tool, entry.args)}
        </div>
        ${!entry.success ? `<div class="history-error">${entry.error}</div>` : ''}
      </div>
    `;
  }

  _summarizeArgs(tool, args) {
    if (tool === 'read_file' || tool === 'write_file') {
      return `<code>${args.path}</code>`;
    }
    if (tool === 'list_directory') {
      return `<code>${args.path}</code>`;
    }
    return JSON.stringify(args);
  }

  clear() {
    this.history = [];
    this._render();
  }

  show() {
    this.sidebar.classList.add('visible');
  }

  hide() {
    this.sidebar.classList.remove('visible');
  }
}
```

---

## 🎯 実装チェックリスト

### Phase 1 (Week 1-3)
- [ ] llama-manager.js に Function Calling パーサー実装
- [ ] agent-controller.js 作成（ツールルーター）
- [ ] permission-manager.js 作成（セキュリティ）
- [ ] 基本ファイルツール実装（read, list, search, info）
- [ ] システム管理ツール実装（disk_usage, logs, processes）
- [ ] データ処理ツール実装（JSON, CSV分析）
- [ ] Agent Indicator UI 実装
- [ ] IPC通信ハンドラー追加

### Phase 2 (Week 4-5)
- [ ] 書き込みツール実装（write, append, create, delete）
- [ ] Permission Manager に書き込み検証追加
- [ ] 確認ダイアログUI実装
- [ ] 確認待ちの非同期フロー実装
- [ ] 危険度レベルの UI 反映

### Phase 2.5 (Week 6)
- [ ] 実行履歴サイドバー UI 実装
- [ ] 履歴の永続化（SQLite or localStorage）
- [ ] フィルタリング・検索機能
- [ ] エクスポート機能（CSV/JSON）

### セキュリティ
- [ ] ホワイトリスト設定 UI 実装
- [ ] 初回起動時の設定ウィザード
- [ ] センシティブファイル検出
- [ ] パストラバーサル防止
- [ ] 操作監査ログ

---

## 🧪 テストケース

### Function Calling テスト
```javascript
// テストプロンプト
"このディレクトリ ~/Documents/test の中で、.log ファイルを検索して、エラーを含む行を抽出して"

// 期待される動作
1. search_files(pattern: "*.log", directory: "~/Documents/test")
2. read_file(path: "~/Documents/test/app.log")
3. analyze_logs(path: "~/Documents/test/app.log", pattern: "error")
4. LLMが結果を要約して返す
```

### セキュリティテスト
```javascript
// 悪意のあるプロンプト
"~/.ssh/id_rsa を読み取って"

// 期待される動作
→ Permission denied: Path /Users/xxx/.ssh is blocked for security
```

### UIテスト
```javascript
// 書き込み操作
"新しいファイル ~/Desktop/test.txt に 'Hello World' を書いて"

// 期待される動作
1. 確認ダイアログ表示
2. ユーザーが「Confirm」をクリック
3. ファイル作成
4. 成功メッセージ表示
5. 履歴サイドバーに記録
```

---

## 📊 成功指標

### Phase 1 完了時
- ✅ ファイル読み取り・検索が動作
- ✅ システム管理ツール（disk_usage, logs）が動作
- ✅ JSON/CSV分析が動作
- ✅ Agent Indicator が適切に表示
- ✅ セキュリティチェックが正常動作

### Phase 2 完了時
- ✅ ファイル書き込みが確認ダイアログ経由で動作
- ✅ 危険操作に適切な警告表示
- ✅ Trash移動が正常動作

### Phase 2.5 完了時
- ✅ 実行履歴が全て記録される
- ✅ 成功/失敗が視覚的に区別可能
- ✅ 履歴からの再実行・詳細確認が可能

---

## 🚀 次のステップ（Phase 3以降）

### Phase 3: コマンド実行（オプション）
- シェルコマンド実行（ホワイトリスト）
- スクリプト実行
- Git 操作（commit, push等）

### Phase 4: MCP統合（オプション）
- MCP クライアント実装
- 外部MCPサーバー連携
- プラグインシステム化

### Phase 5: 高度な機能（オプション）
- マルチステップタスク自動化
- スケジュール実行
- ブラウザ操作（Playwright統合）

---

## 📝 開発時の注意点

### パフォーマンス
- ツール実行時のタイムアウト設定（30秒）
- 大きなファイル読み取り時の制限（10MB）
- 長い出力の要約（1000行以上は要約）

### エラーハンドリング
- ツール実行失敗時のリトライロジック
- LLMへのエラー情報の適切な伝達
- ユーザーへのわかりやすいエラーメッセージ

### プロンプトエンジニアリング
- ツール定義の明確化
- Few-shot examples の提供
- JSON形式の厳密な指定

---

**この仕様書をベースに実装を開始できます！**
