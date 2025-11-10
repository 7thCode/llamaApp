/**
 * RAGパネルコンポーネント
 * URL管理とインデックス化
 */

class RagPanel {
  constructor() {
    this.urls = [];
    this.isOpen = false;
    this.init();
  }

  /**
   * 初期化
   */
  init() {
    this.createPanelElement();
    this.attachEventListeners();
    this.loadUrls();
    this.setupIPCListeners();
  }

  /**
   * パネルDOM要素を作成
   */
  createPanelElement() {
    const panelHtml = `
      <div id="rag-panel" class="rag-panel hidden">
        <div class="rag-panel-overlay"></div>
        <div class="rag-panel-content">
          <div class="rag-panel-header">
            <h2>🔍 RAG - Web Knowledge</h2>
            <button id="rag-close-btn" class="close-btn">✕</button>
          </div>

          <div class="rag-panel-body">
            <!-- RAG有効/無効トグル -->
            <div class="rag-toggle-section">
              <label class="rag-toggle">
                <input type="checkbox" id="rag-enabled-toggle">
                <span class="toggle-slider"></span>
                <span class="toggle-label">RAG有効化</span>
              </label>
              <div class="rag-status" id="rag-status">
                インデックス済み: <span id="indexed-count">0</span> ページ
              </div>
            </div>

            <!-- URL追加フォーム -->
            <div class="url-add-section">
              <input
                type="url"
                id="url-input"
                class="url-input"
                placeholder="https://example.com/article"
              >
              <button id="add-url-btn" class="add-url-btn">追加</button>
            </div>

            <!-- ファイル追加フォーム -->
            <div class="file-add-section">
              <input
                type="file"
                id="file-input"
                class="file-input-hidden"
                accept=".txt,.md,.markdown"
                style="display: none;"
              >
              <button id="select-file-btn" class="select-file-btn">📄 ファイルを選択</button>
              <span class="file-format-hint">TXT, MD対応</span>
            </div>

            <!-- URL一覧 -->
            <div class="url-list-section">
              <h3>登録済みURL</h3>
              <div id="url-list" class="url-list">
                <p class="empty-message">URLが登録されていません</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', panelHtml);
  }

  /**
   * イベントリスナーを設定
   */
  attachEventListeners() {
    // パネルを開くボタン（ヘッダーに追加）
    const ragBtn = document.getElementById('rag-btn');
    if (ragBtn) {
      ragBtn.addEventListener('click', () => this.open());
    }

    // 閉じるボタン
    document.getElementById('rag-close-btn').addEventListener('click', () => this.close());
    document.querySelector('.rag-panel-overlay').addEventListener('click', () => this.close());

    // RAG有効/無効トグル
    document.getElementById('rag-enabled-toggle').addEventListener('change', (e) => {
      this.toggleRag(e.target.checked);
    });

    // URL追加
    document.getElementById('add-url-btn').addEventListener('click', () => this.addUrl());
    document.getElementById('url-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addUrl();
      }
    });

    // ファイル追加
    document.getElementById('select-file-btn').addEventListener('click', () => {
      document.getElementById('file-input').click();
    });
    document.getElementById('file-input').addEventListener('change', (e) => {
      this.handleFileSelection(e);
    });
  }

  /**
   * IPC イベントリスナーを設定
   */
  setupIPCListeners() {
    // インデックス進捗
    window.llamaAPI.onIndexProgress((data) => {
      this.updateUrlProgress(data.pageId, data.progress, data.status);
    });

    // インデックス完了
    window.llamaAPI.onIndexComplete((data) => {
      this.onIndexComplete(data.pageId, data.chunkCount, data.title);
    });

    // インデックスエラー
    window.llamaAPI.onIndexError((data) => {
      this.onIndexError(data.pageId, data.error);
    });
  }

  /**
   * パネルを開く
   */
  async open() {
    this.isOpen = true;
    document.getElementById('rag-panel').classList.remove('hidden');
    await this.loadUrls();
    await this.updateStatus();
  }

  /**
   * パネルを閉じる
   */
  close() {
    this.isOpen = false;
    document.getElementById('rag-panel').classList.add('hidden');
  }

  /**
   * URL一覧を読み込み
   */
  async loadUrls() {
    try {
      this.urls = await window.llamaAPI.listUrls();
      this.renderUrlList();
    } catch (error) {
      console.error('Failed to load URLs:', error);
    }
  }

  /**
   * RAG状態を更新
   */
  async updateStatus() {
    try {
      const status = await window.llamaAPI.getRagStatus();
      document.getElementById('rag-enabled-toggle').checked = status.enabled;
      document.getElementById('indexed-count').textContent = status.indexedPages;
    } catch (error) {
      console.error('Failed to update RAG status:', error);
    }
  }

  /**
   * URL一覧を描画
   */
  renderUrlList() {
    const listEl = document.getElementById('url-list');

    if (this.urls.length === 0) {
      listEl.innerHTML = '<p class="empty-message">URLが登録されていません</p>';
      return;
    }

    const html = this.urls.map(url => `
      <div class="url-item" data-id="${url.id}">
        <div class="url-info">
          <div class="url-title">${url.title || 'Untitled'}</div>
          <div class="url-address">${url.url}</div>
          <div class="url-meta">
            <span class="url-status status-${url.status}">${this.getStatusLabel(url.status)}</span>
            <span class="url-chunks">${url.chunkCount} chunks</span>
          </div>
        </div>
        <div class="url-actions">
          ${url.status === 'pending' ? `
            <button class="url-action-btn index-btn" data-id="${url.id}">
              インデックス化
            </button>
          ` : ''}
          <button class="url-action-btn delete-btn" data-id="${url.id}">
            削除
          </button>
        </div>
        <div class="url-progress hidden" data-id="${url.id}">
          <div class="progress-bar">
            <div class="progress-fill" style="width: 0%"></div>
          </div>
          <div class="progress-text">0%</div>
        </div>
      </div>
    `).join('');

    listEl.innerHTML = html;

    // アクションボタンにイベントリスナーを追加
    listEl.querySelectorAll('.index-btn').forEach(btn => {
      btn.addEventListener('click', () => this.indexUrl(btn.dataset.id));
    });

    listEl.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => this.removeUrl(btn.dataset.id));
    });
  }

  /**
   * ステータスラベルを取得
   */
  getStatusLabel(status) {
    const labels = {
      pending: '未処理',
      indexed: '完了',
      error: 'エラー',
    };
    return labels[status] || status;
  }

  /**
   * RAG有効/無効を切り替え
   */
  async toggleRag(enabled) {
    try {
      await window.llamaAPI.toggleRag(enabled);
      console.log(`RAG ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Failed to toggle RAG:', error);
    }
  }

  /**
   * URLを追加
   */
  async addUrl() {
    const input = document.getElementById('url-input');
    const url = input.value.trim();

    if (!url) {
      alert('URLを入力してください');
      return;
    }

    try {
      await window.llamaAPI.addUrl(url);
      input.value = '';
      await this.loadUrls();
    } catch (error) {
      alert(`URLの追加に失敗しました: ${error.message}`);
    }
  }

  /**
   * ファイル選択を処理
   */
  async handleFileSelection(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    // ファイルパスを取得（Electronの場合）
    const filePath = file.path;
    if (!filePath) {
      alert('ファイルパスを取得できませんでした');
      return;
    }

    try {
      // ファイルを追加
      const result = await window.llamaAPI.addFile(filePath);

      // UI更新
      await this.loadUrls();

      // 自動的にインデックス化を開始
      await window.llamaAPI.indexFile(result.id);

      // ファイル入力をリセット
      event.target.value = '';
    } catch (error) {
      alert(`ファイルの追加に失敗しました: ${error.message}`);
      event.target.value = '';
    }
  }

  /**
   * URLを削除
   */
  async removeUrl(id) {
    if (!confirm('このURLを削除しますか？')) {
      return;
    }

    try {
      await window.llamaAPI.removeUrl(id);
      await this.loadUrls();
      await this.updateStatus();
    } catch (error) {
      alert(`URLの削除に失敗しました: ${error.message}`);
    }
  }

  /**
   * URLをインデックス化
   */
  async indexUrl(id) {
    try {
      // プログレスバー表示
      const progressEl = document.querySelector(`.url-progress[data-id="${id}"]`);
      if (progressEl) {
        progressEl.classList.remove('hidden');
      }

      await window.llamaAPI.indexUrl(id);
    } catch (error) {
      alert(`インデックス化に失敗しました: ${error.message}`);
      await this.loadUrls();
    }
  }

  /**
   * URLのプログレスを更新
   */
  updateUrlProgress(pageId, progress, status) {
    const progressEl = document.querySelector(`.url-progress[data-id="${pageId}"]`);
    if (progressEl) {
      const fillEl = progressEl.querySelector('.progress-fill');
      const textEl = progressEl.querySelector('.progress-text');
      fillEl.style.width = `${progress}%`;
      textEl.textContent = `${progress}% - ${status}`;
    }
  }

  /**
   * インデックス完了時の処理
   */
  async onIndexComplete(pageId, chunkCount, title) {
    console.log(`Indexed: ${title} (${chunkCount} chunks)`);
    await this.loadUrls();
    await this.updateStatus();
  }

  /**
   * インデックスエラー時の処理
   */
  async onIndexError(pageId, error) {
    console.error(`Index error for ${pageId}:`, error);
    alert(`インデックス化エラー: ${error}`);
    await this.loadUrls();
  }
}

// パネルを初期化（DOMロード後）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.ragPanel = new RagPanel();
  });
} else {
  window.ragPanel = new RagPanel();
}
