/* レシピ共有。コード共有を使うだけの場合、このファイルは読み込まない。 */
(() => {
  'use strict';
  const CHOICE_TAGS = ['優勝レシピ', '初心者向け', '速攻', 'コントロール', 'コンボ', 'テーマ', '大会向け', 'お試し'];
  const SEASONS = ['春', '夏', '秋', '冬', '無', '混化'];
  const LINK = /https?:|ftp:\/\/|mailto:|www\.|[a-z0-9][a-z0-9.-]*\.(?:com|net|org|jp|io|dev|app|info|biz|xyz|co)(?:[^a-z]|$)/i;
  const cfg = window.KANNAGI_RECIPES || {};
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.url || '') && Boolean(cfg.publishableKey);
  const storageKey = 'kannagi-recipes:' + cfg.url;
  const feedOptionsKey = storageKey + ':feed-options';
  const bookmarksKey = storageKey + ':recipe-bookmarks';
  const feedKey = mode => feedOptionsKey + (mode === 'saved' ? ':saved' : '');
  function readFeedOptions(mode = 'all') {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(feedKey(mode)) || 'null'); } catch (_) { }
    return { sort: ['new', 'week', 'all'].includes(saved?.sort) ? saved.sort : 'new',
      tag: [...SEASONS, ...CHOICE_TAGS].includes(saved?.tag) ? saved.tag : '' };
  }
  function readBookmarks() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(bookmarksKey) || '[]'); } catch (_) { }
    return new Set((Array.isArray(saved) ? saved : []).filter(id => typeof id === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)));
  }
  const errorMessages = {
    LINK_NOT_ALLOWED: 'リンクは投稿できません。URLを削除してください。',
    POST_RATE_LIMIT: '投稿は1分に1件、24時間で10件までです。時間をおいてお試しください。',
    VOTE_RATE_LIMIT: '少し時間をおいてから、もう一度お試しください。',
    DUPLICATE_DECK: '同じ内容のデッキをすでに投稿しています。',
    INVALID_TEXT: 'デッキ名・投稿者名・説明の文字数を確認してください。',
    INVALID_DECK: 'デッキ内容を確認してください。',
    DECK_TOO_SMALL: 'デッキは40枚以上で投稿できます。',
    SELF_LIKE_NOT_ALLOWED: '自分の投稿にはグッドできません。',
    INVALID_TAGS: 'タグを選び直してください。',
    POST_NOT_FOUND: 'この投稿は削除されています。',
    POST_OWNER_REQUIRED: 'この投稿を編集・削除できるのは、投稿した本人です。',
    ADMIN_REQUIRED: '運営者のアカウントでログインしてください。',
    AUTH_REQUIRED: '接続を確認して、もう一度お試しください。'
  };
  let session;
  let refreshTask;
  let anonymousTask;
  try { session = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch (_) { session = null; }
  function keepSession(data) {
    session = data ? { access_token: data.access_token, refresh_token: data.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + data.expires_in, user: data.user } : null;
    try { if (session) localStorage.setItem(storageKey, JSON.stringify(session)); else localStorage.removeItem(storageKey); } catch (_) { }
  }
  async function request(path, body, token) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(cfg.url + path, { method: 'POST', signal: controller.signal,
        headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) {
        const code = Object.keys(errorMessages).find(key => String(data.message || '').includes(key));
        const error = new Error(errorMessages[code] || (path.includes('/auth/') ? '認証できませんでした。入力内容や接続を確認してください。' : '通信に失敗しました。もう一度お試しください。'));
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('通信できませんでした。接続を確認して、もう一度お試しください。');
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function getSession(create = false) {
    if (!configured) throw new Error('レシピ共有は準備中です。');
    if (session && session.expires_at < Date.now() / 1000 + 60) {
      if (!refreshTask) refreshTask = request('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token })
        .then(keepSession).catch(error => { if (error.status === 400 || error.status === 401) keepSession(null); else throw error; })
        .finally(() => { refreshTask = null; });
      await refreshTask;
    }
    if (!session && create) {
      if (!anonymousTask) anonymousTask = request('/auth/v1/signup', {}).then(keepSession).finally(() => { anonymousTask = null; });
      await anonymousTask;
    }
    return session;
  }
  async function rpc(name, args = {}, signed = false) {
    const s = await getSession(signed);
    return request('/rest/v1/rpc/recipe_' + name, args, s?.access_token);
  }
  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    if (name === 'star') {
      path.setAttribute('d', 'm12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.2L12 17.4l-5.6 2.9 1.1-6.2L2.9 9.6l6.3-.9Z');
      svg.append(path); return svg;
    }
    path.setAttribute('d', name === 'good' ? 'M7 10v11H3V10h4Zm0 1 5-8c2 0 3 1 2 5l-1 2h6a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 2H7' : name === 'search' ? 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6' : name === 'crown' ? 'M3 6l4 4 5-7 5 7 4-4-2 12H5L3 6Zm3 15h12' : 'M4 12h16m-6-6 6 6-6 6');
    svg.append(path); return svg;
  }
  const button = (label, action, className = 'recipe-button') => {
    const el = node('button', className, label); el.type = 'button'; el.addEventListener('click', action); return el;
  };
  function field(label, tag = 'input', maxLength = 64) {
    const wrap = node('label', 'recipe-field'); wrap.append(node('span', '', label));
    const input = node(tag); input.maxLength = maxLength; if (tag === 'textarea') input.rows = 4;
    wrap.append(input); return { wrap, input };
  }
  function status(message, bad = false) {
    const el = node('p', 'recipe-status' + (bad ? ' is-error' : ''), message); el.setAttribute('role', bad ? 'alert' : 'status'); return el;
  }
  let authorHistoryCache;
  function authorHistory() {
    if (!authorHistoryCache) {
      let names = [];
      try {
        const saved = localStorage.getItem('kannagi-recipe-author-history');
        names = saved === null ? [localStorage.getItem('kannagi-recipe-author')] : JSON.parse(saved);
      } catch (_) { }
      authorHistoryCache = [...new Set((Array.isArray(names) ? names : []).filter(name => typeof name === 'string').map(name => name.trim())
        .filter(name => name && name.length <= 24 && !LINK.test(name.normalize('NFKC'))))].slice(0, 5);
    }
    return authorHistoryCache;
  }
  function rememberAuthor(value) {
    const name = value.trim();
    if (!name || name.length > 24 || LINK.test(name.normalize('NFKC'))) return;
    authorHistoryCache = [name, ...authorHistory().filter(previous => previous !== name)].slice(0, 5);
    try { localStorage.setItem('kannagi-recipe-author-history', JSON.stringify(authorHistoryCache)); } catch (_) { }
  }
  function setupAuthorHistory(author) {
    const input = author.input, controller = new AbortController();
    const events = { signal: controller.signal };
    const label = node('label', '', '投稿者名'); label.htmlFor = input.id = 'recipe-author-name';
    const wrap = node('div', 'recipe-field');
    const area = node('div', 'recipe-author-area');
    const menu = node('div', 'recipe-author-history'); menu.id = 'recipe-author-history'; menu.hidden = true;
    menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', '最近入力した投稿者名');
    input.autocomplete = 'off'; input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', menu.id); input.setAttribute('aria-expanded', 'false');
    area.append(input, menu); wrap.append(label, area); author.wrap = wrap;
    let names = [], selected = -1, edited = false;
    function hide() { menu.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); selected = -1; }
    function position() {
      if (menu.hidden) return;
      const field = input.getBoundingClientRect(), panel = input.closest('.deck-recipes-panel').getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = Math.max(panel.top, viewport?.offsetTop || 0);
      const bottom = Math.min(panel.bottom, viewport ? viewport.offsetTop + viewport.height : innerHeight);
      const below = bottom - field.bottom - 8, above = field.top - top - 8;
      const useAbove = below < Math.min(210, menu.scrollHeight) && above > below;
      menu.classList.toggle('is-above', useAbove);
      menu.style.maxHeight = Math.max(36, Math.min(210, useAbove ? above : below)) + 'px';
    }
    function choose(index) {
      if (!names[index]) return;
      input.value = names[index]; edited = true; rememberAuthor(input.value);
      input.dispatchEvent(new Event('input', { bubbles: true })); hide();
    }
    function show(query = '') {
      names = authorHistory().filter(name => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
      selected = -1; input.removeAttribute('aria-activedescendant'); menu.replaceChildren();
      names.forEach((name, index) => {
        const option = button(name, () => choose(index), 'recipe-author-option');
        option.id = menu.id + '-' + index; option.tabIndex = -1; option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
        option.addEventListener('pointerdown', event => event.preventDefault(), events); menu.append(option);
      });
      menu.hidden = names.length === 0; input.setAttribute('aria-expanded', String(!menu.hidden)); position();
    }
    input.addEventListener('focus', () => show(), events);
    input.addEventListener('click', () => show(), events);
    input.addEventListener('input', () => { edited = true; show(input.value); }, events);
    input.addEventListener('blur', () => { if (edited) rememberAuthor(input.value); hide(); }, events);
    document.addEventListener('pointerdown', event => { if (!area.contains(event.target)) hide(); }, { ...events, capture: true });
    input.addEventListener('keydown', event => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); event.stopPropagation(); hide(); return; }
      if (event.key === 'Enter' && !menu.hidden && selected >= 0) { event.preventDefault(); event.stopPropagation(); choose(selected); return; }
      if (event.key === 'Tab') { hide(); return; }
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); if (menu.hidden) show(); if (!names.length) return;
      selected = selected < 0 ? (event.key === 'ArrowDown' ? 0 : names.length - 1) : (selected + (event.key === 'ArrowDown' ? 1 : -1) + names.length) % names.length;
      [...menu.children].forEach((option, index) => option.setAttribute('aria-selected', String(index === selected)));
      input.setAttribute('aria-activedescendant', menu.children[selected].id); menu.children[selected].scrollIntoView({ block: 'nearest' });
    }, events);
    window.addEventListener('resize', position, events);
    window.visualViewport?.addEventListener('resize', position, events);
    return () => { if (edited) rememberAuthor(input.value); hide(); controller.abort(); };
  }
  function knownCards(map) {
    validateDeckImportMap(map);
    const index = new Map(cardIndexCache.entries.map(entry => [entry.number, entry]));
    return Object.entries(map).map(([number, count]) => {
      const card = index.get(number); if (!card) throw new Error('未対応のカードが含まれています。ページを更新してお試しください。');
      return { card, count };
    });
  }
  function recipeCards(map) {
    const entries = new Map(knownCards(map).map(entry => [entry.card.el, entry]));
    return deckBuilder.sortDeck([...entries.keys()]).map(card => entries.get(card));
  }
  function cardImages(map, max = Infinity, onCard) {
    const grid = node('div', max === Infinity ? 'recipe-card-grid' : 'recipe-card-preview');
    const cards = max === Infinity ? recipeCards(map) : knownCards(map);
    if (max !== Infinity) cards.sort((a, b) => Number(b.card.cost) - Number(a.card.cost) || Number(a.card.number) - Number(b.card.number));
    cards.slice(0, max).forEach(({ card, count }) => {
      const item = onCard ? button('', () => onCard(card, item), 'recipe-card-image recipe-card-open') : node('div', 'recipe-card-image');
      if (onCard) item.setAttribute('aria-label', stripCardReading(card.name) + 'を拡大表示');
      item.dataset.number = card.number;
      const img = node('img'); img.alt = card.name; img.loading = 'lazy';
      const original = card.el.querySelector('img');
      setListImage(img, toFullImagePath(original.getAttribute('data-src') || original.src));
      item.append(img, node('span', 'recipe-card-count', '×' + count)); grid.append(item);
    });
    return grid;
  }
  function badges(tags, onTag) {
    const group = node('div', 'recipe-tags');
    const order = [...SEASONS, ...CHOICE_TAGS];
    [...new Set(tags || [])].sort((a, b) => order.indexOf(a) - order.indexOf(b)).forEach(tag => {
      const badge = onTag ? button(tag, () => onTag(tag), 'recipe-tag') : node('span', 'recipe-tag', tag);
      if (onTag) badge.setAttribute('aria-label', '「' + tag + '」で絞り込み');
      if (tag === '優勝レシピ') { badge.classList.add('is-winner'); badge.prepend(icon('crown')); }
      group.append(badge);
    }); return group;
  }
  const cardCount = map => Object.values(map).reduce((sum, count) => sum + count, 0);
  function deckTotal(map) {
    return node('span', 'recipe-deck-total', cardCount(map) + '枚');
  }
  function mount(host) {
    const views = { all: { query: '', ...readFeedOptions() }, saved: { query: '', ...readFeedOptions('saved') } };
    const state = { active: false, revision: 0, mode: 'all', ...views.all, offset: 0, rows: [], draft: null, posting: false };
    let bookmarks = readBookmarks(), storageEvents, feedSnapshot, loading = false;
    let list, message, more, search, tag, sort, detail, composer, submitCurrent, cancelConfirmation, cleanupAuthorHistory;
    function invalidate() { state.revision++; }
    function showError(error) { message.replaceChildren(status(error.message, true)); }
    function setFormBusy(form, busy) {
      if (!form) return;
      if (busy) {
        if (form._busyControls) return;
        form._busyControls = [...form.elements].map(control => [control, control.disabled]);
        for (const [control] of form._busyControls) control.disabled = true;
        form.setAttribute('aria-busy', 'true');
      } else {
        for (const [control, disabled] of form._busyControls || []) control.disabled = disabled;
        delete form._busyControls; form.removeAttribute('aria-busy');
      }
    }
    function showEmptyFeed() {
      message.replaceChildren(status(state.query || state.tag ? '条件に合うレシピはありません。' : state.mode === 'saved' ? 'ブックマークしたレシピはありません。各投稿の☆から登録できます。' : 'まだ投稿がありません。最初のレシピを投稿してみましょう。'));
    }
    function pruneSavedFeed() {
      const removed = state.rows.filter(row => !bookmarks.has(row.id));
      if (!removed.length) return false;
      state.rows = state.rows.filter(row => bookmarks.has(row.id));
      state.offset = Math.max(0, state.offset - removed.length);
      for (const row of removed) list.querySelector('[data-recipe-bookmark="' + row.id + '"]')?.closest('.recipe-post').remove();
      if (loading || (!state.rows.length && !more.hidden)) { load(true); return true; }
      else if (!state.rows.length) showEmptyFeed();
      return false;
    }
    function returnToFeed() {
      cleanupAuthorHistory?.(); cleanupAuthorHistory = null;
      const previous = feedSnapshot;
      feedSnapshot = null; invalidate(); loading = false; detail = composer = null;
      host.classList.remove('is-detail');
      if (!previous) { renderShell(); load(); return; }
      host.replaceChildren(...previous.content);
      for (const control of host.querySelectorAll('[data-recipe-bookmark]')) setBookmarkButton(control, control.dataset.recipeBookmark);
      const resuming = state.mode === 'saved' && pruneSavedFeed();
      host.scrollTop = previous.scrollTop;
      if (previous.pending && !resuming) load(Boolean(state.rows.length));
    }
    function saveOptions() {
      views[state.mode] = { query: state.query, tag: state.tag, sort: state.sort };
      try { localStorage.setItem(feedKey(state.mode), JSON.stringify({ tag: state.tag, sort: state.sort })); } catch (_) { }
    }
    function switchFeed() {
      state.query = search.value.trim(); state.tag = tag.value; state.sort = sort.value; saveOptions();
      state.mode = state.mode === 'all' ? 'saved' : 'all'; Object.assign(state, views[state.mode]);
      renderShell(); host.scrollTop = 0; load();
    }
    function setBookmarkButton(control, id) {
      const saved = bookmarks.has(id);
      control.setAttribute('aria-pressed', String(saved));
      control.setAttribute('aria-label', saved ? 'ブックマークから解除' : 'ブックマークに登録');
      control.title = saved ? 'ブックマークから解除' : 'ブックマークに登録';
    }
    function bookmarkButton(row) {
      const control = button('', () => {
        const next = readBookmarks();
        if (next.has(row.id)) next.delete(row.id); else {
          if (next.size >= 10000) { deckBuilder.showMessage('ブックマークは10,000件まで登録できます。'); return; }
          next.add(row.id);
        }
        try { localStorage.setItem(bookmarksKey, JSON.stringify([...next])); }
        catch (_) { deckBuilder.showMessage('ブックマークを保存できません。ブラウザの保存設定を確認してください。'); return; }
        bookmarks = next; setBookmarkButton(control, row.id);
        if (state.mode === 'saved' && !detail) pruneSavedFeed();
      }, 'recipe-bookmark');
      control.append(icon('star')); control.dataset.recipeBookmark = row.id; setBookmarkButton(control, row.id); return control;
    }
    function filterByTag(value) {
      state.tag = value; detail = composer = null; renderShell(); host.scrollTop = 0; reload();
    }
    function renderShell() {
      cleanupAuthorHistory?.(); cleanupAuthorHistory = null;
      feedSnapshot = null;
      detail = composer = null;
      host.classList.remove('is-detail');
      host.replaceChildren();
      const post = button('投稿する', confirmComposer, 'recipe-button recipe-primary'); post.disabled = !configured;
      const controls = node('form', 'recipe-search');
      search = node('input'); search.type = 'search'; search.maxLength = 80; search.placeholder = 'デッキ名・投稿者・説明を検索'; search.setAttribute('aria-label', 'レシピを検索'); search.value = state.query;
      tag = node('select'); tag.setAttribute('aria-label', 'タグで絞り込み');
      [['', 'すべてのタグ'], ...[...SEASONS, ...CHOICE_TAGS].map(x => [x, x])].forEach(([value, label]) => { const option = node('option', '', label); option.value = value; tag.append(option); }); tag.value = state.tag;
      sort = node('select'); sort.setAttribute('aria-label', 'レシピの並び順');
      [['new', '新着順'], ['week', '週間人気'], ['all', '累計人気']].forEach(([value, label]) => { const option = node('option', '', label); option.value = value; sort.append(option); }); sort.value = state.sort;
      const find = button('検索', () => reload(), 'recipe-search-submit');
      find.setAttribute('aria-label', '検索'); find.replaceChildren(icon('search'));
      const saved = button('', switchFeed, 'recipe-saved-toggle'); saved.append(icon('star'));
      saved.setAttribute('aria-label', 'ブックマークしたレシピ'); saved.setAttribute('aria-pressed', String(state.mode === 'saved')); saved.title = state.mode === 'saved' ? 'すべてのレシピに戻る' : 'ブックマークしたレシピ';
      const searchField = node('div', 'recipe-search-field'); searchField.append(search, find);
      const searchGroup = node('div', 'recipe-search-input'); searchGroup.append(searchField, saved);
      controls.append(searchGroup, tag, sort, post);
      controls.addEventListener('submit', event => { event.preventDefault(); reload(); });
      const clearSearch = event => {
        if (!event.isComposing && !search.value.trim() && state.query) reload();
      };
      search.addEventListener('input', clearSearch);
      search.addEventListener('search', clearSearch);
      search.addEventListener('compositionend', clearSearch);
      tag.addEventListener('change', reload); sort.addEventListener('change', reload);
      message = node('div'); list = node('div', 'recipe-feed');
      more = button('さらに表示', () => load(true)); more.hidden = true;
      const foot = node('div', 'recipe-footer');
      foot.append(node('span', '', '週間人気：直近7日間のグッド数'));
      host.append(controls);
      if (state.mode === 'saved') host.append(node('p', 'recipe-saved-heading', 'ブックマークしたレシピ'));
      host.append(message, list, more, foot);
    }
    async function reload() {
      state.query = search.value.trim(); state.tag = tag.value; state.sort = sort.value;
      saveOptions();
      state.offset = 0; state.rows = []; list.replaceChildren(); await load();
    }
    async function load(append = false) {
      const revision = ++state.revision; more.hidden = true;
      if (!configured) { message.replaceChildren(status('レシピ共有は準備中です。コード共有はそのまま使えます。')); return; }
      loading = true;
      message.replaceChildren(status('読み込み中…'));
      try {
        const args = { p_query: state.query, p_tag: state.tag, p_sort: state.sort, p_offset: append ? state.offset : 0 };
        const result = state.mode === 'saved' && !bookmarks.size ? { items: [], more: false }
          : await rpc(state.mode === 'saved' ? 'bookmark_feed' : 'feed', state.mode === 'saved' ? { ...args, p_ids: [...bookmarks] } : args);
        if (!state.active || revision !== state.revision) return;
        if (!append) { state.rows = []; list.replaceChildren(); }
        const seen = new Set(state.rows.map(row => row.id));
        for (const row of result.items) if (!seen.has(row.id)) { state.rows.push(row); list.append(renderPost(row)); }
        state.offset = (append ? state.offset : 0) + result.items.length;
        more.hidden = !result.more; message.replaceChildren();
        if (!state.rows.length) showEmptyFeed();
      } catch (error) {
        if (!state.active || revision !== state.revision) return;
        showError(error); message.append(button('再読み込み', () => load(append)));
      } finally { if (revision === state.revision) loading = false; }
    }
    function renderPost(row) {
      const article = node('article', 'recipe-post');
      const meta = node('div', 'recipe-post-meta'), number = node('span', 'recipe-post-number', 'No.' + row.post_no);
      const author = node('span', 'recipe-post-author', row.author); author.title = row.author;
      const date = node('time', 'recipe-post-date', new Date(row.created_at).toLocaleDateString('ja-JP')); date.dateTime = row.created_at;
      meta.append(number, author, date); article.append(meta);
      const copy = node('div', 'recipe-post-copy');
      const title = button(row.title, () => openDetail(row), 'recipe-title');
      const heading = node('div', 'recipe-heading'); heading.append(title, deckTotal(row.cards));
      copy.append(heading);
      try { article.append(cardImages(row.cards, 5, (card, trigger) => openRecipeCard(row.cards, card, trigger))); } catch (_) { article.append(status('未対応のカードを含むレシピです。')); }
      copy.append(badges(row.tags, filterByTag));
      if (row.description) copy.append(node('p', 'recipe-description', row.description));
      const actions = node('div', 'recipe-post-actions');
      const good = button('', async () => {
        if (row.is_owner || good.disabled) return; good.disabled = true;
        try {
          const result = await rpc('like', { p_post: row.id, p_liked: !row.liked }, true);
          row.liked = result.liked; row.likes = result.likes; setGood();
        } catch (error) { if (state.active) showError(error); } finally { good.disabled = Boolean(row.is_owner); }
      });
      good.className = 'recipe-good';
      function setGood() {
        good.replaceChildren(icon('good'), node('span', '', String(row.likes)));
        good.setAttribute('aria-label', 'グッド ' + row.likes); good.setAttribute('aria-pressed', String(row.liked));
        good.disabled = Boolean(row.is_owner);
        if (row.is_owner) { good.title = errorMessages.SELF_LIKE_NOT_ALLOWED; good.setAttribute('aria-label', 'グッド ' + row.likes + '（自分の投稿）'); }
      }
      const view = button('レシピを見る', () => openDetail(row), 'recipe-view'); view.append(icon('arrow'));
      const reactions = node('div', 'recipe-reactions'); reactions.append(good, bookmarkButton(row));
      setGood(); actions.append(reactions, view); copy.append(actions);
      if (row.is_owner) copy.append(ownerActions(row));
      article.append(copy); return article;
    }
    function ownerActions(row) {
      const actions = node('div', 'recipe-owner-actions');
      actions.append(button('編集', () => openComposer(row.cards, null, row.title, false, row), 'recipe-owner-button'),
        button('削除', () => confirmRemoval(row), 'recipe-owner-button recipe-owner-delete'));
      return actions;
    }
    function confirmRemoval(row) {
      if (cancelConfirmation || document.querySelector('.confirm-popup')) return;
      const trigger = document.activeElement;
      const content = host.closest('.deck-share-expanded'), wasInert = content.inert;
      const overlay = node('div', 'confirm-popup recipe-post-confirm'), dialog = node('div', 'recipe-post-confirm-dialog');
      const question = node('p', 'recipe-post-confirm-question'); question.id = 'recipe-remove-question';
      question.append(node('strong', 'recipe-post-confirm-name', '「' + row.title + '」'), document.createTextNode('この投稿を削除しますか？'));
      dialog.setAttribute('role', 'alertdialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', question.id);
      const notice = node('div'), actions = node('div', 'recipe-post-confirm-actions');
      function close(restore = true) { overlay.remove(); content.inert = wasInert; cancelConfirmation = null; if (restore && trigger?.isConnected) trigger.focus({ preventScroll: true }); }
      const no = button('キャンセル', () => close());
      const yes = button('削除する', async () => {
        if (yes.disabled) return; no.disabled = yes.disabled = true;
        try {
          await rpc('delete', { p_post: row.id }, true); close(false);
          if (state.draft?.editingId === row.id) state.draft = null;
          if (state.active) { renderShell(); await load(); message.prepend(status('投稿を削除しました。')); }
        } catch (error) { notice.replaceChildren(status(error.message, true)); no.disabled = yes.disabled = false; }
      }, 'recipe-button recipe-delete');
      actions.append(no, yes); dialog.append(question, notice, actions); overlay.append(dialog);
      overlay.addEventListener('click', event => { if (event.target === overlay && !yes.disabled) close(); });
      overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!yes.disabled) close(); }
        if (event.key === 'Tab') { event.preventDefault(); if (!yes.disabled) (document.activeElement === no ? yes : no).focus({ preventScroll: true }); }
      });
      cancelConfirmation = () => close(false); content.inert = true; document.body.append(overlay); no.focus({ preventScroll: true });
    }
    function subview(title) {
      cleanupAuthorHistory?.(); cleanupAuthorHistory = null;
      if (!feedSnapshot) feedSnapshot = { content: [...host.childNodes], scrollTop: host.scrollTop, pending: loading };
      host.classList.remove('is-detail');
      invalidate(); loading = false; const panel = node('section', 'recipe-subview');
      const header = node('div', 'recipe-subview-header');
      header.append(button('一覧に戻る', returnToFeed), node('h3', '', title));
      panel.append(header); host.replaceChildren(panel); return panel;
    }
    function openDetail(row) {
      detail = subview(row.title);
      host.classList.add('is-detail'); detail.classList.add('recipe-detail');
      const header = detail.querySelector('.recipe-subview-header');
      header.classList.add('recipe-detail-header');
      const title = header.querySelector('h3'), heading = node('div', 'recipe-detail-heading');
      title.title = row.title; title.replaceWith(heading); heading.append(title, deckTotal(row.cards));
      const body = node('div', 'recipe-detail-body'), meta = node('div', 'recipe-detail-meta');
      meta.append(node('span', 'recipe-post-number', 'No.' + row.post_no), node('p', 'recipe-byline', row.author), badges(row.tags, filterByTag), bookmarkButton(row)); body.append(meta);
      if (row.description) body.append(node('p', 'recipe-description', row.description));
      detail.append(body);
      try {
        body.append(cardImages(row.cards, Infinity, (card, trigger) => openRecipeCard(row.cards, card, trigger)));
        let preparedCode = '';
        const revision = state.revision, codeNotice = node('div'); body.prepend(codeNotice);
        const use = button('このデッキコードを使う', async () => {
          if (!preparedCode || use.disabled) return;
          use.disabled = true;
          try {
            // コードは詳細を開いた時点で準備し、クリック直後にコピーする。
            // Safariでもクリップボード操作までユーザー操作の権限を保つ。
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(preparedCode);
            else {
              const text = node('textarea'), previousFocus = document.activeElement;
              text.value = preparedCode; text.readOnly = true;
              text.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
              document.body.append(text);
              try { text.select(); text.setSelectionRange(0, text.value.length); if (!document.execCommand('copy')) throw new Error('COPY_FAILED'); }
              finally { text.remove(); previousFocus?.focus({ preventScroll: true }); }
            }
            if (state.active && revision === state.revision) deckBuilder.showMessage('デッキコードをコピーしました。');
          } catch (_) { if (use.isConnected) deckBuilder.showMessage('コピーできませんでした。もう一度お試しください。'); }
          finally { use.disabled = false; }
        }, 'recipe-button recipe-primary');
        use.classList.add('recipe-use-code'); use.disabled = true; header.append(use);
        async function prepareCode() {
          codeNotice.replaceChildren(); preparedCode = ''; use.disabled = true;
          try {
            const code = await deckToCodeV7(row.cards);
            if (use.isConnected && state.active && revision === state.revision) { preparedCode = code; use.disabled = false; }
          } catch (_) {
            if (use.isConnected) codeNotice.replaceChildren(status('デッキコードを生成できませんでした。', true), button('再試行', prepareCode));
          }
        }
        prepareCode();
      } catch (error) { body.append(status(error.message, true)); }
      if (row.is_owner) body.append(ownerActions(row));
    }
    function openRecipeCard(map, card, trigger) {
      const cards = recipeCards(map).map(entry => entry.card.el);
      openImageModal(getModalCardFullImageSrc(card.el), {
        cards, card: card.el, recipeCards: map, returnTo: host.closest('#deck-share-modal'),
        returnScroll: host.querySelector('.recipe-detail-body') || host, returnFocus: trigger
      });
    }
    function confirmComposer() {
      if (cancelConfirmation || document.querySelector('.confirm-popup')) return;
      const cards = currentDeckToMap();
      const total = cardCount(cards);
      const deckId = deckManager.currentDeckId;
      const deckName = deckManager.decks[deckId]?.name || 'デッキ';
      const trigger = document.activeElement;
      const content = host.closest('.deck-share-expanded'), wasInert = content.inert;
      const overlay = node('div', 'confirm-popup recipe-post-confirm');
      const dialog = node('div', 'recipe-post-confirm-dialog');
      dialog.setAttribute('role', 'alertdialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'recipe-post-confirm-question');
      const question = node('p', 'recipe-post-confirm-question'); question.id = 'recipe-post-confirm-question';
      question.append(document.createTextNode('現在選択中のデッキ'), node('strong', 'recipe-post-confirm-name', '「' + deckName + '」'), document.createTextNode('を投稿しますか？'));
      const actions = node('div', 'recipe-post-confirm-actions');
      function close(restore = true) {
        overlay.remove(); content.inert = wasInert; cancelConfirmation = null;
        if (restore && trigger?.isConnected) trigger.focus({ preventScroll: true });
      }
      const no = button('キャンセル', () => close());
      const yes = button('投稿へ進む', () => {
        close(false);
        if (!state.active) return;
        if (deckId !== deckManager.currentDeckId || JSON.stringify(cards) !== JSON.stringify(currentDeckToMap()) || deckName !== (deckManager.decks[deckId]?.name || 'デッキ')) { confirmComposer(); return; }
        openComposer(cards, deckId, deckName);
      }, 'recipe-button recipe-primary');
      yes.disabled = total < 40;
      const fromCode = button('デッキコードから投稿', () => {
        close(false); if (state.active) openComposer(cards, deckId, deckName, true);
      }, 'recipe-code-post-start');
      if (total < 40) question.append(node('span', 'recipe-confirm-empty', '現在' + total + '枚です。デッキは40枚以上で投稿できます。デッキコードからも投稿できます。'));
      actions.append(no, yes); dialog.append(question, actions, fromCode); overlay.append(dialog);
      overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
      overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
        if (event.key === 'Tab') {
          event.preventDefault(); const targets = [no, yes, fromCode].filter(el => !el.disabled);
          const current = targets.indexOf(document.activeElement);
          targets[(current + (event.shiftKey ? -1 : 1) + targets.length) % targets.length].focus({ preventScroll: true });
        }
      });
      cancelConfirmation = () => close(false); content.inert = true; document.body.append(overlay); no.focus({ preventScroll: true });
    }
    function openComposer(cards, deckId, deckName, fromCode = false, editing = null) {
      const context = editing ? 'post:' + editing.id : deckId + ':' + JSON.stringify(cards);
      if (!state.draft || state.draft.context !== context) {
        let author = ''; try { author = localStorage.getItem('kannagi-recipe-author') || ''; } catch (_) { }
        state.draft = { context, cards, title: deckName, author: editing?.author || author, description: editing?.description || '',
          tags: (editing?.tags || []).filter(tag => CHOICE_TAGS.includes(tag)), editingId: editing?.id || null, request: crypto.randomUUID() };
      }
      const draft = state.draft;
      if (fromCode && !draft.fromCode) { draft.cards = {}; draft.fromCode = true; draft.request = crypto.randomUUID(); }
      composer = subview(editing ? '投稿を編集' : 'デッキを投稿');
      const form = node('form', 'recipe-composer');
      const title = field('デッキ名', 'input', 64), author = field('投稿者名', 'input', 24), description = field('説明', 'textarea', 400);
      title.input.required = author.input.required = true;
      title.input.value = draft.title; author.input.value = draft.author; description.input.value = draft.description;
      cleanupAuthorHistory = setupAuthorHistory(author);
      let automatic = [], submit;
      const preview = node('div', 'recipe-composer-preview'), seasonTags = node('div');
      function renderCards() {
        const known = knownCards(draft.cards);
        automatic = SEASONS.filter(season => known.some(({ card }) => card.season.some(value => value.includes(season))));
        preview.replaceChildren(...(known.length ? [deckTotal(draft.cards), cardImages(draft.cards, 8)] : [status('投稿するデッキコードを入力してください。')]));
        if (known.length && cardCount(draft.cards) < 40) preview.append(status(errorMessages.DECK_TOO_SMALL, true));
        if (submit) submit.disabled = state.posting || cardCount(draft.cards) < 40;
        seasonTags.replaceChildren(badges(automatic));
      }
      renderCards();
      const source = node('details', 'recipe-code-source'); source.open = Boolean(draft.fromCode);
      source.append(node('summary', '', 'デッキコードから投稿する'));
      const code = field('投稿するデッキコード', 'textarea', 20000); code.input.value = draft.sourceCode || '';
      const codeStatus = node('div');
      const applyCode = button('コードを反映', async () => {
        if (applyCode.disabled || state.posting) return;
        const value = code.input.value.trim();
        if (!value) { codeStatus.replaceChildren(status('デッキコードを入力してください。', true)); return; }
        applyCode.disabled = true;
        try {
          const map = await codeToMap(value);
          knownCards(map);
          if (cardCount(map) < 40) throw new Error(errorMessages.DECK_TOO_SMALL);
          if (!form.isConnected || code.input.value.trim() !== value) return;
          draft.cards = map; draft.appliedCode = value; draft.fromCode = true; draft.request = crypto.randomUUID();
          renderCards(); codeStatus.replaceChildren(status('デッキコードを反映しました（' + Object.values(map).reduce((sum, count) => sum + count, 0) + '枚）。'));
        } catch (error) { if (form.isConnected) codeStatus.replaceChildren(status(error.message || '無効なデッキコードです。', true)); }
        finally { applyCode.disabled = false; }
      });
      code.input.addEventListener('input', () => { draft.sourceCode = code.input.value; codeStatus.replaceChildren(); });
      source.append(code.wrap, applyCode, codeStatus);
      form.append(source, preview, title.wrap, author.wrap, description.wrap, node('p', 'recipe-hint', '説明は400文字まで。リンクは投稿できません。'), seasonTags);
      const choices = node('fieldset', 'recipe-tag-choices'); choices.append(node('legend', '', 'タグを選択（3つまで）'));
      CHOICE_TAGS.forEach(tag => {
        const label = node('label'); const box = node('input'); box.type = 'checkbox'; box.value = tag; box.checked = draft.tags.includes(tag);
        box.addEventListener('change', () => { if (box.checked && choices.querySelectorAll(':checked').length > 3) box.checked = false; updateDraft(); });
        label.append(box, node('span', '', tag)); choices.append(label);
      });
      const submitLabel = editing ? '変更を保存' : 'この内容で投稿';
      const notice = node('div'); submit = node('button', 'recipe-button recipe-primary', state.posting ? '保存中…' : submitLabel); submit.type = 'submit'; submit.disabled = state.posting || cardCount(draft.cards) < 40; submit.dataset.readyLabel = submitLabel;
      submitCurrent = submit;
      function updateDraft() {
        const next = { title: title.input.value, author: author.input.value, description: description.input.value, tags: [...choices.querySelectorAll(':checked')].map(el => el.value) };
        if (JSON.stringify(next) !== JSON.stringify({ title: draft.title, author: draft.author, description: draft.description, tags: draft.tags })) draft.request = crypto.randomUUID();
        Object.assign(draft, next); notice.replaceChildren();
      }
      form.addEventListener('input', updateDraft);
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (state.posting) return; updateDraft();
        if ((code.input.value.trim() && code.input.value.trim() !== draft.appliedCode) || !Object.keys(draft.cards).length) {
          source.open = true;
          notice.replaceChildren(status('投稿するデッキコードを反映してください。', true)); return;
        }
        if (LINK.test([draft.title, draft.author, draft.description].join(' ').normalize('NFKC'))) {
          notice.replaceChildren(status(errorMessages.LINK_NOT_ALLOWED, true)); return;
        }
        if (cardCount(draft.cards) < 40) {
          notice.replaceChildren(status(errorMessages.DECK_TOO_SMALL, true)); return;
        }
        if (!draft.title.trim() || !draft.author.trim()) { notice.replaceChildren(status('デッキ名と投稿者名を入力してください。', true)); return; }
        rememberAuthor(draft.author);
        state.posting = true; submit.disabled = true; submit.textContent = editing ? '保存中…' : '投稿中…';
        setFormBusy(form, true);
        const revision = state.revision;
        const payload = { p_request: draft.request, p_title: draft.title, p_author: draft.author, p_description: draft.description, p_cards: draft.cards, p_tags: [...automatic, ...draft.tags] };
        try {
          if (editing) { delete payload.p_request; payload.p_post = draft.editingId; }
          await rpc(editing ? 'update' : 'publish', payload, true);
          try { localStorage.setItem('kannagi-recipe-author', payload.p_author); } catch (_) { }
          if (state.draft === draft) state.draft = null;
          if (state.active && revision === state.revision) { renderShell(); await load(); message.prepend(status(editing ? '投稿を更新しました。' : 'レシピを投稿しました。')); }
        } catch (error) { if (form.isConnected) notice.replaceChildren(status(error.message, true)); }
        finally {
          state.posting = false;
          setFormBusy(form, false); setFormBusy(composer?.querySelector('form'), false);
          for (const el of [submit, submitCurrent]) if (el) { el.disabled = cardCount((el === submit ? draft : state.draft)?.cards || {}) < 40; el.textContent = el.dataset.readyLabel; }
        }
      });
      form.append(choices, notice, submit); composer.append(form);
      if (state.posting) setFormBusy(form, true);
    }
    renderShell();
    return {
      async open() {
        bookmarks = readBookmarks();
        storageEvents?.abort(); storageEvents = new AbortController();
        document.addEventListener('pointerdown', event => {
          if (document.activeElement === search && event.target !== search) search.blur();
        }, { signal: storageEvents.signal, capture: true });
        window.addEventListener('storage', event => {
          if (event.key !== bookmarksKey && event.key !== null) return;
          const previous = bookmarks;
          bookmarks = readBookmarks();
          for (const control of host.querySelectorAll('[data-recipe-bookmark]')) setBookmarkButton(control, control.dataset.recipeBookmark);
          if (state.mode === 'saved' && !detail && !composer) {
            if ([...bookmarks].some(id => !previous.has(id))) reload(); else pruneSavedFeed();
          }
        }, { signal: storageEvents.signal });
        state.active = true; renderShell(); await load();
      },
      close() { storageEvents?.abort(); cancelConfirmation?.(); cleanupAuthorHistory?.(); cleanupAuthorHistory = null; feedSnapshot = null; loading = false; state.active = false; invalidate(); }
    };
  }
  // 公開モーダルからは呼ばない。運営専用ページからのみ表示する。
  function mountAdmin(host) {
    let offset = 0, query = '', revision = 0;
    async function feed(append = false) {
      const requestId = ++revision;
      const message = host.querySelector('.recipe-admin-status');
      const list = host.querySelector('.recipe-admin-list');
      const more = host.querySelector('.recipe-admin-more');
      message.replaceChildren(status('読み込み中…')); more.hidden = true;
      try {
        if (!await rpc('is_admin', {}, true)) throw new Error(errorMessages.ADMIN_REQUIRED);
        const data = await rpc('feed', { p_query: query, p_tag: '', p_sort: 'new', p_offset: append ? offset : 0 });
        if (revision !== requestId) return;
        if (!append) { offset = 0; list.replaceChildren(); }
        for (const row of data.items) {
          const article = node('article', 'recipe-admin-post');
          article.append(node('h2', '', row.title), node('p', 'recipe-byline', row.author + ' · ' + new Date(row.created_at).toLocaleString('ja-JP')), node('p', 'recipe-description', row.description));
          article.append(button('削除', () => {
            if (article.querySelector('.recipe-delete-confirm')) return;
            const box = node('div', 'recipe-delete-confirm'); box.append(node('p', '', 'この投稿を削除しますか？'));
            const no = button('キャンセル', () => box.remove());
            const yes = button('削除する', async () => {
              yes.disabled = no.disabled = true;
              try { await rpc('delete', { p_post: row.id }, true); article.remove(); }
              catch (error) { box.append(status(error.message, true)); yes.disabled = no.disabled = false; }
            }, 'recipe-button recipe-delete'); box.append(no, yes); article.append(box);
          }, 'recipe-button recipe-delete')); list.append(article);
        }
        offset += data.items.length; more.hidden = !data.more; message.replaceChildren();
        if (!list.childElementCount) message.append(status('投稿はありません。'));
      } catch (error) { if (revision === requestId) { message.replaceChildren(status(error.message, true), button('再読み込み', () => feed(append))); } }
    }
    function dashboard() {
      host.replaceChildren();
      const search = node('form', 'recipe-admin-search');
      const input = node('input'); input.type = 'search'; input.maxLength = 80; input.placeholder = '投稿を検索'; input.setAttribute('aria-label', '投稿を検索');
      const submit = node('button', 'recipe-button', '検索'); submit.type = 'submit';
      search.append(input, submit, button('ログアウト', () => {
        revision++;
        try { const saved = sessionStorage.getItem(storageKey + ':visitor'); keepSession(saved ? JSON.parse(saved) : null); sessionStorage.removeItem(storageKey + ':visitor'); } catch (_) { keepSession(null); }
        login();
      }));
      search.addEventListener('submit', event => { event.preventDefault(); query = input.value.trim(); feed(); });
      host.append(search, node('div', 'recipe-admin-status'), node('div', 'recipe-admin-list'), button('さらに表示', () => feed(true), 'recipe-button recipe-admin-more'));
      feed();
    }
    function login() {
      host.replaceChildren();
      if (!configured) { host.append(status('接続先が未設定です。初期設定を完了してください。')); return; }
      const form = node('form', 'recipe-composer');
      const email = field('メールアドレス', 'input', 254), password = field('パスワード', 'input', 256);
      email.input.type = 'email'; email.input.autocomplete = 'username'; password.input.type = 'password'; password.input.autocomplete = 'current-password'; email.input.required = password.input.required = true;
      const notice = node('div'); const submit = node('button', 'recipe-button recipe-primary', 'ログイン'); submit.type = 'submit';
      form.append(email.wrap, password.wrap, notice, submit);
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (submit.disabled) return; submit.disabled = true;
        try {
          const next = await request('/auth/v1/token?grant_type=password', { email: email.input.value, password: password.input.value });
          if (!await request('/rest/v1/rpc/recipe_is_admin', {}, next.access_token)) throw new Error(errorMessages.ADMIN_REQUIRED);
          try { sessionStorage.setItem(storageKey + ':visitor', JSON.stringify(session)); } catch (_) { }
          keepSession(next); password.input.value = ''; dashboard();
        } catch (error) { notice.replaceChildren(status(error.message, true)); }
        finally { submit.disabled = false; }
      }); host.append(form);
    }
    login();
    if (configured && session) rpc('is_admin').then(admin => { if (admin) dashboard(); }).catch(() => {});
  }
  window.KannagiRecipes = { mount, mountAdmin };
})();
