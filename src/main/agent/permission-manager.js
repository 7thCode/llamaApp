/**
 * Permission Manager - エージェント操作のセキュリティ管理
 * ホワイトリスト・ブロックリスト・センシティブファイル検出
 */

const path = require('path');
const os = require('os');
const fs = require('fs').promises;

class PermissionManager {
  constructor() {
    this.config = this._loadDefaultConfig();
  }

  /**
   * デフォルト設定を読み込み
   */
  _loadDefaultConfig() {
    return {
      // 許可ディレクトリ（ホワイトリスト）
      allowedDirectories: [
        path.join(os.homedir(), 'Documents'),
        path.join(os.homedir(), 'Desktop'),
        path.join(os.homedir(), 'Downloads'),
      ],

      // ブロックディレクトリ（完全禁止）
      blockedDirectories: [
        '/System',
        '/private',
        '/Library',
        '/usr',
        '/bin',
        '/sbin',
        '/var',
        '/etc',
        '/tmp',
        path.join(os.homedir(), '.ssh'),
        path.join(os.homedir(), 'Library', 'Keychains'),
        path.join(os.homedir(), '.aws'),
        path.join(os.homedir(), '.config'),
      ],

      // センシティブファイルパターン
      sensitiveFilePatterns: [
        /\.env$/,
        /\.env\./,
        /credentials/i,
        /password/i,
        /id_rsa/,
        /id_dsa/,
        /\.key$/,
        /\.pem$/,
        /\.p12$/,
        /\.pfx$/,
        /wallet\.dat$/,
        /keystore/i,
      ],

      // ブロックされる拡張子（実行ファイル等）
      blockedExtensions: [
        '.app',
        '.dmg',
        '.pkg',
        '.sh',
        '.command',
      ],
    };
  }

  /**
   * 操作の妥当性を検証
   * @param {string} tool - ツール名
   * @param {Object} args - ツール引数
   * @returns {Object} { allowed: boolean, reason?: string }
   */
  async validateOperation(tool, args) {
    try {
      // 読み取り操作
      if (this._isReadOperation(tool)) {
        return this._validateReadAccess(args.path || args.directory);
      }

      // 書き込み操作（Phase 2で実装）
      if (this._isWriteOperation(tool)) {
        return {
          allowed: false,
          reason: 'Write operations not implemented in Phase 1'
        };
      }

      // システム操作（プロセス一覧等）
      if (this._isSystemOperation(tool)) {
        return { allowed: true }; // 読み取り専用のシステム情報は許可
      }

      // コード実行操作
      if (this._isExecutionOperation(tool)) {
        return this._validateExecutionAccess(args.path || args.workingDir);
      }

      // 不明な操作は拒否
      return {
        allowed: false,
        reason: `Unknown operation: ${tool}`
      };
    } catch (error) {
      console.error('Permission validation error:', error);
      return {
        allowed: false,
        reason: `Validation error: ${error.message}`
      };
    }
  }

  /**
   * 読み取りアクセスの検証
   */
  _validateReadAccess(inputPath) {
    console.log('_validateReadAccess called with:', inputPath);

    if (!inputPath) {
      console.log('Validation failed: No path specified');
      return { allowed: false, reason: 'No path specified' };
    }

    const resolvedPath = this._resolvePath(inputPath);
    console.log('Permission check:', { inputPath, resolvedPath });

    // ブロックリストチェック（優先）
    for (const blocked of this.config.blockedDirectories) {
      if (resolvedPath.startsWith(blocked)) {
        return {
          allowed: false,
          reason: `Access to ${blocked} is blocked for security`,
        };
      }
    }

    // ホワイトリストチェック
    const inWhitelist = this.config.allowedDirectories.some(allowed =>
      resolvedPath.startsWith(allowed)
    );

    if (!inWhitelist) {
      const allowedDirs = this.config.allowedDirectories
        .map(d => d.replace(os.homedir(), '~'))
        .join(', ');
      return {
        allowed: false,
        reason: `Access denied. Only these directories are allowed: ${allowedDirs}`,
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
        reason: `File ${fileName} appears to contain sensitive data`,
      };
    }

    // ブロックされた拡張子チェック
    const ext = path.extname(resolvedPath).toLowerCase();
    if (this.config.blockedExtensions.includes(ext)) {
      return {
        allowed: false,
        reason: `File type ${ext} is not allowed for security`,
      };
    }

    return { allowed: true };
  }

