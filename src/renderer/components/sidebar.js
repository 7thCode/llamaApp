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

      item.appendChild(title);
      item.appendChild(deleteBtn);
      item.addEventListener('click', () => {
        if (this._onSelect) this._onSelect(conv.id);
      });

      listEl.appendChild(item);
    });
  }
}

window.sidebar = new Sidebar();
