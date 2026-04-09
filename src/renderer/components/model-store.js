/**
 * モデルストアコンポーネント
 * プリセットモデル表示 + HuggingFace検索によるダウンロード
 */

class ModelStore {
  constructor() {
    this.presetModels = [];
    this.hfModels = [];
    this.localModels = [];
    this.downloads = new Map(); // downloadId -> { modelId, progress, speed, eta }
    this.installedModelIds = new Set();
    this.activeTab = 'preset'; // 'preset' | 'hf'
    this.hfSearchState = {
      loading: false,
      error: null,
      searched: false,
    };
  }

  /**
   * 初期化
   */
  async initialize() {
    // IPCイベントリスナー設定
    window.llamaAPI.onDownloadProgress(this.handleDownloadProgress.bind(this));
    window.llamaAPI.onDownloadComplete(this.handleDownloadComplete.bind(this));
    window.llamaAPI.onDownloadError(this.handleDownloadError.bind(this));

    // プリセットモデルを読み込み
    await this.loadPresetModels();

    // インストール済みモデルを確認
    await this.checkInstalledModels();

    // 現在のモデルディレクトリを取得
    await this.loadModelsDirectory();
  }

  /**
   * 現在のモデルディレクトリを取得
   */
  async loadModelsDirectory() {
    try {
      const result = await window.electronAPI.modelsDir.get();
      this.currentModelsDir = result.path;
    } catch (error) {
      console.error('Failed to get models directory:', error);
    }
  }

  /**
   * プリセットモデルを読み込み
   */
  async loadPresetModels() {
    try {
      this.presetModels = await window.llamaAPI.getPresetModels();
      console.log('Loaded preset models:', this.presetModels.length);
    } catch (error) {
      console.error('Failed to load preset models:', error);
    }
  }

  /**
   * インストール済みモデルをチェック
   */
  async checkInstalledModels() {
    try {
      const { models } = await window.llamaAPI.listModels();
      this.installedModelIds.clear();
      this.localModels = models || [];

      for (const model of models) {
        for (const preset of this.presetModels) {
          if (model.id === `${preset.id}.gguf`) {
            this.installedModelIds.add(preset.id);
          }
        }
        // HFモデルのIDも確認
        for (const hfm of this.hfModels) {
          if (model.id === `${hfm.id}.gguf`) {
            this.installedModelIds.add(hfm.id);
          }
        }
      }
    } catch (error) {
      console.error('Failed to check installed models:', error);
    }
  }

