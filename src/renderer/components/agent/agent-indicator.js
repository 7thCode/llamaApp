/**
 * Agent Indicator - ツール実行中の視覚的フィードバック
 */

class AgentIndicator {
  constructor() {
    this.container = null;
    this.currentExecution = null;
    this.init();
  }

  /**
   * 初期化
   */
  init() {
    this.container = this._createIndicator();
    document.body.appendChild(this.container);
  }

  /**
   * Indicatorの要素を作成
   */
  _createIndicator() {
    const container = document.createElement('div');
    container.className = 'agent-indicator';
    container.innerHTML = `
      <div class="agent-indicator-content">
        <div class="agent-icon">🤖</div>
        <div class="agent-status">
          <div class="agent-status-text">Working...</div>
          <div class="agent-tool-details"></div>
        </div>
        <div class="agent-progress">
          <div class="agent-progress-bar"></div>
        </div>
      </div>
    `;
    return container;
  }

  /**
   * ツール実行開始を表示
   * @param {string} tool - ツール名
   * @param {Object} args - 引数
   */
  show(tool, args) {
    this.currentExecution = {
      tool,
      args,
      startTime: Date.now()
    };

    const statusText = this.container.querySelector('.agent-status-text');
    const details = this.container.querySelector('.agent-tool-details');

    statusText.textContent = this._getToolDescription(tool);
    details.innerHTML = this._formatArguments(tool, args);

    this.container.classList.add('visible');
  }

  /**
   * 完了を表示
   * @param {string} tool - ツール名
   * @param {Object} result - 結果
   */
  complete(tool, result) {
    const details = this.container.querySelector('.agent-tool-details');
    const duration = Date.now() - (this.currentExecution?.startTime || Date.now());

    details.innerHTML += `
      <div class="tool-result success">
        ✅ Completed in ${(duration / 1000).toFixed(2)}s
      </div>
    `;

    setTimeout(() => this.hide(), 2000);
  }

  /**
   * エラーを表示
   * @param {string} tool - ツール名
   * @param {string} error - エラーメッセージ
   */
  error(tool, error) {
    const details = this.container.querySelector('.agent-tool-details');

    details.innerHTML += `
      <div class="tool-result error">
        ❌ Error: ${error}
      </div>
    `;

    setTimeout(() => this.hide(), 3000);
  }

  /**
   * 非表示
   */
  hide() {
    this.container.classList.remove('visible');
    this.currentExecution = null;
  }

  /**
   * ツール名を説明文に変換
   */
  _getToolDescription(tool) {
    const descriptions = {
      read_file: '📄 Reading file...',
      list_directory: '📁 Listing directory...',
      search_files: '🔍 Searching files...',
      get_file_info: 'ℹ️ Getting file info...',
      analyze_json: '📊 Analyzing JSON...',
      analyze_csv: '📈 Analyzing CSV...',
      analyze_logs: '📋 Analyzing logs...',
      get_disk_usage: '💾 Analyzing disk usage...',
      list_processes: '⚙️ Listing processes...'
    };
    return descriptions[tool] || '🤖 Working...';
  }

  /**
   * 引数をフォーマット
   */
  _formatArguments(tool, args) {
    if (!args) return '';

    // パス系の引数
    if (args.path) {
      const shortPath = args.path.replace(/^\/Users\/[^\/]+/, '~');
      return `<code>${shortPath}</code>`;
    }

    if (args.directory) {
      const shortPath = args.directory.replace(/^\/Users\/[^\/]+/, '~');
      return `<code>${shortPath}</code>`;
    }

    // パターン検索
    if (args.pattern) {
      return `<code>${args.pattern}</code> in <code>${args.directory || '.'}</code>`;
    }

    // その他
    return `<code>${JSON.stringify(args)}</code>`;
  }

  /**
   * プログレスを更新（将来の拡張用）
   */
  updateProgress(percent) {
    const progressBar = this.container.querySelector('.agent-progress-bar');
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }
  }
}

// グローバルインスタンス
window.agentIndicator = new AgentIndicator();
