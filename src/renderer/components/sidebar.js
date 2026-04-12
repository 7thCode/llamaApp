/**
 * 会話履歴サイドバー
 */

class Sidebar {
  constructor() {
    this.conversations = [];
    this.activeId = null;
    this._onSelect = null;
    this._onDelete = null;
    this._onCreate = null;
    this._element = null;
    this._editingId = null; // インライン編集中の会話ID
  }

  /**
   * 初期化
   * @param {{ onSelect, onDelete, onCreate }} callbacks
   */
  async initialize({ onSelect, onDelete, onCreate }) {
    this._onSelect = onSelect;
    this._onDelete = onDelete;
    this._onCreate = onCreate;
    this._buildDom();
    await this.refresh();
  }

  /**
   * 会話一覧を再取得して再描画
   */
  async refresh() {
    try {
      this.conversations = await window.llamaAPI.listConversations();
      this._renderList();
    } catch (error) {
      console.error('Failed to refresh conversations:', error);
    }
  }

  /**
   * アクティブな会話をセット
   * @param {string} id
   */
  setActive(id) {
    this.activeId = id;
    if (this._element) {
      this._element.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === id);
      });
    }
  }

  _buildDom() {
    this._element = document.createElement('div');
    this._element.className = 'sidebar';
    this._element.innerHTML = `
      <div class="sidebar-header">
        <span class="sidebar-title">会話履歴</span>
        <button class="sidebar-new-btn" title="新しい会話">+</button>
      </div>
      <div class="sidebar-list"></div>
    `;

    this._element.querySelector('.sidebar-new-btn').addEventListener('click', () => {
      if (this._onCreate) this._onCreate();
    });

    const appMain = document.querySelector('.app-main');
    const chatContainer = document.querySelector('.chat-container');
    appMain.insertBefore(this._element, chatContainer);
  }

  _renderList() {
    const listEl = this._element.querySelector('.sidebar-list');
    listEl.innerHTML = '';

    this.conversations.forEach(conv => {
      const item = document.createElement('div');
      item.className = 'sidebar-item' + (conv.id === this.activeId ? ' active' : '');
      item.dataset.id = conv.id;

      const title = document.createElement('span');
      title.className = 'sidebar-item-title';
      title.textContent = conv.title;
      title.title = conv.title;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'sidebar-item-delete';
      deleteBtn.textContent = '×';
      deleteBtn.title = '削除';
      deleteBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (this._onDelete) this._onDelete(conv.id);
      });

      // ダブルクリックでタイトルをインライン編集
      title.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this._startEditTitle(conv.id, title, conv.title);
      });

      item.appendChild(title);
      item.appendChild(deleteBtn);
      item.addEventListener('click', () => {
        if (this._editingId) return; // 編集中はクリックを無視
        if (this._onSelect) this._onSelect(conv.id);
      });

      listEl.appendChild(item);
    });
  }
  /**
   * タイトルのインライン編集を開始
   * @param {string} id - 会話ID
   * @param {HTMLElement} titleEl - タイトル span 要素
   * @param {string} currentTitle - 現在のタイトル
   */
  _startEditTitle(id, titleEl, currentTitle) {
    if (this._editingId) return;
    this._editingId = id;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sidebar-title-input';
    input.value = currentTitle;

    // span を input に置き換え
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = async () => {
      const newTitle = input.value.trim() || currentTitle;
      this._editingId = null;

      // input を span に戻す
      const newSpan = document.createElement('span');
      newSpan.className = 'sidebar-item-title';
      newSpan.textContent = newTitle;
      newSpan.title = newTitle;
      input.replaceWith(newSpan);

      // ダブルクリックイベントを再設定
      newSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this._startEditTitle(id, newSpan, newTitle);
      });

      if (newTitle !== currentTitle) {
        try {
          await window.llamaAPI.renameConversation(id, newTitle);
          // ローカルキャッシュも更新
          const conv = this.conversations.find(c => c.id === id);
          if (conv) conv.title = newTitle;
        } catch (error) {
          console.error('Failed to rename conversation:', error);
        }
      }
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        input.value = currentTitle;
        input.blur();
      }
    });
  }
}

window.sidebar = new Sidebar();
