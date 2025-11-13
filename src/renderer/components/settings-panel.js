/**
 * Settings Panel Component
 * システムプロンプトと推論パラメータの設定UI
 */

class SettingsPanel {
  constructor() {
    this.isOpen = false;
    this.currentSettings = {
      systemPrompt: '',
      temperature: 0.7,
      maxTokens: 2048,
    };
    this.init();
  }

  /**
   * 初期化
   */
  async init() {
    this.createPanel();
    this.attachEventListeners();
    await this.loadSettings();
  }

  /**
   * 設定パネルのHTML要素を作成
   */
  createPanel() {
    const panel = document.createElement('div');
    panel.id = 'settings-panel';
    panel.className = 'settings-panel hidden';
    panel.innerHTML = `
      <div class="settings-overlay"></div>
      <div class="settings-content">
        <div class="settings-header">
          <h2>⚙️ 設定</h2>
          <button id="close-settings" class="close-btn">×</button>
        </div>

        <div class="settings-body">
          <!-- システムプロンプト -->
          <div class="setting-group">
            <label for="system-prompt">システムプロンプト</label>
            <p class="setting-description">
              AIの振る舞いを定義します。空欄の場合はデフォルトプロンプトが使用されます。
            </p>
            <textarea
              id="system-prompt"
              class="system-prompt-input"
              placeholder="例: あなたは親切で丁寧なアシスタントです。常に日本語で応答してください。"
              rows="8"
            ></textarea>
          </div>

          <!-- 温度設定 -->
          <div class="setting-group">
            <label for="temperature">Temperature（創造性）: <span id="temperature-value">0.7</span></label>
            <p class="setting-description">
              0.0 = 決定的（正確）、1.0 = 創造的（多様）
            </p>
            <input
              type="range"
              id="temperature"
              min="0"
              max="1"
              step="0.1"
              value="0.7"
              class="slider"
            />
          </div>

          <!-- 最大トークン数 -->
          <div class="setting-group">
            <label for="max-tokens">最大トークン数</label>
            <p class="setting-description">
              生成されるレスポンスの最大長（512 - 4096）
            </p>
            <input
              type="number"
              id="max-tokens"
              min="512"
              max="4096"
              step="128"
              value="2048"
              class="number-input"
            />
          </div>
        </div>

        <div class="settings-footer">
          <button id="reset-settings" class="btn-secondary">デフォルトに戻す</button>
          <button id="save-settings" class="btn-primary">保存</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    this.panel = panel;
  }

  /**
   * イベントリスナーを設定
   */
  attachEventListeners() {
    // パネルを開くボタン（index.htmlの⚙️ボタン）
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.open());
    }

    // パネルを閉じる
    const closeBtn = document.getElementById('close-settings');
    const overlay = this.panel.querySelector('.settings-overlay');
    closeBtn?.addEventListener('click', () => this.close());
    overlay?.addEventListener('click', () => this.close());

    // 温度スライダーのリアルタイム表示
    const tempSlider = document.getElementById('temperature');
    const tempValue = document.getElementById('temperature-value');
    tempSlider?.addEventListener('input', (e) => {
      tempValue.textContent = e.target.value;
    });

    // 保存ボタン
    const saveBtn = document.getElementById('save-settings');
    saveBtn?.addEventListener('click', () => this.saveSettings());

    // リセットボタン
    const resetBtn = document.getElementById('reset-settings');
    resetBtn?.addEventListener('click', () => this.resetSettings());
  }

  /**
   * パネルを開く
   */
  open() {
    this.panel.classList.remove('hidden');
    this.isOpen = true;
    // システムプロンプトにフォーカス
    setTimeout(() => {
      document.getElementById('system-prompt')?.focus();
    }, 100);
  }

  /**
   * パネルを閉じる
   */
  close() {
    this.panel.classList.add('hidden');
    this.isOpen = false;
  }

  /**
   * 設定を読み込み
   */
  async loadSettings() {
    try {
      const settings = await window.electronAPI.settings.load();
      this.currentSettings = settings;
      this.updateUI();
    } catch (error) {
      console.error('Failed to load settings:', error);
      // エラーの場合はデフォルト設定を使用
      this.updateUI();
    }
  }

  /**
   * UIを現在の設定で更新
   */
  updateUI() {
    const systemPromptEl = document.getElementById('system-prompt');
    const temperatureEl = document.getElementById('temperature');
    const temperatureValueEl = document.getElementById('temperature-value');
    const maxTokensEl = document.getElementById('max-tokens');

    if (systemPromptEl) systemPromptEl.value = this.currentSettings.systemPrompt || '';
    if (temperatureEl) temperatureEl.value = this.currentSettings.temperature || 0.7;
    if (temperatureValueEl) temperatureValueEl.textContent = this.currentSettings.temperature || 0.7;
    if (maxTokensEl) maxTokensEl.value = this.currentSettings.maxTokens || 2048;
  }

  /**
   * 設定を保存
   */
  async saveSettings() {
    const systemPrompt = document.getElementById('system-prompt')?.value || '';
    const temperature = parseFloat(document.getElementById('temperature')?.value || '0.7');
    const maxTokens = parseInt(document.getElementById('max-tokens')?.value || '2048', 10);

    // バリデーション
    if (temperature < 0 || temperature > 1) {
      alert('Temperature は 0.0 から 1.0 の間で設定してください。');
      return;
    }

    if (maxTokens < 512 || maxTokens > 4096) {
      alert('最大トークン数は 512 から 4096 の間で設定してください。');
      return;
    }

    this.currentSettings = {
      systemPrompt,
      temperature,
      maxTokens,
    };

    try {
      await window.electronAPI.settings.save(this.currentSettings);
      this.showNotification('設定を保存しました', 'success');
      this.close();
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showNotification('設定の保存に失敗しました', 'error');
    }
  }

  /**
   * デフォルト設定に戻す
   */
  resetSettings() {
    if (!confirm('設定をデフォルトに戻しますか？')) {
      return;
    }

    this.currentSettings = {
      systemPrompt: '',
      temperature: 0.7,
      maxTokens: 2048,
    };

    this.updateUI();
    this.showNotification('設定をデフォルトに戻しました', 'info');
  }

  /**
   * 通知を表示
   */
  showNotification(message, type = 'info') {
    // 簡易的な通知表示
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3000);
  }

  /**
   * 現在の設定を取得
   */
  getSettings() {
    return { ...this.currentSettings };
  }
}

// グローバルに公開
window.settingsPanel = new SettingsPanel();
