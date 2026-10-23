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
  const FILTER_TAGS = [...SEASONS, ...CHOICE_TAGS];
  const cleanTags = values => FILTER_TAGS.filter(tag => Array.isArray(values) && values.includes(tag));
  const feedKey = mode => feedOptionsKey + (mode === 'all' ? '' : ':' + mode);
  function readFeedOptions(mode = 'all') {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(feedKey(mode)) || 'null'); } catch (_) { }
    return { sort: ['new', 'week', 'all'].includes(saved?.sort) ? saved.sort : 'new',
      tags: cleanTags(saved?.tags ?? [saved?.tag]) };
  }
  function readBookmarks() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(bookmarksKey) || '[]'); } catch (_) { }
    return new Set((Array.isArray(saved) ? saved : []).filter(id => typeof id === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)));
  }
  const errorMessages = {
    LINK_NOT_ALLOWED: 'リンクは投稿できません。URLを削除してください。',
    POST_RATE_LIMIT: '投稿は1分に1件、24時間で10件までです。時間をおいてお試しください。',
    POSTING_BUSY: '現在、投稿が混み合っています。しばらく時間をおいてお試しください。',
    VOTE_RATE_LIMIT: '少し時間をおいてから、もう一度お試しください。',
    DUPLICATE_DECK: '同じ内容のデッキをすでに投稿しています。',
    INVALID_TEXT: 'デッキ名・投稿者名・説明の文字数を確認してください。',
    INVALID_DECK: 'デッキ内容を確認してください。',
    DECK_TOO_SMALL: 'デッキは40枚以上で投稿できます。',
    DECK_TOO_LARGE: 'デッキは150枚までで投稿できます。',
    SELF_LIKE_NOT_ALLOWED: '自分の投稿にはグッドできません。',
    INVALID_TAGS: 'タグを選び直してください。',
    POST_NOT_FOUND: 'この投稿は削除されています。',
    POST_OWNER_REQUIRED: 'この投稿を編集・削除できるのは、投稿した本人です。',
    ADMIN_REQUIRED: '運営者のアカウントでログインしてください。',
    AUTH_REQUIRED: '接続を確認して、もう一度お試しください。',
    BOOKMARK_RATE_LIMIT: 'ブックマークの操作が続いています。少し時間をおいてお試しください。',
    BOOKMARK_LIMIT: 'ブックマークは10,000件まで登録できます。'
  };
  let session;
  let refreshTask;
  let anonymousTask;
  // 一般利用者の匿名IDはlocalStorage、運営者のログインはタブを閉じると消えるsessionStorageへ分けて保存する。
  let sessionStore = { area: 'localStorage', key: storageKey };
  function readSession(store = sessionStore) {
    try { return JSON.parse(window[store.area].getItem(store.key) || 'null'); } catch (_) { return null; }
  }
  function writeSession(value, store = sessionStore) {
    try { if (value) window[store.area].setItem(store.key, JSON.stringify(value)); else window[store.area].removeItem(store.key); } catch (_) { }
  }
  session = readSession();
  // 旧版は運営者のログインを一般利用者と同じ場所に保存していた。見つけたら一般利用者の側から外し、
  // 運営画面で退避していた匿名IDがあれば元に戻す。
  const legacyVisitorStore = { area: 'sessionStorage', key: storageKey + ':visitor' };
  let legacyAdminSession = null;
  if (session?.user?.is_anonymous === false) {
    legacyAdminSession = session;
    session = readSession(legacyVisitorStore);
    writeSession(session); writeSession(null, legacyVisitorStore);
  }
  function keepSession(data) {
    session = data ? { access_token: data.access_token, refresh_token: data.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + data.expires_in, user: data.user } : null;
    writeSession(session);
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
  async function readRecipeFeed(args, isCurrent) {
    const s = await getSession();
    const empty = { items: [], more: false, nextOffset: args.p_offset };
    if (args.p_mode === 'own' && !s) return empty;
    // 保存先への追加を確認した構成だけが、新しいAPIを使用する。
    if (cfg.feedVersion === 2) {
      const result = await rpc('filtered_feed', args);
      return { ...result, nextOffset: args.p_offset + result.items.length };
    }
    const saved = args.p_mode === 'saved', name = saved ? 'bookmark_feed' : 'feed';
    const read = offset => rpc(name, { p_query: args.p_query, p_tag: args.p_tags[0] || '', p_sort: args.p_sort, p_offset: offset,
      ...(saved ? { p_ids: args.p_ids } : {}) });
    if (args.p_mode !== 'own' && args.p_tags.length <= 1) {
      const result = await read(args.p_offset);
      return { ...result, nextOffset: args.p_offset + result.items.length };
    }
    // 旧APIは先頭タグで絞って取得する。続きも順に調べ、全タグ・本人の条件で21件目まで確認する。
    // 次回の開始位置は採用件数ではなく元の一覧の位置を使い、未読・重複を防ぐ。
    const matches = [];
    let offset = args.p_offset;
    while (isCurrent()) {
      const result = await read(offset);
      if (!isCurrent()) return null;
      for (let i = 0; i < result.items.length; i++) {
        const row = result.items[i];
        if (args.p_mode === 'own' && !row.is_owner || !args.p_tags.every(tag => row.tags.includes(tag))) continue;
        if (matches.length === 20) return { items: matches, more: true, nextOffset: offset + i };
        matches.push(row);
      }
      offset += result.items.length;
      if (!result.more || !result.items.length || offset > 10000) return { items: matches, more: false, nextOffset: offset };
    }
    return null;
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
    path.setAttribute('d', name === 'good' ? 'M7 10v11H3V10h4Zm0 1 5-8c2 0 3 1 2 5l-1 2h6a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 2H7' : name === 'search' ? 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6' : name === 'crown' ? 'M3 6l4 4 5-7 5 7 4-4-2 12H5L3 6Zm3 15h12' : name === 'back' ? 'm15.5 5-7 7 7 7' : 'M4 12h16m-6-6 6 6-6 6');
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
      const item = onCard ? button('', event => onCard(card, item, event), 'recipe-card-image recipe-card-open') : node('div', 'recipe-card-image');
      if (onCard) item.setAttribute('aria-label', stripCardReading(card.name) + 'を拡大表示');
      item.dataset.number = card.number;
      const img = node('img'); img.alt = card.name; img.loading = 'lazy'; img.decoding = 'async';
      const original = card.el.querySelector('img');
      // 読み込めた画像からフェードインする（読み込み失敗時も枠だけ残さず表示状態にする）。
      setListImage(img, toFullImagePath(original.getAttribute('data-src') || original.src), () => item.classList.add('is-loaded'));
      item.append(img, node('span', 'recipe-card-count', '×' + count)); grid.append(item);
    });
    return grid;
  }
  function badges(tags, onTag) {
    const group = node('div', 'recipe-tags');
    const order = [...SEASONS, ...CHOICE_TAGS];
    [...new Set(tags || [])].sort((a, b) => order.indexOf(a) - order.indexOf(b)).forEach(tag => {
      const badge = onTag ? button('', () => onTag(tag), 'recipe-tag') : node('span', 'recipe-tag');
      badge.append(node('span', 'recipe-tag-label', tag));
      if (onTag) badge.setAttribute('aria-label', '「' + tag + '」で絞り込み');
      if (tag === '優勝レシピ') { badge.classList.add('is-winner'); badge.prepend(icon('crown')); }
      group.append(badge);
    }); return group;
  }
  const cardCount = map => Object.values(map).reduce((sum, count) => sum + count, 0);
  // 投稿できる枚数（40〜150枚）。保存先のSQLと同じ範囲にそろえる。
  const MAX_RECIPE_CARDS = 150;
  function deckSizeError(map) {
    const total = cardCount(map);
    return total < 40 ? errorMessages.DECK_TOO_SMALL : total > MAX_RECIPE_CARDS ? errorMessages.DECK_TOO_LARGE : '';
  }
  function deckTotal(map) {
    return node('span', 'recipe-deck-total', cardCount(map) + '枚');
  }
  function exceedsCardLimit(map) {
    const groups = new Map();
    for (const { card, count } of knownCards(map)) {
      const key = getDeckLimitGroupKey(card.name);
      const entry = groups.get(key) || { count: 0, limit: Infinity };
      entry.count += count;
      entry.limit = Math.min(entry.limit, deckBuilder.getBaseLimit(card.name));
      groups.set(key, entry);
    }
    return [...groups.values()].some(entry => entry.count > entry.limit);
  }
  let bookmarkWrites = Promise.resolve(), bookmarkSnapshot = '';
  const bookmarkVersion = (ids, uid) => uid + ':' + [...ids].sort().join(',');
  function bookmarkWrite(action) {
    const task = bookmarkWrites.catch(() => {}).then(action); bookmarkWrites = task; return task;
  }
  async function syncBookmarks() {
    const ids = readBookmarks();
    if (!ids.size && !session) return;
    const s = await getSession(ids.size > 0);
    if (!s) return;
    const version = bookmarkVersion(ids, s.user.id);
    if (version === bookmarkSnapshot) return;
    await rpc('bookmarks_sync', { p_ids: [...ids] }, true); bookmarkSnapshot = version;
  }
  function mount(host) {
    const views = Object.fromEntries(['all', 'saved', 'own'].map(mode => [mode, { query: '', ...readFeedOptions(mode) }]));
    const state = { active: false, revision: 0, mode: 'all', ...views.all, offset: 0, rows: [], draft: null, posting: false };
    let bookmarks = readBookmarks(), storageEvents, feedSnapshot, loading = false, loadingAppend = false;
    const bookmarkCounts = new Map(), pendingBookmarks = new Set();
    let list, message, more, search, tag, sort, detail, composer, submitCurrent, cancelConfirmation, cleanupAuthorHistory;
    let detailRow = null, composerPreviousRow = null;
    let closeTagMenu = () => {}, updateTagControl = () => {};
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
      message.replaceChildren(status(state.query || state.tags.length ? '条件に合うレシピはありません。' : state.mode === 'saved' ? 'ブックマークしたレシピはありません。各投稿の☆から登録できます。' : state.mode === 'own' ? 'このブラウザから投稿したレシピはありません。' : 'まだ投稿がありません。最初のレシピを投稿してみましょう。'));
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
      feedSnapshot = null; invalidate(); loading = false; detail = composer = detailRow = composerPreviousRow = null;
      host.classList.remove('is-detail');
      if (!previous) { renderShell(); load(); return; }
      host.replaceChildren(...previous.content);
      for (const control of host.querySelectorAll('[data-recipe-bookmark]')) setBookmarkButton(control, control.dataset.recipeBookmark);
      const resuming = state.mode === 'saved' && pruneSavedFeed();
      host.scrollTop = previous.scrollTop;
      if (previous.keyboardFocus && previous.focusTarget?.isConnected) previous.focusTarget.focus({ preventScroll: true });
      if (previous.pending && !resuming) load(previous.append);
    }
    function goBack() {
      if (composer && composerPreviousRow) { openDetail(composerPreviousRow); return true; }
      if (detail || composer) { returnToFeed(); return true; }
      return false;
    }
    function saveOptions() {
      views[state.mode] = { query: state.query, tags: [...state.tags], sort: state.sort };
      try { localStorage.setItem(feedKey(state.mode), JSON.stringify({ tags: state.tags, sort: state.sort })); } catch (_) { }
    }
    function switchFeed(mode) {
      state.query = search.value.trim(); state.sort = sort.value; saveOptions();
      state.mode = state.mode === mode ? 'all' : mode; Object.assign(state, views[state.mode]);
      state.rows = []; state.offset = 0;
      renderShell(); host.scrollTop = 0; load();
    }
    function setBookmarkButton(control, id) {
      const saved = bookmarks.has(id);
      control.setAttribute('aria-pressed', String(saved));
      control.setAttribute('aria-label', saved ? 'ブックマークから解除' : 'ブックマークに登録');
      const count = bookmarkCounts.get(id) || 0;
      control.title = (saved ? 'ブックマークから解除' : 'ブックマークに登録') + '（' + count + '件）';
      control.replaceChildren(icon('star'), node('span', 'recipe-bookmark-count', String(count)));
      control.disabled = pendingBookmarks.has(id);
    }
    function refreshBookmarkButtons(id) {
      const roots = [host, ...(feedSnapshot?.content || [])];
      for (const root of roots) for (const control of root.querySelectorAll?.('[data-recipe-bookmark]') || []) {
        if (!id || control.dataset.recipeBookmark === id) setBookmarkButton(control, control.dataset.recipeBookmark);
      }
    }
    function bookmarkButton(row) {
      const control = button('', async () => {
        if (pendingBookmarks.has(row.id)) return;
        pendingBookmarks.add(row.id); refreshBookmarkButtons(row.id);
        try {
          await bookmarkWrite(async () => {
            await syncBookmarks();
            const before = readBookmarks(), saved = !before.has(row.id);
            if (saved && before.size >= 10000) throw new Error(errorMessages.BOOKMARK_LIMIT);
            // 保存できる端末か先に確認し、通信失敗時は登録状態を変えない。
            try { localStorage.setItem(bookmarksKey, JSON.stringify([...before])); }
            catch (_) { throw new Error('ブックマークを保存できません。ブラウザの保存設定を確認してください。'); }
            const result = await rpc('bookmark', { p_post: row.id, p_saved: saved }, true);
            const next = readBookmarks();
            if (saved) next.add(row.id); else next.delete(row.id);
            try { localStorage.setItem(bookmarksKey, JSON.stringify([...next])); }
            catch (error) {
              bookmarkSnapshot = '';
              try { await rpc('bookmark', { p_post: row.id, p_saved: !saved }, true); } catch (_) { }
              throw new Error('ブックマークを保存できません。ブラウザの保存設定を確認してください。');
            }
            bookmarks = next; row.bookmarks = result.bookmarks; bookmarkCounts.set(row.id, result.bookmarks);
            bookmarkSnapshot = bookmarkVersion(next, session.user.id);
          });
          if (state.mode === 'saved' && !detail && !composer) pruneSavedFeed();
        } catch (error) { deckBuilder.showMessage(error.message || 'ブックマークを保存できませんでした。'); }
        finally { pendingBookmarks.delete(row.id); refreshBookmarkButtons(row.id); }
      }, 'recipe-bookmark');
      control.dataset.recipeBookmark = row.id; setBookmarkButton(control, row.id); return control;
    }
    function bookmarkStatus(row) {
      const group = node('div', 'recipe-bookmark-status'); group.append(bookmarkButton(row));
      try {
        if (exceedsCardLimit(row.cards)) {
          const seal = node('span', 'recipe-sealed', '封印'); seal.title = '現在の枚数上限を超えているカードがあります。'; group.append(seal);
        }
      } catch (_) { }
      return group;
    }
    function filterByTag(value) {
      state.tags = [value]; detail = composer = null; renderShell(); host.scrollTop = 0; reload();
    }
    function tagControl() {
      const trigger = button('', event => {
        if (menu.isConnected) { closeTagMenu(); return; }
        const events = new AbortController(), options = { signal: events.signal };
        document.body.append(menu); trigger.setAttribute('aria-expanded', 'true');
        const place = () => {
          const viewport = window.visualViewport, left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
          const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
          const r = trigger.getBoundingClientRect(), below = top + height - r.bottom - 16, above = r.top - top - 16;
          const down = below >= Math.min(300, above), space = Math.max(80, down ? below : above);
          menu.style.width = Math.min(Math.max(224, r.width), width - 24) + 'px';
          const limit = Math.min(440, space), rowHeight = items.firstElementChild.offsetHeight;
          const chrome = header.offsetHeight + 10; // 候補欄の上下余白と枠。
          menu.style.maxHeight = Math.min(limit, chrome + Math.max(1, Math.floor((limit - chrome) / rowHeight)) * rowHeight) + 'px';
          menu.style.left = Math.max(left + 12, Math.min(r.left, left + width - menu.offsetWidth - 12)) + 'px';
          menu.style.top = (down ? r.bottom + 6 : r.top - menu.offsetHeight - 6) + 'px';
        };
        closeTagMenu = (focus = false) => {
          events.abort(); menu.remove(); trigger.setAttribute('aria-expanded', 'false');
          closeTagMenu = () => {};
          if (focus && trigger.isConnected) trigger.focus({ preventScroll: true });
        };
        document.addEventListener('pointerdown', event => {
          if (!menu.contains(event.target) && !trigger.contains(event.target)) closeTagMenu();
        }, { ...options, capture: true });
        document.addEventListener('focusin', event => {
          if (!menu.contains(event.target) && !trigger.contains(event.target)) closeTagMenu();
        }, options);
        document.addEventListener('keydown', event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeTagMenu(true); }
        }, { ...options, capture: true });
        window.addEventListener('resize', place, options);
        window.visualViewport?.addEventListener('resize', place, options);
        window.visualViewport?.addEventListener('scroll', place, options);
        host.addEventListener('scroll', place, options);
        place();
        if (event.detail === 0) menu.querySelector('button').focus({ preventScroll: true });
      }, 'recipe-tag-trigger');
      trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', 'recipe-tag-menu');
      const menu = node('div', 'recipe-tag-menu'); menu.id = 'recipe-tag-menu';
      menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', 'タグで絞り込み');
      const header = node('div', 'recipe-tag-menu-header');
      const clear = button('解除', event => { state.tags = []; updateTagControl(); closeTagMenu(event.detail === 0); reload(); }, 'recipe-tag-clear');
      header.append(node('span', '', 'すべて一致'), clear);
      const items = node('div', 'recipe-tag-options'), inputs = new Map();
      for (const value of FILTER_TAGS) {
        const row = node('div', 'recipe-tag-option');
        const choose = button(value, event => {
          state.tags = [value]; updateTagControl(); closeTagMenu(event.detail === 0); reload();
        }, 'recipe-tag-single');
        const check = node('label', 'recipe-tag-check'), input = node('input'); input.type = 'checkbox';
        input.setAttribute('aria-label', value + 'を含める');
        input.addEventListener('change', () => {
          state.tags = FILTER_TAGS.filter(tag => tag === value ? input.checked : state.tags.includes(tag));
          updateTagControl(); reload();
        });
        check.append(input); row.append(choose, check); items.append(row); inputs.set(value, input);
      }
      menu.append(header, items);
      updateTagControl = () => {
        trigger.textContent = state.tags.length === 1 ? state.tags[0] : state.tags.length ? 'タグ（' + state.tags.length + '）' : 'タグ';
        trigger.title = state.tags.length ? state.tags.join(' ＋ ') + '（すべて一致）' : 'タグで絞り込み';
        trigger.setAttribute('aria-label', state.tags.length ? 'タグで絞り込み：' + state.tags.join('、') : 'タグで絞り込み');
        for (const [value, input] of inputs) {
          input.checked = state.tags.includes(value); input.closest('.recipe-tag-option').classList.toggle('is-selected', input.checked);
        }
        clear.disabled = !state.tags.length;
      };
      updateTagControl(); return trigger;
    }
    function renderShell() {
      closeTagMenu();
      cleanupAuthorHistory?.(); cleanupAuthorHistory = null;
      feedSnapshot = null;
      detail = composer = detailRow = composerPreviousRow = null;
      host.classList.remove('is-detail');
      host.replaceChildren();
      const post = button('投稿する', confirmComposer, 'recipe-button recipe-primary'); post.disabled = !configured;
      const controls = node('form', 'recipe-search');
      search = node('input'); search.type = 'search'; search.maxLength = 80; search.placeholder = 'デッキ名・投稿者・説明を検索'; search.setAttribute('aria-label', 'レシピを検索'); search.value = state.query;
      tag = tagControl();
      sort = node('select'); sort.setAttribute('aria-label', 'レシピの並び順');
      [['new', '新着順'], ['week', '週間人気'], ['all', '累計人気']].forEach(([value, label]) => { const option = node('option', '', label); option.value = value; sort.append(option); }); sort.value = state.sort;
      for (const control of [sort]) {
        // 標準selectはマウス操作でも:focus-visibleが残るため、操作方法を分ける。
        control.addEventListener('pointerdown', () => control.setAttribute('data-pointer-focus', ''));
        const clearPointerFocus = () => control.removeAttribute('data-pointer-focus');
        control.addEventListener('keydown', clearPointerFocus);
        control.addEventListener('blur', clearPointerFocus);
      }
      const find = button('検索', () => reload(), 'recipe-search-submit');
      find.setAttribute('aria-label', '検索'); find.replaceChildren(icon('search'));
      const saved = button('', () => switchFeed('saved'), 'recipe-saved-toggle'); saved.append(icon('star'));
      saved.setAttribute('aria-label', 'ブックマークしたレシピ'); saved.setAttribute('aria-pressed', String(state.mode === 'saved')); saved.title = state.mode === 'saved' ? 'すべてのレシピに戻る' : 'ブックマークしたレシピ';
      const own = button('投稿済', () => switchFeed('own'), 'recipe-saved-toggle recipe-own-toggle');
      own.setAttribute('aria-label', '投稿済のレシピ'); own.setAttribute('aria-pressed', String(state.mode === 'own'));
      own.title = state.mode === 'own' ? 'すべてのレシピに戻る' : 'このブラウザから投稿したレシピ';
      const searchField = node('div', 'recipe-search-field'); searchField.append(search, find);
      const searchGroup = node('div', 'recipe-search-input'); searchGroup.append(searchField, own, saved);
      controls.append(searchGroup, tag, sort, post);
      controls.addEventListener('submit', event => { event.preventDefault(); reload(); });
      const clearSearch = event => {
        if (!event.isComposing && !search.value.trim() && state.query) reload();
      };
      search.addEventListener('input', clearSearch);
      search.addEventListener('search', clearSearch);
      search.addEventListener('compositionend', clearSearch);
      sort.addEventListener('change', reload);
      message = node('div'); list = node('div', 'recipe-feed');
      more = button('さらに表示', () => load(true)); more.hidden = true;
      const foot = node('div', 'recipe-footer');
      foot.append(node('span', '', '週間人気：直近7日間のグッド数'));
      host.append(controls);
      if (state.mode === 'saved') host.append(node('p', 'recipe-saved-heading', 'ブックマークしたレシピ'));
      if (state.mode === 'own') host.append(node('p', 'recipe-saved-heading recipe-own-heading', '投稿済のレシピ'));
      host.append(message, list, more, foot);
    }
    async function reload() {
      state.query = search.value.trim(); state.sort = sort.value;
      saveOptions();
      state.offset = 0; await load();
    }
    async function load(append = false) {
      const revision = ++state.revision; more.hidden = true;
      if (!configured) { message.replaceChildren(status('レシピ共有は準備中です。コード共有はそのまま使えます。')); return; }
      loading = true; loadingAppend = append;
      // 表示中の一覧は残したまま裏で更新し、空→再表示のちらつきを出さない。
      const refreshing = !append && list.childElementCount > 0;
      list.classList.toggle('is-refreshing', refreshing);
      if (!refreshing) message.replaceChildren(status('読み込み中…'));
      try {
        const args = { p_query: state.query, p_tags: [...state.tags], p_sort: state.sort, p_offset: append ? state.offset : 0,
          p_mode: state.mode, p_ids: state.mode === 'saved' ? [...bookmarks] : [] };
        const result = state.mode === 'saved' && !bookmarks.size ? { items: [], more: false }
          : await readRecipeFeed(args, () => state.active && revision === state.revision);
        if (!state.active || revision !== state.revision) return;
        if (!append) { state.rows = []; list.replaceChildren(); }
        const seen = new Set(state.rows.map(row => row.id));
        for (const row of result.items) if (!seen.has(row.id)) {
          bookmarkCounts.set(row.id, Number(row.bookmarks) || 0); state.rows.push(row);
          list.append(renderPost(row));
        }
        state.offset = result.nextOffset ?? (append ? state.offset : 0) + result.items.length;
        more.hidden = !result.more; message.replaceChildren();
        if (!state.rows.length) showEmptyFeed();
      } catch (error) {
        if (!state.active || revision !== state.revision) return;
        showError(error); message.append(button('再読み込み', () => load(append)));
      } finally { if (revision === state.revision) { loading = false; list.classList.remove('is-refreshing'); } }
    }
    function renderPost(row) {
      const article = node('article', 'recipe-post');
      article.classList.toggle('is-owner', Boolean(row.is_owner));
      const meta = node('div', 'recipe-post-meta'), number = node('span', 'recipe-post-number', 'No.' + row.post_no);
      const author = node('span', 'recipe-post-author', row.author); author.title = row.author;
      const date = node('time', 'recipe-post-date', new Date(row.created_at).toLocaleDateString('ja-JP')); date.dateTime = row.created_at;
      meta.append(number, author, date); article.append(meta);
      const copy = node('div', 'recipe-post-copy');
      const title = button(row.title, () => openDetail(row), 'recipe-title');
      const heading = node('div', 'recipe-heading'); heading.append(title, deckTotal(row.cards));
      copy.append(heading);
      try { article.append(cardImages(row.cards, 5, (card, trigger, event) => openRecipeCard(row.cards, card, trigger, event))); } catch (_) { article.append(status('未対応のカードを含むレシピです。')); }
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
      const reactions = node('div', 'recipe-reactions'); reactions.append(good, bookmarkStatus(row));
      setGood(); actions.append(reactions, view); copy.append(actions);
      if (row.is_owner) copy.append(ownerActions(row));
      let pointerOrigin = null, pointerMoved = false;
      article.addEventListener('pointerdown', event => { pointerOrigin = { x: event.clientX, y: event.clientY, id: event.pointerId }; pointerMoved = false; });
      article.addEventListener('pointermove', event => {
        if (pointerOrigin?.id === event.pointerId && Math.hypot(event.clientX - pointerOrigin.x, event.clientY - pointerOrigin.y) > 8) pointerMoved = true;
      });
      article.addEventListener('click', event => {
        // ブックマークは押した直後にアイコンを置換するため、元のイベント経路で操作部を判定する。
        const interactive = event.composedPath().some(el => el instanceof Element && el !== article && el.matches('button, a, input, select, textarea, label, [role="button"], [role="link"], [contenteditable="true"]'));
        if (event.defaultPrevented || event.button !== 0 || interactive || event.detail > 0 && pointerMoved) return;
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && (article.contains(selection.anchorNode) || article.contains(selection.focusNode))) return;
        openDetail(row);
      });
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
      closeTagMenu();
      cleanupAuthorHistory?.(); cleanupAuthorHistory = null;
      const focusTarget = document.activeElement, keyboardFocus = host.contains(focusTarget) && focusTarget.matches(':focus-visible');
      if (!feedSnapshot) feedSnapshot = { content: [...host.childNodes], scrollTop: host.scrollTop, pending: loading, append: loadingAppend, focusTarget, keyboardFocus };
      host.classList.remove('is-detail');
      invalidate(); loading = false; const panel = node('section', 'recipe-subview');
      const header = node('div', 'recipe-subview-header');
      const back = button('', goBack, 'recipe-button recipe-back');
      back.append(icon('back'), node('span', 'recipe-back-label', '戻る'));
      header.append(back, node('h3', '', title));
      panel.append(header); host.replaceChildren(panel);
      if (keyboardFocus) back.focus({ preventScroll: true });
      return panel;
    }
    function openDetail(row) {
      composer = composerPreviousRow = null; detailRow = row;
      detail = subview(row.title);
      host.classList.add('is-detail'); detail.classList.add('recipe-detail');
      const header = detail.querySelector('.recipe-subview-header');
      header.classList.add('recipe-detail-header');
      const title = header.querySelector('h3'), heading = node('div', 'recipe-detail-heading');
      title.title = row.title; title.replaceWith(heading); heading.append(title, deckTotal(row.cards));
      const body = node('div', 'recipe-detail-body'), meta = node('div', 'recipe-detail-meta');
      meta.append(node('span', 'recipe-post-number', 'No.' + row.post_no), node('p', 'recipe-byline', row.author), badges(row.tags, filterByTag), bookmarkStatus(row)); body.append(meta);
      if (row.description) body.append(node('p', 'recipe-description', row.description));
      detail.append(body);
      try {
        body.append(cardImages(row.cards, Infinity, (card, trigger, event) => openRecipeCard(row.cards, card, trigger, event)));
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
    function openRecipeCard(map, card, trigger, event) {
      const cards = recipeCards(map).map(entry => entry.card.el);
      openImageModal(getModalCardFullImageSrc(card.el), {
        cards, card: card.el, recipeCards: map, returnTo: host.closest('#deck-share-modal'),
        returnScroll: host.querySelector('.recipe-detail-body') || host,
        returnFocus: event?.isTrusted && event.detail === 0 ? trigger : host.closest('.deck-share-expanded')
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
      yes.disabled = Boolean(deckSizeError(cards));
      const fromCode = button('デッキコードから投稿', () => {
        close(false); if (state.active) openComposer(cards, deckId, deckName, true);
      }, 'recipe-code-post-start');
      if (total < 40) question.append(node('span', 'recipe-confirm-empty', '現在' + total + '枚です。デッキは40枚以上で投稿できます。デッキコードからも投稿できます。'));
      else if (total > MAX_RECIPE_CARDS) question.append(node('span', 'recipe-confirm-empty', '現在' + total + '枚です。デッキは' + MAX_RECIPE_CARDS + '枚までで投稿できます。デッキコードからも投稿できます。'));
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
      composerPreviousRow = detail && !composer ? detailRow : null; detail = detailRow = null;
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
        if (known.length && deckSizeError(draft.cards)) preview.append(status(deckSizeError(draft.cards), true));
        if (submit) submit.disabled = state.posting || Boolean(deckSizeError(draft.cards));
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
          if (deckSizeError(map)) throw new Error(deckSizeError(map));
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
      const notice = node('div'); submit = node('button', 'recipe-button recipe-primary', state.posting ? '保存中…' : submitLabel); submit.type = 'submit'; submit.disabled = state.posting || Boolean(deckSizeError(draft.cards)); submit.dataset.readyLabel = submitLabel;
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
        if (deckSizeError(draft.cards)) {
          notice.replaceChildren(status(deckSizeError(draft.cards), true)); return;
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
          for (const el of [submit, submitCurrent]) if (el) { el.disabled = Boolean(deckSizeError((el === submit ? draft : state.draft)?.cards || {})); el.textContent = el.dataset.readyLabel; }
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
          const focused = document.activeElement;
          if ([search, tag, sort].includes(focused) && event.target !== focused) focused.blur();
        }, { signal: storageEvents.signal, capture: true });
        window.addEventListener('storage', event => {
          if (event.key !== bookmarksKey && event.key !== null) return;
          const previous = bookmarks;
          bookmarks = readBookmarks();
          for (const id of new Set([...previous, ...bookmarks])) if (previous.has(id) !== bookmarks.has(id) && bookmarkCounts.has(id)) {
            bookmarkCounts.set(id, Math.max(0, bookmarkCounts.get(id) + (bookmarks.has(id) ? 1 : -1)));
          }
          refreshBookmarkButtons();
          if (state.mode === 'saved' && !detail && !composer) {
            if ([...bookmarks].some(id => !previous.has(id))) reload(); else pruneSavedFeed();
          }
        }, { signal: storageEvents.signal });
        state.active = true;
        // 一覧を表示していた場合は作り直さず、表示したまま裏で最新に差し替える。
        if (detail || composer || !list?.isConnected || !state.rows.length) renderShell(); else refreshBookmarkButtons();
        const revision = ++state.revision;
        try { await bookmarkWrite(syncBookmarks); }
        catch (_) { if (state.active && revision === state.revision) deckBuilder.showMessage('ブックマーク件数を同期できませんでした。次に開いたときに再試行します。'); }
        if (state.active && revision === state.revision) await load();
      },
      back: goBack,
      close() { closeTagMenu(); storageEvents?.abort(); cancelConfirmation?.(); cleanupAuthorHistory?.(); cleanupAuthorHistory = null; feedSnapshot = null; loading = false; state.active = false; invalidate(); }
    };
  }
  // 公開モーダルからは呼ばない。運営専用ページからのみ表示する。
  function mountAdmin(host) {
    sessionStore = { area: 'sessionStorage', key: storageKey + ':admin' };
    session = readSession() || legacyAdminSession;
    writeSession(session);
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
        // この端末のログインだけをサーバー側でも無効にする。通信できなくても画面上はログアウトする。
        const token = session?.access_token;
        keepSession(null);
        if (token) fetch(cfg.url + '/auth/v1/logout?scope=local', { method: 'POST', headers: { apikey: cfg.publishableKey, Authorization: 'Bearer ' + token } }).catch(() => {});
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
