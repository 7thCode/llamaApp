/**
 * モデルストアコンポーネント
 * HuggingFaceプリセットモデルの表示とダウンロード
 */

class ModelStore {
  constructor() {
    this.presetModels = [];
    this.downloads = new Map(); // downloadId -> { modelId, progress, speed, eta }
    this.installedModelIds = new Set();
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
      console.log('Current models directory:', this.currentModelsDir);
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

      // プリセットモデルのIDと一致するものを探す
      for (const model of models) {
        for (const preset of this.presetModels) {
          if (model.id === `${preset.id}.gguf`) {
            this.installedModelIds.add(preset.id);
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

    // モーダル表示アニメーション
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
    `;

    // イベント委譲を設定
    modal.addEventListener('click', (e) => this.handleModalClick(e));
    modal.addEventListener('change', (e) => this.handleModalChange(e));

    return modal;
  }

  /**
   * モデルリストをレンダリング
   */
  renderModelList(filters = { license: 'all', memory: 'all' }) {
    let filteredModels = this.presetModels;

    // ライセンスフィルター
    if (filters.license === 'commercial') {
      filteredModels = filteredModels.filter(m => m.commercial);
    } else if (filters.license === 'non-commercial') {
      filteredModels = filteredModels.filter(m => !m.commercial);
    }

    // メモリフィルター
    if (filters.memory === 'small') {
      filteredModels = filteredModels.filter(m => m.memoryRequired < 4 * 1024 * 1024 * 1024);
    } else if (filters.memory === 'medium') {
      filteredModels = filteredModels.filter(
        m => m.memoryRequired >= 4 * 1024 * 1024 * 1024 && m.memoryRequired <= 8 * 1024 * 1024 * 1024
      );
    }

    return filteredModels.map(model => this.renderModelCard(model)).join('');
  }

  /**
   * モデルカードをレンダリング
   */
  renderModelCard(model) {
    const isInstalled = this.installedModelIds.has(model.id);
    const isDownloading = Array.from(this.downloads.values()).some(d => d.modelId === model.id);
    const downloadInfo = Array.from(this.downloads.entries()).find(([_, d]) => d.modelId === model.id);

    const sizeGB = (model.size / (1024 * 1024 * 1024)).toFixed(1);
    const memoryGB = (model.memoryRequired / (1024 * 1024 * 1024)).toFixed(0);
    const commercialBadge = model.commercial ? '<span class="badge commercial">✅ 商用可</span>' : '<span class="badge non-commercial">⚠️ 非商用</span>';

    let actionButton = '';
    if (isInstalled) {
      actionButton = `
        <div class="installed-actions">
          <button class="btn-installed" disabled>✓ インストール済み</button>
          <button class="btn-delete" data-action="delete" data-model-id="${model.id}.gguf" title="このモデルを削除">🗑️ 削除</button>
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
      actionButton = `<button class="btn-download" data-action="download" data-model-id="${model.id}">ダウンロード</button>`;
    }

    return `
      <div class="model-card" data-model-id="${model.id}">
        <div class="model-info">
          <h3>${model.name}</h3>
          <p class="model-author">by ${model.author}</p>
          <p class="model-description">${model.description}</p>
          <div class="model-specs">
            <span class="spec">📦 ${sizeGB} GB</span>
            <span class="spec">💾 ${memoryGB} GB RAM</span>
            <span class="spec">⚙️ ${model.quantization}</span>
          </div>
          <div class="model-tags">
            ${model.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
          </div>
          <div class="model-license">
            ${commercialBadge}
            <a href="${model.licenseUrl}" target="_blank" class="license-link">${model.license}</a>
          </div>
        </div>
        <div class="model-actions">
          ${actionButton}
        </div>
      </div>
    `;
  }

  /**
   * フィルターを適用
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
   * ダウンロード開始
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
  async deleteModel(modelId) {
    // 確認ダイアログ
    const modelName = modelId.replace('.gguf', '');
    if (!confirm(`「${modelName}」を削除してもよろしいですか？\nこの操作は取り消せません。`)) {
      return;
    }

    try {
      await window.llamaAPI.deleteModel(modelId);

      // インストール済みリストから削除
      const presetId = modelId.replace('.gguf', '');
      this.installedModelIds.delete(presetId);

      this.refreshUI();

      // メインのモデルリストを更新
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
    this.installedModelIds.add(modelId);

    this.refreshUI();

    // メインのモデルリストを更新
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
    const listContainer = document.getElementById('model-store-list');
    if (listContainer) {
      const licenseFilter = document.getElementById('license-filter')?.value || 'all';
      const memoryFilter = document.getElementById('memory-filter')?.value || 'all';

      listContainer.innerHTML = this.renderModelList({
        license: licenseFilter,
        memory: memoryFilter,
      });
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
    const action = event.target.dataset.action;

    if (action === 'close') {
      this.hide();
    } else if (action === 'download') {
      const modelId = event.target.dataset.modelId;
      this.startDownload(modelId);
    } else if (action === 'cancel') {
      const downloadId = event.target.dataset.downloadId;
      this.cancelDownload(downloadId);
    } else if (action === 'delete') {
      const modelId = event.target.dataset.modelId;
      this.deleteModel(modelId);
    } else if (action === 'change-dir') {
      this.changeModelsDirectory();
    }
  }

  /**
   * モデル保存ディレクトリを変更
   */
  async changeModelsDirectory() {
    try {
      // ディレクトリ選択ダイアログを表示
      const result = await window.electronAPI.modelsDir.select();

      if (result.canceled) {
        return;
      }

      const newDir = result.path;
      console.log('Selected new models directory:', newDir);

      // 確認ダイアログ
      const confirmed = confirm(
        `モデル保存ディレクトリを変更しますか？\n\n新しい保存先:\n${newDir}\n\n※既存のモデルは移動されません。新しいディレクトリからモデルを読み込みます。`
      );

      if (!confirmed) {
        return;
      }

      // ディレクトリを設定
      await window.electronAPI.modelsDir.set(newDir);
      this.currentModelsDir = newDir;

      // インストール済みモデルを再確認
      await this.checkInstalledModels();
      this.refreshUI();

      // メインのモデルリストを更新
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