  /**
   * パスを解決（~ 展開、絶対パス化）
   */
  _resolvePath(inputPath) {
    // ~ を展開
    if (inputPath.startsWith('~')) {
      return path.join(os.homedir(), inputPath.slice(1));
    }

    // 絶対パスの場合はそのまま
    if (path.isAbsolute(inputPath)) {
      return inputPath;
    }

    // 相対パスの場合はホームディレクトリ基準で解決
    // （セキュリティ上、ワーキングディレクトリ基準は避ける）
    return path.join(os.homedir(), inputPath);
  }

  /**
   * 読み取り操作かどうか判定
   */
  _isReadOperation(tool) {
    const readOps = [
      'read_file',
      'list_directory',
      'search_files',
      'get_file_info',
      'analyze_json',
      'analyze_csv',
      'analyze_logs',
      'get_disk_usage',
    ];
    return readOps.includes(tool);
  }

  /**
   * 書き込み操作かどうか判定
   */
  _isWriteOperation(tool) {
    const writeOps = [
      'write_file',
      'append_to_file',
      'create_directory',
      'delete_file',
      'rename_file',
      'transform_data', // 出力先がある場合
    ];
    return writeOps.includes(tool);
  }

  /**
   * システム操作かどうか判定
   */
  _isSystemOperation(tool) {
    const systemOps = [
      'list_processes',
      'get_system_info',
    ];
    return systemOps.includes(tool);
  }

  /**
   * コード実行操作かどうか判定
   */
  _isExecutionOperation(tool) {
    const execOps = [
      'execute_code',
    ];
    return execOps.includes(tool);
  }

  /**
   * コード実行アクセスの検証
   */
  _validateExecutionAccess(inputPath) {
    console.log('_validateExecutionAccess called with:', inputPath);

    // パスが指定されていない場合はデフォルト（~/Documents）を許可
    if (!inputPath) {
      return { allowed: true };
    }

    const resolvedPath = this._resolvePath(inputPath);
    console.log('Execution permission check:', { inputPath, resolvedPath });

    // ブロックリストチェック（優先）
    for (const blocked of this.config.blockedDirectories) {
      if (resolvedPath.startsWith(blocked)) {
        return {
          allowed: false,
          reason: `Code execution in ${blocked} is blocked for security`,
        };
      }
    }

    // ホワイトリストチェック
    const inWhitelist = this.config.allowedDirectories.some(allowed =>
      resolvedPath.startsWith(allowed)
    );

    if (!inWhitelist) {
      const allowedDirs = this.config.allowedDirectories
        .map(d => d.replace(os.homedir(), '~'))
        .join(', ');
      return {
        allowed: false,
        reason: `Code execution denied. Only these directories are allowed: ${allowedDirs}`,
      };
    }

    return { allowed: true };
  }

  /**
   * 許可ディレクトリを追加
   * @param {string} directory - 追加するディレクトリパス
   */
  addAllowedDirectory(directory) {
    const resolved = this._resolvePath(directory);
    if (!this.config.allowedDirectories.includes(resolved)) {
      this.config.allowedDirectories.push(resolved);
    }
  }

  /**
   * 許可ディレクトリを削除
   * @param {string} directory - 削除するディレクトリパス
   */
  removeAllowedDirectory(directory) {
    const resolved = this._resolvePath(directory);
    this.config.allowedDirectories = this.config.allowedDirectories.filter(
      d => d !== resolved
    );
  }

  /**
   * 現在の設定を取得
   */
  getConfig() {
    return {
      allowedDirectories: [...this.config.allowedDirectories],
      blockedDirectories: [...this.config.blockedDirectories],
    };
  }

  /**
   * ファイルが実在するかチェック
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * ファイルサイズを取得
   */
  async getFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      throw new Error(`Failed to get file size: ${error.message}`);
    }
  }

  /**
   * ファイルが大きすぎないかチェック（10MB制限）
   */
  async validateFileSize(filePath, maxSizeMB = 10) {
    const size = await this.getFileSize(filePath);
    const maxBytes = maxSizeMB * 1024 * 1024;

    if (size > maxBytes) {
      return {
        allowed: false,
        reason: `File too large (${(size / 1024 / 1024).toFixed(2)}MB). Maximum: ${maxSizeMB}MB`,
      };
    }

    return { allowed: true };
  }
}

module.exports = PermissionManager;
