/**
 * Agent Controller - ツールの実行と管理
 * システム管理・データ処理特化
 */

const { readFile, readdir, stat } = require('fs').promises;
const path = require('path');
const os = require('os');
const { exec} = require('child_process');
const { promisify } = require('util');
const PermissionManager = require('./permission-manager');

const execAsync = promisify(exec);

class AgentController {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.permissionManager = new PermissionManager();
    this.executionHistory = [];
    this.tools = this._initializeTools();
  }

  /**
   * ツール定義を初期化
   */
  _initializeTools() {
    return {
      // === ファイル操作ツール ===
      read_file: {
        description: 'Read the contents of a text file',
        parameters: {
          path: { type: 'string', description: 'File path to read (e.g., ~/Documents/test.txt). Use ~ for home directory.' }
        },
        handler: this._readFile.bind(this)
      },

      list_directory: {
        description: 'List files and directories',
        parameters: {
          path: { type: 'string', description: 'Directory path (e.g., ~/Documents, ~/Desktop, ~/Downloads). Use ~ for home directory.' },
          recursive: { type: 'boolean', optional: true, description: 'Recursive listing' }
        },
        handler: this._listDirectory.bind(this)
      },

      search_files: {
        description: 'Search for files by name pattern (glob)',
        parameters: {
          pattern: { type: 'string', description: 'Search pattern (e.g., *.log, **/*.json)' },
          directory: { type: 'string', description: 'Directory to search in (e.g., ~/Documents, ~/Desktop). Use ~ for home directory.' }
        },
        handler: this._searchFiles.bind(this)
      },

      get_file_info: {
        description: 'Get file metadata (size, dates, permissions)',
        parameters: {
          path: { type: 'string', description: 'File or directory path (e.g., ~/Documents/file.txt). Use ~ for home directory.' }
        },
        handler: this._getFileInfo.bind(this)
      },

      // === システム管理ツール ===
      get_disk_usage: {
        description: 'Get disk usage statistics for a directory (top 20 largest items). Only ~/Documents, ~/Desktop, ~/Downloads are accessible.',
        parameters: {
          path: { type: 'string', description: 'Directory path to analyze (e.g., ~/Documents, ~/Desktop, ~/Downloads). Use ~ for home directory.' }
        },
        handler: this._getDiskUsage.bind(this)
      },

      analyze_logs: {
        description: 'Analyze log files for errors, warnings, and custom patterns',
        parameters: {
          path: { type: 'string', description: 'Log file path (e.g., ~/Documents/app.log). Use ~ for home directory.' },
          pattern: { type: 'string', optional: true, description: 'Custom regex pattern to search' }
        },
        handler: this._analyzeLogs.bind(this)
      },

      list_processes: {
        description: 'List running processes (macOS ps aux, top 50)',
        parameters: {},
        handler: this._listProcesses.bind(this)
      },

      // === データ処理ツール ===
      analyze_json: {
        description: 'Parse and analyze JSON file structure',
        parameters: {
          path: { type: 'string', description: 'JSON file path (e.g., ~/Documents/data.json). Use ~ for home directory.' }
        },
        handler: this._analyzeJson.bind(this)
      },

      analyze_csv: {
        description: 'Parse and analyze CSV file (first 100 rows)',
        parameters: {
          path: { type: 'string', description: 'CSV file path (e.g., ~/Downloads/data.csv). Use ~ for home directory.' }
        },
        handler: this._analyzeCsv.bind(this)
      },
    };
  }

  /**
   * ツール呼び出しを実行
   * @param {Object} toolCall - { tool: string, arguments: Object }
   */
  async executeToolCall(toolCall) {
    const { tool, arguments: args } = toolCall;

    console.log('Executing tool:', { tool, arguments: args });

    // ツールの存在確認
    if (!this.tools[tool]) {
      return {
        success: false,
        error: `Unknown tool: ${tool}`
      };
    }

    // セキュリティチェック
    const securityCheck = await this.permissionManager.validateOperation(tool, args);
    if (!securityCheck.allowed) {
      this._logExecution(tool, args, securityCheck.reason, false);
      return {
        success: false,
        error: `Permission denied: ${securityCheck.reason}`
      };
    }

    console.log('Permission check passed, starting execution');

    try {
      // UIに実行開始を通知
      console.log('Notifying execution start');
      this._notifyExecutionStart(tool, args);
      console.log('Notification sent, getting handler');

      const handler = this.tools[tool].handler;
      console.log('Handler obtained, executing');
      const result = await handler(args);

      console.log(`Tool execution success [${tool}]:`, {
        items: result.items?.length || result.count || 'N/A',
        resultSize: JSON.stringify(result).length
      });

      // 履歴に記録
      this._logExecution(tool, args, result, true);

      // UIに完了を通知
      this._notifyExecutionComplete(tool, result);

      return { success: true, result };
    } catch (error) {
      console.error(`Tool execution error [${tool}]:`, error);
      this._logExecution(tool, args, error.message, false);
      this._notifyExecutionError(tool, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ==================== ファイル操作ツール ====================

  /**
   * ファイル読み取り
   */
  async _readFile(args) {
    const filePath = this._resolvePath(args.path);

    // ファイルサイズチェック
    const sizeCheck = await this.permissionManager.validateFileSize(filePath, 10);
    if (!sizeCheck.allowed) {
      throw new Error(sizeCheck.reason);
    }

    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n');

    return {
      path: filePath,
      content: content.length > 50000 ? content.substring(0, 50000) + '\n... (truncated)' : content,
      size: content.length,
      lines: lines.length,
      truncated: content.length > 50000
    };
  }

  /**
   * ディレクトリ一覧
   */
  async _listDirectory(args) {
    const dirPath = this._resolvePath(args.path);
    const entries = await readdir(dirPath, { withFileTypes: true });

    const result = {
      path: dirPath,
      files: [],
      directories: [],
      total: entries.length
    };

    for (const entry of entries.slice(0, 500)) { // 最大500件
      const fullPath = path.join(dirPath, entry.name);

      try {
        const stats = await stat(fullPath);

        const item = {
          name: entry.name,
          path: fullPath,
          size: stats.size,
          sizeFormatted: this._formatFileSize(stats.size),
          modified: stats.mtime.toISOString(),
        };

        if (entry.isDirectory()) {
          result.directories.push(item);
        } else {
          result.files.push(item);
        }
      } catch (error) {
        // アクセス権限エラー等は無視
        console.warn(`Failed to stat ${fullPath}:`, error.message);
      }
    }

    return result;
  }

  /**
   * ファイル検索
   */
  async _searchFiles(args) {
    const directory = this._resolvePath(args.directory);
    const pattern = args.pattern;

    // macOS find コマンドを使用
    const command = `find "${directory}" -name "${pattern}" -type f 2>/dev/null | head -100`;

    try {
      const { stdout } = await execAsync(command, { maxBuffer: 1024 * 1024 });
      const files = stdout.trim().split('\n').filter(f => f);

      const results = [];
      for (const filePath of files) {
        try {
          const stats = await stat(filePath);
          results.push({
            path: filePath,
            name: path.basename(filePath),
            size: stats.size,
            sizeFormatted: this._formatFileSize(stats.size),
            modified: stats.mtime.toISOString(),
          });
        } catch (error) {
          // スキップ
        }
      }

      return {
        pattern,
        directory,
        count: results.length,
        files: results
      };
    } catch (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * ファイル情報取得
   */
  async _getFileInfo(args) {
    const filePath = this._resolvePath(args.path);
    const stats = await stat(filePath);

    return {
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
      sizeFormatted: this._formatFileSize(stats.size),
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      accessed: stats.atime.toISOString(),
      permissions: stats.mode.toString(8).slice(-3),
    };
  }

  // ==================== システム管理ツール ====================

  /**
   * ディスク使用量分析
   */
  async _getDiskUsage(args) {
    const dirPath = this._resolvePath(args.path);
    console.log('_getDiskUsage called with:', { dirPath });

    // macOS du コマンドを使用
    const command = `du -sh "${dirPath}"/* 2>/dev/null || true`;

    try {
      console.log('Executing du command:', command);
      const { stdout } = await execAsync(command, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30000
      });

      console.log('du command output length:', stdout.length);
      const lines = stdout.trim().split('\n').filter(l => l);
      console.log('Parsed lines:', lines.length);

      const results = lines.map(line => {
        const [size, filePath] = line.split('\t');
        return {
          path: filePath.replace(dirPath + '/', ''),
          fullPath: filePath,
          size,
          sizeBytes: this._parseSizeToBytes(size)
        };
      }).sort((a, b) => b.sizeBytes - a.sizeBytes);

      console.log('Returning results:', { itemCount: results.length });
      return {
        directory: dirPath,
        items: results.slice(0, 20), // Top 20
        totalItems: results.length
      };
    } catch (error) {
      console.error('_getDiskUsage error:', error);
      throw new Error(`Disk usage analysis failed: ${error.message}`);
    }
  }

  /**
   * ログファイル分析
   */
  async _analyzeLogs(args) {
    const logPath = this._resolvePath(args.path);

    // ファイルサイズチェック
    const sizeCheck = await this.permissionManager.validateFileSize(logPath, 50);
    if (!sizeCheck.allowed) {
      throw new Error(sizeCheck.reason);
    }

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
      // エラー検出
      if (/error|fatal|exception|fail/i.test(line)) {
        if (analysis.errors.length < 50) { // 最大50件
          analysis.errors.push({ line: index + 1, content: line.substring(0, 200) });
        }
      }

      // 警告検出
      if (/warn|warning|caution/i.test(line)) {
        if (analysis.warnings.length < 50) {
          analysis.warnings.push({ line: index + 1, content: line.substring(0, 200) });
        }
      }

      // カスタムパターンマッチ
      if (pattern && pattern.test(line)) {
        if (analysis.matches.length < 50) {
          analysis.matches.push({ line: index + 1, content: line.substring(0, 200) });
        }
      }
    });

    return {
      file: logPath,
      analysis,
      summary: `Found ${analysis.errors.length} errors, ${analysis.warnings.length} warnings${pattern ? `, ${analysis.matches.length} pattern matches` : ''}`
    };
  }

  /**
   * プロセス一覧取得
   */
  async _listProcesses(args) {
    try {
      const { stdout } = await execAsync('ps aux', {
        encoding: 'utf8',
        maxBuffer: 5 * 1024 * 1024
      });

      const lines = stdout.split('\n').slice(1); // ヘッダースキップ
      const processes = [];

      for (let i = 0; i < Math.min(lines.length, 50); i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(/\s+/);
        if (parts.length >= 11) {
          processes.push({
            user: parts[0],
            pid: parts[1],
            cpu: parts[2] + '%',
            mem: parts[3] + '%',
            vsz: parts[4],
            rss: parts[5],
            stat: parts[7],
            command: parts.slice(10).join(' ').substring(0, 100)
          });
        }
      }

      // CPU使用率でソート
      processes.sort((a, b) => parseFloat(b.cpu) - parseFloat(a.cpu));

      return {
        processes,
        count: processes.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to list processes: ${error.message}`);
    }
  }

  // ==================== データ処理ツール ====================

  /**
   * JSON解析
   */
  async _analyzeJson(args) {
    const jsonPath = this._resolvePath(args.path);

    // ファイルサイズチェック
    const sizeCheck = await this.permissionManager.validateFileSize(jsonPath, 20);
    if (!sizeCheck.allowed) {
      throw new Error(sizeCheck.reason);
    }

    const content = await readFile(jsonPath, 'utf8');
    const data = JSON.parse(content);

    const analysis = {
      path: jsonPath,
      type: Array.isArray(data) ? 'array' : 'object',
      size: content.length,
      structure: this._analyzeStructure(data, 0, 3)
    };

    if (Array.isArray(data)) {
      analysis.arrayLength = data.length;
      analysis.sampleItem = data[0];
    } else {
      analysis.keys = Object.keys(data);
      analysis.keyCount = Object.keys(data).length;
    }

    return analysis;
  }

  /**
   * CSV解析
   */
  async _analyzeCsv(args) {
    const csvPath = this._resolvePath(args.path);

    // ファイルサイズチェック
    const sizeCheck = await this.permissionManager.validateFileSize(csvPath, 20);
    if (!sizeCheck.allowed) {
      throw new Error(sizeCheck.reason);
    }

    const content = await readFile(csvPath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());

    if (lines.length === 0) {
      throw new Error('CSV file is empty');
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = [];

    for (let i = 1; i < Math.min(lines.length, 101); i++) {
      const values = this._parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index]?.trim() || '';
      });
      rows.push(row);
    }

    return {
      file: csvPath,
      totalRows: lines.length - 1,
      columns: headers,
      columnCount: headers.length,
      sample: rows.slice(0, 5),
      preview: rows
    };
  }

  // ==================== ユーティリティ ====================

  /**
   * パス解決
   */
  _resolvePath(inputPath) {
    // ~ 展開
    if (inputPath.startsWith('~')) {
      return path.join(os.homedir(), inputPath.slice(1));
    }

    // 絶対パスの場合はそのまま
    if (path.isAbsolute(inputPath)) {
      return inputPath;
    }

    // 相対パスの場合はホームディレクトリ基準で解決
    // （ワーキングディレクトリ基準にすると / になる可能性があるため）
    return path.join(os.homedir(), inputPath);
  }

  /**
   * ファイルサイズをフォーマット
   */
  _formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * サイズ文字列をバイトに変換（du出力用）
   */
  _parseSizeToBytes(sizeStr) {
    if (!sizeStr) return 0;

    // スペースと余分な文字を削除
    const cleaned = sizeStr.trim().toUpperCase();

    // 単位マッピング（B, KB, MB, GB, TB）
    const units = {
      B: 1,
      K: 1024,
      KB: 1024,
      M: 1024**2,
      MB: 1024**2,
      G: 1024**3,
      GB: 1024**3,
      T: 1024**4,
      TB: 1024**4
    };

    // "24K", "4.0KB", "1.5G", "0B" などにマッチ
    const match = cleaned.match(/^([\d.]+)\s*([BKMGT]B?)$/);
    if (!match) {
      console.warn('Failed to parse size:', sizeStr);
      return 0;
    }

    const value = parseFloat(match[1]);
    const unit = match[2] || 'B';
    return value * (units[unit] || 1);
  }

  /**
   * JSON構造を再帰的に解析
   */
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

  /**
   * CSVの1行をパース（簡易版）
   */
  _parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  /**
   * 実行履歴に記録
   */
  _logExecution(tool, args, result, success) {
    const entry = {
      tool,
      args,
      result: success ? result : null,
      error: success ? null : result,
      success,
      timestamp: Date.now()
    };

    this.executionHistory.unshift(entry);

    // 最大100件保持
    if (this.executionHistory.length > 100) {
      this.executionHistory = this.executionHistory.slice(0, 100);
    }
  }

  /**
   * UIに実行開始を通知
   */
  _notifyExecutionStart(tool, args) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('agent:tool-start', {
        tool,
        args,
        timestamp: Date.now()
      });
    }
  }

  /**
   * UIに完了を通知
   */
  _notifyExecutionComplete(tool, result) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('agent:tool-complete', {
        tool,
        result,
        timestamp: Date.now()
      });
    }
  }

  /**
   * UIにエラーを通知
   */
  _notifyExecutionError(tool, error) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('agent:tool-error', {
        tool,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * ツール定義を取得（LLMに渡す用）
   */
  getToolDefinitions() {
    return Object.entries(this.tools).map(([name, def]) => ({
      name,
      description: def.description,
      parameters: def.parameters
    }));
  }

  /**
   * 実行履歴を取得
   */
  getExecutionHistory(limit = 50) {
    return this.executionHistory.slice(0, limit);
  }
}

module.exports = AgentController;