  /**
   * モデルストアUIを表示
   */
  show() {
    const existingModal = document.getElementById('model-store-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const modal = this.createModal();
    document.body.appendChild(modal);

    requestAnimationFrame(() => {
      modal.classList.add('visible');
    });
  }

  /**
   * モデルストアUIを非表示
   */
  hide() {
    const modal = document.getElementById('model-store-modal');
    if (modal) {
      modal.classList.remove('visible');
      setTimeout(() => modal.remove(), 300);
    }
  }

  /**
   * モーダルUIを作成
   */
  createModal() {
    const modal = document.createElement('div');
    modal.id = 'model-store-modal';
    modal.className = 'model-store-modal';

    modal.innerHTML = `
      <div class="model-store-overlay" data-action="close"></div>
      <div class="model-store-container">
        <div class="model-store-header">
          <div class="header-left">
            <h2>🏪 モデルストア</h2>
            <button class="models-dir-btn" data-action="change-dir" title="モデル保存先を変更">
              📁 保存先設定
            </button>
          </div>
          <button class="close-btn" data-action="close">×</button>
        </div>

        <div class="model-store-tabs">
          <button class="tab-btn ${this.activeTab === 'preset' ? 'active' : ''}" data-action="tab" data-tab="preset">
            📦 プリセット
          </button>
          <button class="tab-btn ${this.activeTab === 'hf' ? 'active' : ''}" data-action="tab" data-tab="hf">
            🤗 HuggingFace 検索
          </button>
          <button class="tab-btn ${this.activeTab === 'local' ? 'active' : ''}" data-action="tab" data-tab="local">
            💾 ダウンロード済み
          </button>
        </div>

        <div class="tab-content" id="tab-preset" style="display: ${this.activeTab === 'preset' ? 'flex' : 'none'}; flex-direction: column; height: 100%;">
          <div class="model-store-filters">
            <select id="license-filter" data-action="filter">
              <option value="all">すべてのライセンス</option>
              <option value="commercial">商用利用可</option>
              <option value="non-commercial">非商用のみ</option>
            </select>
            <select id="memory-filter" data-action="filter">
              <option value="all">すべてのサイズ</option>
              <option value="small">小型 (&lt;4GB)</option>
              <option value="medium">中型 (4-8GB)</option>
            </select>
          </div>
          <div class="model-store-list" id="model-store-list">
            ${this.renderModelList()}
          </div>
        </div>

        <div class="tab-content" id="tab-hf" style="display: ${this.activeTab === 'hf' ? 'flex' : 'none'}; flex-direction: column; height: 100%;">
          <div class="hf-search-bar">
            <div class="hf-search-row">
              <input
                type="text"
                id="hf-search-input"
                class="hf-search-input"
                placeholder="キーワード検索 (例: japanese, qwen, llama3)"
              />
              <select id="hf-sort-select" class="hf-select">
                <option value="downloads">ダウンロード数順</option>
                <option value="likes">いいね数順</option>
                <option value="trending">トレンド順</option>
                <option value="lastModified">更新日時順</option>
              </select>
            </div>
            <div class="hf-search-row">
              <input
                type="text"
                id="hf-author-input"
                class="hf-search-input hf-author-input"
                placeholder="作者で絞り込み (例: bartowski, unsloth)"
              />
              <label class="hf-checkbox-label">
                <input type="checkbox" id="hf-commercial-only" />
                商用ライセンスのみ
              </label>
              <select id="hf-limit-select" class="hf-select hf-limit-select">
                <option value="10">10件</option>
                <option value="20" selected>20件</option>
                <option value="50">50件</option>
              </select>
              <button class="btn-hf-search" data-action="hf-search" id="hf-search-btn">
                🔍 検索
              </button>
            </div>
          </div>
          <div class="model-store-list" id="hf-model-list">
            ${this.renderHfModelList()}
          </div>
        </div>

        <div class="tab-content" id="tab-local" style="display: ${this.activeTab === 'local' ? 'flex' : 'none'}; flex-direction: column; height: 100%;">
          <div class="model-store-list" id="local-model-list">
            ${this.renderLocalModelList()}
          </div>
        </div>
      </div>
    `;

    modal.addEventListener('click', (e) => this.handleModalClick(e));
    modal.addEventListener('change', (e) => this.handleModalChange(e));
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.id === 'hf-search-input') {
        this.executeHfSearch();
      }
    });

    return modal;
  }

  /**
   * プリセットモデルリストをレンダリング
   */
  renderModelList(filters = { license: 'all', memory: 'all' }) {
    let filteredModels = this.presetModels;

    if (filters.license === 'commercial') {
      filteredModels = filteredModels.filter(m => m.commercial);
    } else if (filters.license === 'non-commercial') {
      filteredModels = filteredModels.filter(m => !m.commercial);
    }

    if (filters.memory === 'small') {
      filteredModels = filteredModels.filter(m => m.memoryRequired < 4 * 1024 * 1024 * 1024);
    } else if (filters.memory === 'medium') {
      filteredModels = filteredModels.filter(
        m => m.memoryRequired >= 4 * 1024 * 1024 * 1024 && m.memoryRequired <= 8 * 1024 * 1024 * 1024
      );
    }

    if (filteredModels.length === 0) {
      return '<div class="empty-state">条件に一致するモデルがありません</div>';
    }

    return filteredModels.map(model => this.renderModelCard(model, 'preset')).join('');
  }

  /**
   * HFモデルリストをレンダリング
   */
  renderHfModelList() {
    if (this.hfSearchState.loading) {
      return `
        <div class="hf-loading">
          <div class="loading-spinner"></div>
          <p>HuggingFaceを検索中...</p>
        </div>
      `;
    }

    if (this.hfSearchState.error) {
      return `
        <div class="hf-error">
          <p>⚠️ 検索エラー: ${this.hfSearchState.error}</p>
          <button class="btn-hf-search" data-action="hf-search">再試行</button>
        </div>
      `;
    }

    if (!this.hfSearchState.searched) {
      return `
        <div class="hf-empty-state">
          <div class="hf-empty-icon">🤗</div>
          <h3>HuggingFaceからGGUFモデルを検索</h3>
          <p>キーワードや条件を入力して「検索」をクリックしてください</p>
          <div class="hf-hint-list">
            <span class="hint-tag" data-action="hint-search" data-hint="japanese">日本語モデル</span>
            <span class="hint-tag" data-action="hint-search" data-hint="qwen">Qwen系</span>
            <span class="hint-tag" data-action="hint-search" data-hint="llama">Llama系</span>
            <span class="hint-tag" data-action="hint-search" data-hint="mistral">Mistral系</span>
            <span class="hint-tag" data-action="hint-search" data-hint="code">コード生成</span>
          </div>
        </div>
      `;
    }

    if (this.hfModels.length === 0) {
      return '<div class="empty-state">検索結果がありません。条件を変えてお試しください</div>';
    }

    return this.hfModels.map(model => this.renderModelCard(model, 'hf')).join('');
  }

  /**
   * モデルカードをレンダリング (preset / hf 共通)
   */
  renderModelCard(model, source) {
    const isInstalled = this.installedModelIds.has(model.id);
    const isDownloading = Array.from(this.downloads.values()).some(d => d.modelId === model.id);
    const downloadInfo = Array.from(this.downloads.entries()).find(([_, d]) => d.modelId === model.id);

    const commercialBadge = model.commercial
      ? '<span class="badge commercial">✅ 商用可</span>'
      : '<span class="badge non-commercial">⚠️ 非商用</span>';

    // ソース別のスペック表示
    let specsHtml = '';
    if (source === 'preset') {
      const sizeGB = model.size > 0 ? (model.size / (1024 * 1024 * 1024)).toFixed(1) + ' GB' : '—';
      const memoryGB = model.memoryRequired > 0 ? (model.memoryRequired / (1024 * 1024 * 1024)).toFixed(0) + ' GB RAM' : '—';
      specsHtml = `
        <span class="spec">📦 ${sizeGB}</span>
        <span class="spec">💾 ${memoryGB}</span>
        <span class="spec">⚙️ ${model.quantization}</span>
      `;
    } else {
      // HFモデル用: ダウンロード数・likes・量子化
      const dlCount = model.downloads > 0 ? model.downloads.toLocaleString() : '—';
      const likes = model.likes > 0 ? model.likes.toLocaleString() : '—';
      specsHtml = `
        <span class="spec">⬇️ ${dlCount}</span>
        <span class="spec">❤️ ${likes}</span>
        <span class="spec">⚙️ ${model.quantization}</span>
      `;
    }

    // アクションボタン
    let actionButton = '';
    if (isInstalled) {
      actionButton = `
        <div class="installed-actions">
          <button class="btn-installed" disabled>✓ インストール済み</button>
          <button class="btn-delete"
            data-action="${source === 'preset' ? 'delete' : 'delete-hf'}"
            data-model-id="${source === 'preset' ? model.id + '.gguf' : model.id + '.gguf'}"
            data-model-name="${model.name}"
            title="このモデルを削除">🗑️ 削除</button>
        </div>
      `;
    } else if (isDownloading && downloadInfo) {
      const [downloadId, info] = downloadInfo;
      const percentage = info.progress || 0;
      const speed = this.formatSpeed(info.speed || 0);
      const eta = this.formatETA(info.eta || 0);

      actionButton = `
        <div class="download-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${percentage}%"></div>
          </div>
          <div class="progress-info">
            <span>${percentage.toFixed(1)}% | ${speed} | 残り ${eta}</span>
            <button class="btn-cancel" data-action="cancel" data-download-id="${downloadId}">キャンセル</button>
          </div>
        </div>
      `;
    } else {
      if (source === 'preset') {
        actionButton = `<button class="btn-download" data-action="download" data-model-id="${model.id}">⬇️ ダウンロード</button>`;
      } else {
        // HF検索モデル: hfModelオブジェクト全体をdata属性にJSONで埋め込む
        const modelDataEncoded = encodeURIComponent(JSON.stringify(model));
        actionButton = `<button class="btn-download" data-action="hf-download" data-hf-model="${modelDataEncoded}">⬇️ ダウンロード</button>`;
      }
    }

    // HFソースバッジ
    const sourceBadge = source === 'hf'
      ? '<span class="badge hf-source">🤗 HF</span>'
      : '';

    return `
      <div class="model-card" data-model-id="${model.id}">
        <div class="model-info">
          <h3>${model.name} ${sourceBadge}</h3>
          <p class="model-author">by ${model.author}</p>
          <p class="model-description">${model.description}</p>
          <div class="model-specs">
            ${specsHtml}
          </div>
          <div class="model-tags">
            ${(model.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}
          </div>
          <div class="model-license">
            ${commercialBadge}
            ${model.licenseUrl
              ? `<a href="${model.licenseUrl}" target="_blank" class="license-link">${model.license}</a>`
              : `<span class="license-text">${model.license}</span>`
            }
          </div>
        </div>
        <div class="model-actions">
          ${actionButton}
        </div>
      </div>
    `;
  }

  /**
   * HuggingFace検索を実行
   */
  async executeHfSearch() {
    const searchInput = document.getElementById('hf-search-input');
    const sortSelect = document.getElementById('hf-sort-select');
    const authorInput = document.getElementById('hf-author-input');
    const commercialOnly = document.getElementById('hf-commercial-only');
    const limitSelect = document.getElementById('hf-limit-select');
    const searchBtn = document.getElementById('hf-search-btn');

    const options = {
      search: searchInput?.value.trim() || '',
      sort: sortSelect?.value || 'downloads',
      author: authorInput?.value.trim() || '',
      commercialOnly: commercialOnly?.checked || false,
      limit: parseInt(limitSelect?.value || '20', 10),
    };

    this.hfSearchState.loading = true;
    this.hfSearchState.error = null;
    this.hfSearchState.searched = true;
    this.hfModels = [];

    if (searchBtn) searchBtn.disabled = true;

    this.updateHfList();

    try {
      const result = await window.llamaAPI.hfSearchModels(options);
      if (result.success) {
        this.hfModels = result.models || [];
        this.hfSearchState.error = null;
        // インストール済みチェックを更新
        await this.checkInstalledModels();
      } else {
        this.hfSearchState.error = result.error || '不明なエラー';
      }
    } catch (error) {
      this.hfSearchState.error = error.message;
    } finally {
      this.hfSearchState.loading = false;
      if (searchBtn) searchBtn.disabled = false;
      this.updateHfList();
    }
  }

  /**
   * HFモデルをダウンロード
   */
  async startHfDownload(hfModel) {
    try {
      console.log('Starting HF download:', hfModel.name);
      const result = await window.llamaAPI.hfDownloadModel(hfModel);
      console.log('HF Download started:', result);
    } catch (error) {
      console.error('Failed to start HF download:', error);
      alert(`ダウンロード開始に失敗しました: ${error.message}`);
    }
  }

  /**
   * フィルターを適用 (プリセットタブ)
   */
  applyFilters() {
    const licenseFilter = document.getElementById('license-filter')?.value || 'all';
    const memoryFilter = document.getElementById('memory-filter')?.value || 'all';

    const listContainer = document.getElementById('model-store-list');
    if (listContainer) {
      listContainer.innerHTML = this.renderModelList({
        license: licenseFilter,
        memory: memoryFilter,
      });
    }
  }

  /**
   * HFモデルリストを更新
   */
  updateHfList() {
    const listContainer = document.getElementById('hf-model-list');
    if (listContainer) {
      listContainer.innerHTML = this.renderHfModelList();
    }
  }

  /**
   * ダウンロード済みローカルモデルリストをレンダリング
   */
  renderLocalModelList() {
    // localModelsからプリセットモデルを除外
    const presetFileNames = new Set(this.presetModels.map(p => `${p.id}.gguf`));
    const hfDownloadedModels = this.localModels.filter(m => !presetFileNames.has(m.id));

    if (hfDownloadedModels.length === 0) {
      return '<div class="empty-state">HuggingFace検索などから追加されたモデルはありません。</div>';
    }

    return hfDownloadedModels.map(model => `
      <div class="model-card" data-model-id="${model.id}">
        <div class="model-info">
          <h3>${model.name}</h3>
          <p class="model-description">ファイル: ${model.id}</p>
          <div class="model-specs">
            <span class="spec">📦 ${model.sizeFormatted}</span>
            <span class="spec">📅 ${new Date(model.createdAt).toLocaleDateString()}</span>
          </div>
          <div class="model-tags">
            <span class="tag hf-source">🤗 HF / Local</span>
          </div>
        </div>
        <div class="model-actions">
          <button class="btn-delete"
            data-action="delete-local"
            data-model-id="${model.id}"
            data-model-name="${model.name}"
            title="このモデルを削除">🗑️ 削除</button>
        </div>
      </div>
    `).join('');
  }

  /**
   * タブを切り替え
   */
  switchTab(tab) {
    this.activeTab = tab;

    // タブボタン
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // タブコンテンツ
    document.getElementById('tab-preset').style.display = tab === 'preset' ? 'flex' : 'none';
    document.getElementById('tab-hf').style.display = tab === 'hf' ? 'flex' : 'none';
    document.getElementById('tab-local').style.display = tab === 'local' ? 'flex' : 'none';
  }

  /**
   * ダウンロード開始 (プリセット)
   */
  async startDownload(modelId) {
    try {
      const result = await window.llamaAPI.startDownload(modelId);
      console.log('Download started:', result);
    } catch (error) {
      console.error('Failed to start download:', error);
      alert(`ダウンロード開始に失敗しました: ${error.message}`);
    }
  }

  /**
   * ダウンロードキャンセル
   */
  async cancelDownload(downloadId) {
    try {
      await window.llamaAPI.cancelDownload(downloadId);
      this.downloads.delete(downloadId);
      this.refreshUI();
    } catch (error) {
      console.error('Failed to cancel download:', error);
    }
  }

  /**
   * モデルを削除
   */
  async deleteModel(modelId, modelName) {
    const name = modelName || modelId.replace('.gguf', '');
    if (!confirm(`「${name}」を削除してもよろしいですか？\nこの操作は取り消せません。`)) {
      return;
    }

    try {
      await window.llamaAPI.deleteModel(modelId);

      // 削除後、インストール済みモデルのリストを最新化する
      await this.checkInstalledModels();

      this.refreshUI();

      if (window.loadModels) {
        await window.loadModels();
      }

      alert('モデルを削除しました');
    } catch (error) {
      console.error('Failed to delete model:', error);
      alert(`モデルの削除に失敗しました: ${error.message}`);
    }
  }

  /**
   * ダウンロードプログレスを処理
   */
  handleDownloadProgress(data) {
    const { downloadId, modelId, percentage, speed, eta } = data;

    this.downloads.set(downloadId, {
      modelId,
      progress: percentage,
      speed,
      eta,
    });

    this.refreshUI();
  }

  /**
   * ダウンロード完了を処理
   */
  async handleDownloadComplete(data) {
    const { downloadId, modelId } = data;

    this.downloads.delete(downloadId);
    
    // ダウンロード完了後、インストール済みリストを再取得
    await this.checkInstalledModels();

    this.refreshUI();

    if (window.loadModels) {
      await window.loadModels();
    }

    alert('モデルのダウンロードが完了しました！');
  }

  /**
   * ダウンロードエラーを処理
   */
  handleDownloadError(data) {
    const { downloadId, error } = data;

    this.downloads.delete(downloadId);
    this.refreshUI();

    alert(`ダウンロードエラー: ${error}`);
  }

  /**
   * UIを更新
   */
  refreshUI() {
    // プリセットタブ更新
    const licenseFilter = document.getElementById('license-filter')?.value || 'all';
    const memoryFilter = document.getElementById('memory-filter')?.value || 'all';
    const presetList = document.getElementById('model-store-list');
    if (presetList) {
      presetList.innerHTML = this.renderModelList({ license: licenseFilter, memory: memoryFilter });
    }

    // HFタブ更新
    const hfList = document.getElementById('hf-model-list');
    if (hfList) {
      hfList.innerHTML = this.renderHfModelList();
    }

    // Localタブ更新
    const localList = document.getElementById('local-model-list');
    if (localList) {
      localList.innerHTML = this.renderLocalModelList();
    }
  }

  /**
   * 速度をフォーマット
   */
  formatSpeed(bytesPerSec) {
    if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  }

  /**
   * 残り時間をフォーマット
   */
  formatETA(seconds) {
    if (seconds < 60) return `${Math.round(seconds)}秒`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}分`;
    return `${Math.round(seconds / 3600)}時間`;
  }

  /**
   * モーダル内のクリックイベントを処理
   */
  handleModalClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;

    switch (action) {
      case 'close':
        this.hide();
        break;
      case 'tab':
        this.switchTab(target.dataset.tab);
        break;
      case 'download':
        this.startDownload(target.dataset.modelId);
        break;
      case 'hf-download': {
        try {
          const hfModel = JSON.parse(decodeURIComponent(target.dataset.hfModel));
          this.startHfDownload(hfModel);
        } catch (e) {
          console.error('Failed to parse hf model data:', e);
        }
        break;
      }
      case 'hf-search':
        this.executeHfSearch();
        break;
      case 'hint-search': {
        const searchInput = document.getElementById('hf-search-input');
        if (searchInput) {
          searchInput.value = target.dataset.hint;
        }
        this.executeHfSearch();
        break;
      }
      case 'cancel':
        this.cancelDownload(target.dataset.downloadId);
        break;
      case 'delete':
        this.deleteModel(target.dataset.modelId, target.dataset.modelName);
        break;
      case 'delete-hf':
        this.deleteModel(target.dataset.modelId, target.dataset.modelName);
        break;
      case 'delete-local':
        this.deleteModel(target.dataset.modelId, target.dataset.modelName);
        break;
      case 'change-dir':
        this.changeModelsDirectory();
        break;
    }
  }

  /**
   * モデル保存ディレクトリを変更
   */
  async changeModelsDirectory() {
    try {
      const result = await window.electronAPI.modelsDir.select();

      if (result.canceled) return;

      const newDir = result.path;
      const confirmed = confirm(
        `モデル保存ディレクトリを変更しますか？\n\n新しい保存先:\n${newDir}\n\n※既存のモデルは移動されません。新しいディレクトリからモデルを読み込みます。`
      );

      if (!confirmed) return;

      await window.electronAPI.modelsDir.set(newDir);
      this.currentModelsDir = newDir;

      await this.checkInstalledModels();
      this.refreshUI();

      if (window.loadModels) {
        await window.loadModels();
      }

      alert('モデル保存ディレクトリを変更しました');
    } catch (error) {
      console.error('Failed to change models directory:', error);
      alert(`ディレクトリの変更に失敗しました: ${error.message}`);
    }
  }

  /**
   * モーダル内の変更イベントを処理
   */
  handleModalChange(event) {
    const action = event.target.dataset.action;
    if (action === 'filter') {
      this.applyFilters();
    }
  }
}

// グローバルインスタンス
const modelStore = new ModelStore();
