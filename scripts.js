// ページ更新時に最上部にスクロール（最優先で実行）
window.onbeforeunload = function () {
  window.scrollTo(0, 0);
  // メモリリークを防ぐためキャッシュをクリア
  if (typeof seriesInfoCache !== 'undefined') {
    seriesInfoCache.clear();
  }
};

// Safari用の追加対策
window.onpageshow = function (event) {
  if (event.persisted) {
    window.scrollTo(0, 0);
  }
};

// 既存の対策を維持しつつ、より早いタイミングでも
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// バックアップとして他のタイミングでも実行
document.addEventListener('readystatechange', function (event) {
  if (document.readyState === 'interactive') {
    window.scrollTo(0, 0);
  }
});

// 最初にすべてのグローバル変数を定義
window.seasonSortOrder = 'asc'; // windowオブジェクトにアタッチして確実にグローバルスコープにする
let sortCriteria = null;
let sortOrder = 'asc';
let scrollPosition = 0;
let isDragging = false;
let currentCard = null;
let startY = 0;

// ★現在の日付を更新する関数を追加
function updateCurrentDate() {
  const updateDateElement = document.getElementById('update-date');
  if (updateDateElement) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    updateDateElement.textContent = `${year}-${month}-${day}`;
  }
}

// ナビゲーションボタンの状態
const updateNavigationButtons = () => {
  const prevButton = document.getElementById('prev-image');
  const nextButton = document.getElementById('next-image');

  if (!prevButton || !nextButton || !visibleCards) return;

  // 前のカードの存在チェック
  let hasPrev = false;
  for (let i = currentImageIndex - 1; i >= 0; i--) {
    if (!visibleCards[i].hasAttribute('data-empty')) {
      hasPrev = true;
      break;
    }
  }

  // 次のカードの存在チェック
  let hasNext = false;
  for (let i = currentImageIndex + 1; i < visibleCards.length; i++) {
    if (!visibleCards[i].hasAttribute('data-empty')) {
      hasNext = true;
      break;
    }
  }

  // ボタンの表示制御
  prevButton.style.display = hasPrev ? 'block' : 'none';
  nextButton.style.display = hasNext ? 'block' : 'none';

  if (hasPrev) {
    prevButton.classList.add('visible');
  } else {
    prevButton.classList.remove('visible');
  }

  if (hasNext) {
    nextButton.classList.add('visible');
  } else {
    nextButton.classList.remove('visible');
  }
};

// フィルター条件を保持するオブジェクト
const filters = {
  series: new Set(),
  season: new Set(),
  type: new Set(),
  role: new Set(),
  keyword: new Set(),
  attribute: new Set(),
  rare: new Set()
};

// フォントサイズをリセット
function resetFontSize() {
  document.body.style.WebkitTextSizeAdjust = '100%';
  document.body.style.textSizeAdjust = '100%';
}
window.addEventListener('orientationchange', resetFontSize);
window.addEventListener('resize', resetFontSize);

// ★ページロード後にDOMの初期化設定を行う
document.addEventListener('DOMContentLoaded', () => {
  // 日付を更新
  updateCurrentDate();
  
  // モバイルでのプルトゥリフレッシュを防止
  document.body.style.overscrollBehavior = 'none';
  document.documentElement.style.overscrollBehavior = 'none';

  // 強制的にページトップに移動
  window.scrollTo(0, 0);
  // ページが完全に読み込まれたときに呼び出される
  window.addEventListener('load', () => {
    // ローディングスピナーを非表示にし、コンテンツを表示
    document.getElementById('loading-overlay').style.display = 'none';
    document.getElementById('content').style.display = 'block';
  });

  // 検索ボックスにイベントリスナーを追加
  const searchBox = document.getElementById('search-box');
  const mobileSearchBox = document.getElementById('mobile-search-box');
  const clearButton = document.querySelector('.clear-button');

  const updateClearButtonVisibility = (inputId, buttonId) => {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    button.style.display = input.value ? 'flex' : 'none';
  };

  searchBox.addEventListener('input', () => {
    filterCardsByName({ target: searchBox });
    updateClearButtonVisibility('search-box', 'clear-button-desktop');
  });

  mobileSearchBox.addEventListener('input', () => {
    filterCardsByName({ target: mobileSearchBox });
    updateClearButtonVisibility('mobile-search-box', 'clear-button-mobile');
  });

  // 初期状態を設定
  updateClearButtonVisibility('search-box', 'clear-button-desktop');
  updateClearButtonVisibility('mobile-search-box', 'clear-button-mobile');

  // 検索窓以外をクリックしたときに検索窓の選択状態を解除
  document.addEventListener('click', (e) => {
    if (e.target !== searchBox && e.target !== mobileSearchBox && !e.target.closest('.clear-button')) {
      if (document.activeElement === searchBox) {
        searchBox.blur();
      }
      if (document.activeElement === mobileSearchBox) {
        mobileSearchBox.blur();
      }
    }
  });

  resetFontSize(); // 初期化時にも実行

  // PCかどうかを判別
  const isPC = !/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isPC) {
    document.addEventListener('mousedown', (e) => {
      // 入力欄は除外
      if (e.target.tagName !== 'INPUT' && e.button === 0) {
        e.preventDefault();
      }
    });
  }

  // 複製カードにクリック判定を付与
  const cardList = document.getElementById('card-list');

  // フィルターボタンにクリックイベントを追加
  const filterButtons = document.querySelectorAll('.filter-buttons button');
  filterButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const attribute = button.getAttribute('data-filter');
      openModal(attribute);
    });
  });

  // モーダルボタンにクリックイベントを追加
  const modalButtons = document.querySelectorAll('.filter-group button');
  modalButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const match = button.getAttribute('onclick').match(/openModal\('(.+?)'\)/);
      if (match) {
        const filterId = match[1];
        openModal(filterId);
      }
    });
  });

  // 画像モーダルのイベントリスナーを追加
  const imageModal = document.getElementById('image-modal');
  imageModal.addEventListener('click', function (event) {
    if (event.target === imageModal) {
      closeImageModal();
    }
  });

  const prevButton = document.getElementById('prev-image');
  const nextButton = document.getElementById('next-image');

  prevButton.addEventListener('click', (e) => {
    e.stopPropagation();
    showPreviousImage();
  });

  nextButton.addEventListener('click', (e) => {
    e.stopPropagation();
    showNextImage();
  });

  // スワイプ操作のサポート（オプション）
  let touchStartX = 0;
  const modalImage = document.getElementById('modal-image');

  modalImage.addEventListener(
    'touchstart',
    (e) => {
      touchStartX = e.touches[0].clientX;
    },
    { passive: true }
  );

  modalImage.addEventListener(
    'touchend',
    (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const diff = touchStartX - touchEndX;

      if (Math.abs(diff) > 50) {
        // 50pxのスワイプで判定
        if (diff > 0) {
          showNextImage();
        } else {
          showPreviousImage();
        }
      }
    },
    { passive: true }
  );

  // 遅延読み込みの処理
  const options = {
    root: null,
    rootMargin: '1200px', // 画面外400pxの位置から読み込み開始
    threshold: 0.1
  };

  const loadImage = (img) => {
    const src = img.getAttribute('data-src');
    if (src && img.src !== src && !img.classList.contains('loaded')) {
      img.src = src;
      img.onload = () => {
        img.style.opacity = '1';
        img.classList.add('loaded');
      };
      img.removeAttribute('data-src');
    }
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        loadImage(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, options);

  // クリーンアップ イベントでタブのアクティブ状態を監視
  document.addEventListener('visibilitychange', () => {
    // タブがアクティブになった時
    if (document.visibilityState === 'visible') {
      // モーダルが開いていない時だけリセット
      if (document.getElementById('image-modal').style.display !== 'flex') {
        if (observer) {
          observer.disconnect();
          setupLazyLoading();
        }
      }
    } else if (document.visibilityState === 'hidden') {
      // タブが非アクティブになった時、メモリを節約
      if (seriesInfoCache.size > 100) {
        seriesInfoCache.clear();
      }
    }
  });

  const preloadNextImages = (currentIndex, count = 5) => {
    const images = document.querySelectorAll('.card img:not(.loaded)');
    for (let i = currentIndex + 1; i < currentIndex + 1 + count && i < images.length; i++) {
      loadImage(images[i]);
    }
  };

  const setupLazyLoading = () => {
    const images = document.querySelectorAll('.card img:not(.loaded)');
    images.forEach((img, index) => {
      if (!img.classList.contains('loaded')) {
        img.style.opacity = '0';
        observer.observe(img);
      }
    });
  };

  // 初期表示の画像数を制限
  const loadInitialImages = () => {
    const images = document.querySelectorAll('.card img:not(.loaded)');
    images.forEach((img, index) => {
      if (index < 20) {
        // 最初の20枚
        loadImage(img);
        if (index === 19) {
          preloadNextImages(index);
        }
      }
    });
  };

  // スクロールイベントの処理
  let lastScrollTop = 0;
  let scrollTimeout;
  window.addEventListener(
    'scroll',
    () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const st = window.pageYOffset || document.documentElement.scrollTop;
        if (st > lastScrollTop) {
          // 下スクロール時
          const visibleImages = document.querySelectorAll('.card img.loaded');
          if (visibleImages.length > 0) {
            const lastVisibleImage = visibleImages[visibleImages.length - 1];
            const index = Array.from(document.querySelectorAll('.card img')).indexOf(lastVisibleImage);
            preloadNextImages(index);
          }
        }
        lastScrollTop = st <= 0 ? 0 : st;
        loadVisibleImages();
      }, 100);
    },
    false
  );

  // ページロード完了後に遅延読み込みをセットアップ
  window.addEventListener('load', () => {
    loadInitialImages();
    setupLazyLoading();
  });

  // フィルターや並び替え後に再セットアップ
  const resetLazyLoading = () => {
    observer.disconnect();
    setupLazyLoading();
    // loadVisibleImages(); ソートやフィルター後に表示領域内の画像を即時読み込み
  };

  document.querySelectorAll('.filter-buttons button, .sort-buttons button').forEach((button) => {
    button.addEventListener('click', () => {
      setTimeout(() => {
        resetLazyLoading();
        // loadVisibleImages(); ボタンクリック後に表示領域内の画像を即時読み込み
      }, 100);
    });
  });

  // PC用ヘッダーメニュー
  const menuItem = document.querySelector('.menu-item');
  const menuTrigger = menuItem.querySelector('.menu-trigger');
  const submenu = menuItem.querySelector('.submenu');

  const showSubmenu = () => {
    if (window.innerWidth >= 769) {
      submenu.style.display = 'block';
    }
  };

  const hideSubmenu = () => {
    submenu.style.display = 'none';
  };

  if (window.innerWidth >= 769) {
    menuTrigger.addEventListener('mouseenter', showSubmenu);
    menuItem.addEventListener('mouseleave', hideSubmenu);
  }

  // ウィンドウサイズが変更された場合の処理
  window.addEventListener('resize', () => {
    deckBuilder.resizeDisplay();
    if (window.innerWidth >= 769) {
      menuTrigger.addEventListener('mouseenter', showSubmenu);
      menuItem.addEventListener('mouseleave', hideSubmenu);
    } else {
      menuTrigger.removeEventListener('mouseenter', showSubmenu);
      menuItem.removeEventListener('mouseleave', hideSubmenu);
      hideSubmenu();
    }
  });

  // イベントリスナーの設定
  // ローカルストレージからデッキを読み込む
  deckBuilder.loadFromLocalStorage();

  // モーダル背景クリックで閉じる処理を追加
  document.getElementById('deck-modal').addEventListener('mousedown', (e) => {
    if (e.target.className === 'deck-modal active') {
      deckBuilder.close();
    }
  });

  // PCのデッキボタンのイベントリスナー
  const deckButton = document.getElementById('deckButton');
  if (deckButton) {
    deckButton.addEventListener('click', openDeckBuilder);
  }

  const deckBackButton = document.getElementById('deck-back-button');
  if (deckBackButton) {
    deckBackButton.addEventListener('click', () => {
      deckBuilder.close();
    });
  }

  // スマホのヘッダーアイコンにもデッキ枚数表示を追加
  const headerIcon = document.querySelector('.header-icon');
  if (headerIcon) {
    const badge = document.createElement('span');
    badge.className = 'deck-count-badge';
    headerIcon.parentElement.style.position = 'relative';
    headerIcon.parentElement.appendChild(badge);
  }

  // デッキ一覧のクリックイベント
  document.getElementById('card-list').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;

    if (e.target.closest('.card-buttons')) {
      // ボタンクリックの場合はその処理を実行
      return;
    } else {
      // カードクリックは画像表示のみ
      e.preventDefault();
      e.stopPropagation();
      const img = card.querySelector('img');
      openImageModal(img.src);
    }
  });

  // デッキ画面でのカードクリックイベント
  const deckDisplay = document.getElementById('deck-display');
  if (deckDisplay) {
    // カードの生成関数
    const createDeckCard = (card) => {
      const cardElement = document.createElement('div');
      cardElement.className = 'deck-card';
      cardElement.setAttribute('data-name', card.dataset.name);
      cardElement.setAttribute('data-type', card.dataset.type);
      cardElement.setAttribute('data-season', card.dataset.season);
      cardElement.setAttribute('data-cost', card.dataset.cost);
      cardElement.setAttribute('data-number', card.dataset.number);

      const img = document.createElement('img');
      img.src = card.querySelector('img').src;
      img.alt = card.dataset.name;

      // ボタングループを追加
      const buttons = document.createElement('div');
      buttons.className = 'card-buttons';

      const addButton = document.createElement('button');
      addButton.className = 'card-add-button';
      addButton.onclick = (e) => {
        e.stopPropagation(); // カードのクリックイベントを停止
        deckBuilder.addCard(card.cloneNode(true));
      };

      const removeButton = document.createElement('button');
      removeButton.className = 'card-remove-button';
      removeButton.onclick = (e) => {
        e.stopPropagation(); // カードのクリックイベントを停止
        deckBuilder.removeCard(null, card.dataset.number);
      };

      buttons.appendChild(addButton);
      buttons.appendChild(removeButton);

      cardElement.appendChild(img);
      cardElement.appendChild(buttons);

      // カードクリックで画像表示
      cardElement.onclick = (e) => {
        // ボタンクリック以外の場合のみ画像表示
        if (!e.target.closest('.card-buttons')) {
          const deckCards = Array.from(deckDisplay.querySelectorAll('.deck-card'));
          currentImageIndex = deckCards.indexOf(cardElement);
          visibleCards = deckCards;
          openDeckImageModal(img.src);
        }
      };

      return cardElement;
    };

    deckDisplay.addEventListener(
      'touchstart',
      (e) => {
        const card = e.target.closest('.deck-card');
        if (!card) return;

        isDragging = true;
        currentCard = card;
        startY = e.touches[0].clientY;

        // カードを掴んだ状態を表現
        currentCard.style.transition = 'opacity 0.2s';
        currentCard.style.opacity = '0.8';

        // スクロール禁止
        document.body.style.overflow = 'hidden';
      },
      { passive: false }
    );

    deckDisplay.addEventListener(
      'touchmove',
      (e) => {
        if (!isDragging || !currentCard) return;

        const currentY = e.touches[0].clientY;
        const diff = startY - currentY;

        // 移動距離に応じて透明度を変更
        const opacity = Math.max(0.5, Math.min(0.2, 1 - Math.abs(diff) / 200));
        currentCard.style.opacity = opacity.toString();

        // カードを少し移動させる
        currentCard.style.transform = `translateY(${-diff / 2}px)`;

        e.preventDefault(); // スクロール防止
      },
      { passive: false }
    );

    deckDisplay.addEventListener('touchend', (e) => {
      if (!isDragging || !currentCard) return;

      const endY = e.changedTouches[0].clientY;
      const diff = startY - endY;

      // スタイルをリセット
      currentCard.style.transition = 'all 0.3s';
      currentCard.style.opacity = '1';
      currentCard.style.transform = '';

      // 50px以上の移動で判定
      if (Math.abs(diff) > 30) {
        if (diff > 0) {
          // 上スワイプでカード追加（フェードエフェクト付き）
          const cardData = currentCard.cloneNode(true);
          deckBuilder.addCard(cardData);
        } else {
          // 下スワイプでカード削除
          const cardNumber = currentCard.getAttribute('data-number');
          if (cardNumber) {
            deckBuilder.removeCard(null, cardNumber);
          }
        }
      }

      // 状態をリセット
      isDragging = false;
      currentCard = null;
      document.body.style.overflow = '';
    });

    // タッチがキャンセルされた場合の処理
    deckDisplay.addEventListener('touchcancel', () => {
      if (currentCard) {
        currentCard.style.transition = 'all 0.3s';
        currentCard.style.opacity = '1';
        currentCard.style.transform = '';
      }
      isDragging = false;
      currentCard = null;
      document.body.style.overflow = '';
    });
  }

  // 零探しボタン
  const zeroCheckButton = document.getElementById('zero-check');
  if (zeroCheckButton) {
    zeroCheckButton.addEventListener('click', performZeroSearch);
  }

  // リセットボタン
  const resetButton = document.getElementById('deck-reset');
  if (resetButton) {
    resetButton.addEventListener('click', confirmReset);
  }

  // デッキ画面を閉じる
  document.getElementById('back-to-gallery').addEventListener('click', () => {
    deckBuilder.close();
  });

  // 既存のカードにボタンを追加
  const cards = document.querySelectorAll('.card');
  cards.forEach(addCardButtons);

  // ヘルプボタンの機能を追加
  const helpButton = document.querySelector('.deck-help-button');
  const helpPopup = document.querySelector('.deck-help-popup');
  const helpOverlay = document.querySelector('.deck-help-overlay');

  if (helpButton && helpPopup && helpOverlay) {
    const showHelp = () => {
      helpPopup.style.display = 'block';
      helpOverlay.style.display = 'block';
    };

    const hideHelp = () => {
      helpPopup.style.display = 'none';
      helpOverlay.style.display = 'none';
    };

    helpButton.addEventListener('click', (e) => {
      e.stopPropagation();
      showHelp();
    });

    // ポップアップ以外をクリックで閉じる
    document.addEventListener('click', (e) => {
      if (helpPopup.style.display === 'block' && !helpPopup.contains(e.target) && e.target !== helpButton) {
        hideHelp();
      }
    });

    // ESCキーでも閉じられるように
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && helpPopup.style.display === 'block') {
        hideHelp();
      }
    });
  }

  // ツールチップのイベントを設定
  document.querySelectorAll('[data-tooltip]').forEach((element) => {
    element.addEventListener('mouseenter', (e) => {
      const text = e.target.getAttribute('data-tooltip');
      showTooltip(e.target, text);
    });

    element.addEventListener('mouseleave', () => {
      hideTooltip();
    });

    // スマホ用長押し
    let longPressTimer;
    element.addEventListener('touchstart', (e) => {
      longPressTimer = setTimeout(() => {
        const text = e.target.getAttribute('data-tooltip');
        showTooltip(e.target, text);
      }, 500);
    });

    element.addEventListener('touchend', () => {
      clearTimeout(longPressTimer);
      hideTooltip();
    });
  });

  const captureButton = document.getElementById('deck-capture');
  if (captureButton) {
    captureButton.addEventListener('click', captureDeck);
  }

  // デッキモーダルの背景クリックで閉じる機能
  const deckModal = document.getElementById('deck-modal');
  if (deckModal) {
    deckModal.addEventListener('click', (e) => {
      // クリックされた要素がモーダルコンテンツ自体である場合のみ閉じる
      if (e.target.classList.contains('deck-modal-content')) {
        deckBuilder.close();
      }
    });
  }

  // 初期表示時にカード数を更新
  updateCardCount();
});

// 以下の関数は変更なし
function clearSearch(inputId, buttonId) {
  const input = document.getElementById(inputId);
  input.value = '';
  filterCardsByName({ target: input });
  const button = document.getElementById(buttonId);
  button.style.display = 'none';
}

const filterCardsByName = (event) => {
  const query = event.target.value.toLowerCase();
  const cards = document.querySelectorAll('.card');

  cards.forEach((card) => {
    // フィルター条件に合致するかどうかを確認
    const matchesFilters = checkFilters(card);

    if (query === '') {
      // 検索欄が空の場合は、フィルター条件のみで表示/非表示を決定
      card.style.display = matchesFilters ? 'block' : 'none';
    } else {
      // 検索文字列がある場合は、フィルター条件に加えて検索条件も確認
      const name = card.dataset.name.toLowerCase();
      const attribute = card.dataset.attribute ? card.dataset.attribute.toLowerCase() : '';
      const matchesSearch = name.includes(query) || attribute.includes(query);

      // フィルター条件と検索条件の両方に合致する場合のみ表示
      card.style.display = matchesFilters && matchesSearch ? 'block' : 'none';
    }
  });

  // 検索結果が0件の場合のメッセージ表示
  const anyVisible = Array.from(cards).some((card) => card.style.display !== 'none');
  document.getElementById('no-cards-message').style.display = anyVisible ? 'none' : 'block';

  // カード数を更新
  updateCardCount();
};

// フィルター条件のチェック関数
const checkFilters = (card) => {
  // 各フィルター条件をチェック
  const checks = {
    series: () => filters.series.size === 0 || filters.series.has(card.dataset.series),
    season: () => filters.season.size === 0 || filters.season.has(card.dataset.season),
    type: () => filters.type.size === 0 || filters.type.has(card.dataset.type),
    role: () => {
      if (filters.role.size === 0) return true;
      const cardRoles = card.dataset.role.split(' ');
      return [...filters.role].some((role) => cardRoles.includes(role));
    },
    keyword: () => filters.keyword.size === 0 || filters.keyword.has(card.dataset.keyword),
    attribute: () => {
      if (filters.attribute.size === 0) return true;
      const cardAttributes = card.dataset.attribute.split(' ');
      return [...filters.attribute].some((attr) => cardAttributes.includes(attr));
    },
    rare: () => filters.rare.size === 0 || filters.rare.has(card.dataset.rare)
  };

  // すべての条件を満たす場合のみtrue
  return Object.values(checks).every((check) => check());
};

const sortCards = (criteria) => {
  // 既存のソート状態をクリア（seasonは除く）
  if (criteria !== 'season') {
    if (sortCriteria !== criteria) {
      sortCriteria = criteria;
      // No.と力の場合は初期値をdescに
      if (criteria === 'number' || criteria === 'power' || criteria === 'cost') {
        sortOrder = 'desc';
      } else {
        sortOrder = 'asc';
      }
    } else {
      // 同じボタンを押した場合は順序を反転
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    }
  }

  const cardList = document.getElementById('card-list');
  const cards = Array.from(document.querySelectorAll('.card'));

  cards.sort((a, b) => {
    if (criteria === 'type') {
      const typeOrder = ['場所札', '怪異札', '道具札', '季節札'];
      const aType = a.dataset.type;
      const bType = b.dataset.type;
      const aIndex = typeOrder.indexOf(aType);
      const bIndex = typeOrder.indexOf(bType);
      return sortOrder === 'asc' ? aIndex - bIndex : bIndex - aIndex;
    } else {
      const aValue = parseInt(a.dataset[criteria]) || 0;
      const bValue = parseInt(b.dataset[criteria]) || 0;
      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    }
  });

  cards.forEach((card) => cardList.appendChild(card));
  loadVisibleImages();
  updateSortButtonsState(criteria);
  saveFiltersToLocalStorage();
};

const updateSortButtonsState = (activeCriteria) => {
  const sortButtons = document.querySelectorAll('.sort-buttons button');
  sortButtons.forEach((button) => {
    const buttonCriteria = button.getAttribute('data-filter');
    if (buttonCriteria === activeCriteria) {
      button.classList.add('active');
      button.classList.toggle('desc', sortOrder === 'desc');
    } else {
      button.classList.remove('active', 'desc');
    }
  });
};

// スムーズスクロール用の関数を最初に定義
const smoothScrollToTop = (duration = 500) => {
  const startPosition = window.pageYOffset;
  const startTime = performance.now();

  const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

  const animation = (currentTime) => {
    const elapsedTime = currentTime - startTime;
    const progress = Math.min(elapsedTime / duration, 1);

    window.scrollTo(0, startPosition * (1 - easeInOutQuad(progress)));

    if (progress < 1) {
      requestAnimationFrame(animation);
    }
  };

  requestAnimationFrame(animation);
};

// TOPボタンのクリックハンドラ
window.scrollToTop = () => {
  smoothScrollToTop();
};

// resetFilters関数
const resetFilters = () => {
  // 既存のフィルターリセット処理
  Object.keys(filters).forEach((key) => filters[key].clear());
  document.querySelectorAll('.card[data-cloned]').forEach((clonedCard) => clonedCard.remove());
  const originalCards = document.querySelectorAll('.card:not([data-cloned])');
  originalCards.forEach((card) => {
    card.style.display = 'block';
  });

  document.getElementById('no-cards-message').style.display = 'none';
  resetSort();
  updateActiveFilters();
  resetSortButtonsState();

  // ソート状態のリセット
  window.seasonSortOrder = null;
  sortCriteria = null;
  sortOrder = 'asc';

  // ローカルストレージのクリア
  localStorage.removeItem('cardFilters');
  localStorage.removeItem('sortState');

  // ボタンの状態をリセット
  const seasonSortButton = document.querySelector('.sort-buttons button[data-filter="season"]');
  if (seasonSortButton) {
    seasonSortButton.classList.remove('active', 'desc');
  }
  updateSortButtonsState(null);

  // 検索欄のリセット処理を追加
  const searchBox = document.getElementById('search-box');
  const mobileSearchBox = document.getElementById('mobile-search-box');

  // input イベントを発火させて検索欄をクリア
  if (searchBox) {
    searchBox.value = '';
    searchBox.dispatchEvent(new Event('input'));
  }
  if (mobileSearchBox) {
    mobileSearchBox.value = '';
    mobileSearchBox.dispatchEvent(new Event('input'));
  }

  // カスタムスムーズスクロールを実行
  smoothScrollToTop();

  // カード数を更新
  updateCardCount();
};

// キーボードイベントリスナーを更新
document.addEventListener('keydown', function (event) {
  // ESCキーが押され、モーダルが開いていない場合にフィルターをリセットしてトップにスクロール
  if (event.key === 'Escape' && document.getElementById('modal').style.display !== 'block' && document.getElementById('image-modal').style.display !== 'flex') {
    resetFilters();
  }

  // ↑キーが押された場合、ページトップにスクロール
  if (event.key === 'ArrowUp' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    event.preventDefault();
    smoothScrollToTop();
  }
});

const resetSort = () => {
  sortCriteria = null;
  sortOrder = 'asc';
  const cardList = document.getElementById('card-list');
  const cards = Array.from(document.querySelectorAll('.card'));
  cards.sort((a, b) => {
    const aValue = parseInt(a.dataset.number);
    const bValue = parseInt(b.dataset.number);
    return aValue - bValue;
  });
  cards.forEach((card) => cardList.appendChild(card));
};

const resetSortButtonsState = () => {
  const sortButtons = document.querySelectorAll('.sort-buttons button');
  sortButtons.forEach((button) => {
    button.classList.remove('active', 'desc');
  });
};

const toggleFilterCard = (attribute, value) => {
  if (!attribute || !filters[attribute]) {
    console.error(`Attribute "${attribute}" not found in filters.`);
    return;
  }
  if (filters[attribute].has(value)) {
    filters[attribute].delete(value);
  } else {
    filters[attribute].add(value);
  }
  filterCards();
  updateActiveFilters();
  saveFiltersToLocalStorage();

  // モーダルを確実に閉じる
  closeModal();
};

const filterCards = () => {
  const cards = document.querySelectorAll('.card');
  let anyVisible = false;
  const cardList = document.getElementById('card-list');
  const activeFilters = new Set(Object.values(filters).flatMap((set) => Array.from(set)));
  const has廃Filter = filters.attribute.has('廃');

  // 複製カードの削除
  document.querySelectorAll('.card[data-cloned]').forEach((clonedCard) => clonedCard.remove());

  cards.forEach((card) => {
    if (card.hasAttribute('data-cloned')) return; // 複製カードはスキップ

    let shouldDisplay = true;
    for (const [attribute, values] of Object.entries(filters)) {
      if (values.size > 0) {
        const cardAttribute = card.getAttribute(`data-${attribute}`);
        const cardAttributes = cardAttribute ? cardAttribute.split(' ') : [];
        
        let matches = false;
        
        
        // 「廃」フィルターの特別処理
        if (attribute === 'attribute' && has廃Filter) {
          // 「廃」フィルターがある場合は、属性に「廃」を含むカードを表示
          const has廃InAttributes = cardAttributes.some(attr => attr.includes('廃'));
          
          // 他の属性フィルターもチェック
          const otherAttributeFilters = [...values].filter(v => v !== '廃');
          const matchesOtherFilters = otherAttributeFilters.length === 0 || 
                                    cardAttributes.some(attr => otherAttributeFilters.includes(attr));
          
          // 「廃」を含むか、他の属性フィルターに一致する場合
          if (otherAttributeFilters.length === 0) {
            // 「廃」だけが選択されている場合、「廃」を含む属性を持つカードだけを表示
            matches = has廃InAttributes;
          } else {
            // 「廃」と他の属性が選択されている場合、「廃」を含む属性があるか、他の選択された属性に一致するカードを表示
            matches = has廃InAttributes || matchesOtherFilters;
          }
        } else {
          // 通常の完全一致フィルター
          matches = values.has(cardAttribute) || cardAttributes.some((attr) => values.has(attr));
        }
        
        if (!matches) {
          shouldDisplay = false;
          break;
        }
      }
    }

    if (shouldDisplay) {
      anyVisible = true;
      card.style.display = 'block';

      const doubleFor = card.getAttribute('data-double-for');
      if (doubleFor) {
        const doubleFilters = doubleFor.split(',');
        const shouldDouble = doubleFilters.some((filter) => activeFilters.has(filter));

        if (shouldDouble) {
          const clone = card.cloneNode(true);
          clone.setAttribute('data-cloned', 'true');
          // クローンの画像に対して即時読み込みを設定
          const cloneImg = clone.querySelector('img');
          if (cloneImg) {
            cloneImg.src = cloneImg.getAttribute('data-src') || cloneImg.src;
            cloneImg.removeAttribute('data-src');
            cloneImg.classList.add('loaded');
            cloneImg.style.opacity = '1';
          }
          cardList.insertBefore(clone, card.nextSibling);
        }
      }
    } else {
      card.style.display = 'none';
    }
  });  

  document.getElementById('no-cards-message').style.display = anyVisible ? 'none' : 'block';

  // カード数を更新
  updateCardCount();
};

// スクロールバーの幅を取得するヘルパー関数
const getScrollbarWidth = () => {
  const outer = document.createElement('div');
  outer.style.visibility = 'hidden';
  outer.style.overflow = 'scroll';
  outer.style.msOverflowStyle = 'scrollbar';
  document.body.appendChild(outer);

  const inner = document.createElement('div');
  outer.appendChild(inner);

  const scrollbarWidth = outer.offsetWidth - inner.offsetWidth;
  outer.parentNode.removeChild(outer);

  return scrollbarWidth;
};

const openModal = (filterId) => {
  const modal = document.getElementById('modal');
  const modalButtons = document.getElementById('modal-buttons');
  modalButtons.innerHTML = '';

  // ツールチップ要素の追加を確認
  if (!document.querySelector('.tooltip')) {
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    document.body.appendChild(tooltip);
  }

  // ツールチップ関連の関数をここで定義
  const showTooltip = (target, text) => {
    const tooltip = document.querySelector('.tooltip');
    if (!tooltip) return;

    tooltip.textContent = text;
    tooltip.style.animation = 'none'; // アニメーションをリセット
    tooltip.offsetHeight;
    tooltip.style.animation = 'fadeOut 1.4s forwards'; // マウスオーバーで説明を表示する秒数

    const rect = target.getBoundingClientRect();
    tooltip.style.left = `${rect.left + rect.width / 2 - tooltip.offsetWidth / 2}px`;
    tooltip.style.top = `${rect.top - tooltip.offsetHeight - 10}px`;
  };

  const hideTooltip = () => {
    const tooltip = document.querySelector('.tooltip');
    if (!tooltip) return;
    tooltip.style.opacity = '0';
  };

  const filterElement = document.getElementById(filterId);
  if (!filterElement) {
    console.error(`Element with id ${filterId} not found`);
    return;
  }

  const filterContent = filterElement.querySelectorAll('button');
  filterContent.forEach((button) => {
    const newButton = document.createElement('button');
    newButton.innerText = button.innerText;
    newButton.className = button.className;
    // ツールチップ用の属性を追加
    if (button.hasAttribute('data-tooltip')) {
      newButton.setAttribute('data-tooltip', button.getAttribute('data-tooltip'));

      // PCの場合のみツールチップを有効化
      if (window.innerWidth > 768) {
        newButton.addEventListener('mouseenter', (e) => {
          const text = e.target.getAttribute('data-tooltip');
          showTooltip(e.target, text);
        });

        newButton.addEventListener('mouseleave', () => {
          hideTooltip();
        });
      }
    }

    newButton.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      // 「廃」ボタンの場合は特別処理
      if (filterId === 'attribute' && button.innerText.trim() === '「廃」') {
        toggleFilterCard(filterId, '廃');
      } else {
        toggleFilterCard(filterId, button.innerText.trim());
      }
    };
    modalButtons.appendChild(newButton);
  });

  scrollPosition = window.pageYOffset;
  const scrollbarWidth = getScrollbarWidth();

  modal.style.display = 'block';
  document.body.style.paddingRight = `${scrollbarWidth}px`;
  document.body.classList.add('modal-open');

  const headerContent = document.querySelector('.header-content');
  if (headerContent) {
    headerContent.style.paddingRight = `${scrollbarWidth}px`;
  }
};

const closeModal = () => {
  const modal = document.getElementById('modal');
  modal.style.display = 'none';
  document.body.classList.remove('modal-open');
  window.scrollTo(0, scrollPosition);
  document.body.style.top = '';
  document.body.style.paddingRight = '';
  document.body.style.overflow = '';

  const headerContent = document.querySelector('.header-content');
  headerContent.style.paddingRight = '';

  // フィルターが適用されていない場合のみ、カードの表示をリセット
  if (Object.values(filters).every((filter) => filter.size === 0)) {
    document.getElementById('no-cards-message').style.display = 'none';
    // ソート状態を維持したまま、カードの表示をリセット
    filterCards();
  }
};

const closeModalOnClick = (event) => {
  if (event.target.id === 'modal') {
    closeModal();
  }
};
let savedScrollPosition = 0;

// 現在の画像のインデックスを追跡
let currentImageIndex = 0;
let visibleCards = [];

// 収録情報のキャッシュ
const seriesInfoCache = new Map();

// 収録情報を効率的に取得する関数
function getSeriesInfo(cardName) {
  // キャッシュにある場合はそれを返す
  if (seriesInfoCache.has(cardName)) {
    return seriesInfoCache.get(cardName);
  }
  
  // キャッシュにない場合のみ検索
  const allCardsWithSameName = document.querySelectorAll(`[data-name="${cardName}"]`);
  const allSeriesSet = new Set();
  
  allCardsWithSameName.forEach(card => {
    if (card.dataset.series) {
      const seriesList = card.dataset.series.split(' ');
      seriesList.forEach(series => allSeriesSet.add(series));
    }
  });
  
  const seriesText = allSeriesSet.size > 0 ? `収録：${Array.from(allSeriesSet).join('、')}` : '';
  
  // キャッシュに保存
  seriesInfoCache.set(cardName, seriesText);
  return seriesText;
}

// 画像モーダル内のボタン制御
const updateModalControls = (cardName, controls) => {
  const currentCount = deckBuilder.deck.filter((card) => card.dataset.name === cardName).length;
  const addButton = controls.querySelector('#add-card');
  const removeButton = controls.querySelector('#remove-card');
  const countDisplay = controls.querySelector('.card-count');

  // カウント表示を更新
  countDisplay.textContent = `${currentCount}/4`;

  // ボタンの有効/無効を更新
  addButton.disabled = currentCount >= 4;
  removeButton.disabled = currentCount <= 0;

  return currentCount;
};

const openImageModal = (src) => {
  // 現在のスクロール位置を保存
  savedScrollPosition = window.pageYOffset || document.documentElement.scrollTop;

  const modal = document.getElementById('image-modal');
  const modalImage = document.getElementById('modal-image');
  const prevButton = document.getElementById('prev-image');
  const nextButton = document.getElementById('next-image');

  // デッキモーダルが表示中かどうかを確認
  const isDeckModalVisible = document.getElementById('deck-modal').style.display === 'block';

  // 現在の表示状態に応じてカードリストを取得（軽量化版）
  visibleCards = isDeckModalVisible
    ? Array.from(document.querySelectorAll('.deck-card')) // デッキ内のカード
    : Array.from(document.querySelectorAll('.card')).filter((card) => 
        card.style.display !== 'none' && !card.classList.contains('hidden')
      ); // getComputedStyleを避けた軽量版

  // クリックされた画像のインデックスを取得
  currentImageIndex = visibleCards.findIndex((card) => {
    const cardImg = card.querySelector('img');
    return cardImg && (cardImg.src === src || cardImg.getAttribute('data-src') === src);
  });

  if (currentImageIndex === -1) return;

  const currentCard = visibleCards[currentImageIndex];
  const cardName = currentCard.dataset.name;

  // カウント情報の取得と表示
  let currentCount = deckBuilder.deck.filter((card) => card.dataset.name === cardName).length;

  // カードの上限枚数を取得
  let maxAllowed = 4;
  if (deckBuilder.infiniteCardLimit.has(cardName)) {
    maxAllowed = Infinity;
  } else if (deckBuilder.tenCardLimit.has(cardName)) {
    maxAllowed = 10;
  } else if (deckBuilder.sevenCardLimit.has(cardName)) {
    maxAllowed = 7;
  }

  // コントロール要素の更新
  let controls = modal.querySelector('.card-controls');
  if (!controls) {
    controls = document.createElement('div');
    controls.className = 'card-controls';
    modal.querySelector('.modal-content').appendChild(controls);
  }

  const displayMax = maxAllowed === Infinity ? '∞' : maxAllowed;

  controls.innerHTML = `
    <button class="card-control-button" id="remove-card" ${currentCount <= 0 ? 'disabled' : ''}>−</button>
    <div class="card-count">${currentCount}/${displayMax}</div>
    <button class="card-control-button" id="add-card" ${currentCount >= maxAllowed ? 'disabled' : ''}>＋</button>
  `;

  // 画像の表示処理
  // 画像とコントロールをコンテナでラップ
  const container = document.createElement('div');
  container.className = 'image-container';

  // 収録情報を表示する要素を作成
  const seriesInfo = document.createElement('div');
  seriesInfo.className = 'card-series-info';
  
  // 効率的に収録情報を取得
  const currentCardName = currentCard.dataset.name;
  const seriesText = getSeriesInfo(currentCardName);
  if (seriesText) {
    seriesInfo.textContent = seriesText;
  }

  // 画像の表示処理
  modalImage.style.opacity = '0';
  modalImage.src = src;

  // コンテナに要素を追加（上から順に：収録情報、画像、コントロール）
  container.appendChild(seriesInfo);
  container.appendChild(modalImage);

  // 既存のコントロールを更新
  controls.innerHTML = `
    <button class="card-control-button" id="remove-card" ${currentCount <= 0 ? 'disabled' : ''}>−</button>
    <div class="card-count">${currentCount}/${displayMax}</div>
    <button class="card-control-button" id="add-card" ${currentCount >= maxAllowed ? 'disabled' : ''}>＋</button>
  `;

  container.appendChild(controls);

  // モーダルのコンテンツに追加
  const modalContent = modal.querySelector('.modal-content');
  modalContent.innerHTML = ''; // 既存のコンテンツをクリア
  modalContent.appendChild(container);

  // 既存のナビゲーションボタンを再利用
  modalContent.appendChild(prevButton);
  modalContent.appendChild(nextButton);

  // 🔥 iOS原因特定：重い関数を段階的に無効化
  // setupModalCardControls(controls, currentCard, cardName);
  // updateCardCountInModal(cardName);

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedScrollPosition}px`; // 保存した位置を使用
  document.body.style.width = '100%';

  // フェードイン効果とナビゲーションの表示を調整
  requestAnimationFrame(() => {
    modalImage.style.transition = 'opacity 0.3s ease';
    modalImage.style.opacity = '1';

    // 🔥 iOS原因特定：画像ロード後の重い処理を無効化
    // modalImage.onload = () => {
    //   updateNavigationButtons();
    //   preloadAdjacentImages();
    // };

    // if (modalImage.complete) {
    //   updateNavigationButtons();
    //   preloadAdjacentImages();
    // }
  });
};

// 画像モーダルを閉じる関数
const closeImageModal = () => {
  const prevButton = document.getElementById('prev-image');
  const nextButton = document.getElementById('next-image');
  const modal = document.getElementById('image-modal');
  const deckModal = document.getElementById('deck-modal');

  prevButton.classList.remove('visible');
  nextButton.classList.remove('visible');

  modal.style.display = 'none';

  // デッキ作成画面が開いているかチェック
  if (deckModal && deckModal.style.display === 'block') {
    // デッキ作成画面が開いている場合はスクロール禁止を維持
    document.body.style.overflow = 'hidden';
  } else {
    // デッキ作成画面が開いていない場合は通常通りスクロール可能に
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, savedScrollPosition);
  }

  setTimeout(() => {
    handleScroll();
  }, 100);

  const controls = document.querySelector('.card-controls');
  if (controls) {
    controls.remove();
  }
  
  // メモリリークを防ぐため、必要に応じてキャッシュをクリア
  if (seriesInfoCache.size > 500) {
    seriesInfoCache.clear();
  }
};

const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// handleScroll 関数を更新
const handleScroll = () => {
  const topButton = document.getElementById('topButton');
  const imageModal = document.getElementById('image-modal');
  if (window.pageYOffset > 300 && imageModal.style.display !== 'flex') {
    topButton.style.display = 'flex';
    topButton.classList.add('show');
  } else {
    topButton.style.display = 'none';
    topButton.classList.remove('show');
  }
};

window.addEventListener('scroll', handleScroll);

// ページ読み込み時にも実行
document.addEventListener('DOMContentLoaded', handleScroll);

// ハンバーガーメニュー関連
document.addEventListener('DOMContentLoaded', function () {
  const hamburgerMenu = document.querySelector('.hamburger-menu');
  const mobileNav = document.querySelector('.mobile-nav');
  const menuOverlay = document.querySelector('.menu-overlay');
  const closeMenuButton = document.querySelector('.close-menu');

  // タッチデバイスでのズームを防止
  document.addEventListener('touchstart', preventZoom, { passive: false });

  // 画像モーダルのイベントリスナーを追加
  const imageModal = document.getElementById('image-modal');
  imageModal.addEventListener('click', function (event) {
    // 画像モーダル内のどの要素をクリックしても閉じるようにする
    // ただし、×アイコンはポインターイベントを無効にしているので影響しない
    closeImageModal();
  });

  // DOMContentLoaded イベントリスナー内の toggleMenu 関数
  function toggleMenu() {
    hamburgerMenu.classList.toggle('active');
    mobileNav.classList.toggle('active');
    menuOverlay.classList.toggle('active');

    if (mobileNav.classList.contains('active')) {
      // 現在のスクロール位置を保存
      const scrollPosition = window.pageYOffset;
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollPosition}px`;
      document.body.style.touchAction = 'none';
    } else {
      // スクロール位置を復元
      const scrollPosition = Math.abs(parseInt(document.body.style.top || '0'));
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      document.body.style.touchAction = '';
      window.scrollTo(0, scrollPosition);
    }

    resetFontSize();
  }

  hamburgerMenu.addEventListener('click', toggleMenu);
  menuOverlay.addEventListener('click', toggleMenu);

  if (closeMenuButton) {
    closeMenuButton.addEventListener('click', function (e) {
      e.preventDefault();
      toggleMenu();
    });
  }

  window.addEventListener('resize', function () {
    if (window.innerWidth > 768) {
      hamburgerMenu.classList.remove('active');
      mobileNav.classList.remove('active');
      menuOverlay.classList.remove('active');
      document.body.classList.remove('no-scroll');
    }
  });

  // ESCキーでフィルター解除
  document.addEventListener('keydown', function (event) {
    // ESCキーが押され、モーダルが開いていない場合にフィルターをリセット
    if (event.key === 'Escape' && document.getElementById('modal').style.display !== 'block' && document.getElementById('image-modal').style.display !== 'flex') {
      resetFilters();
    }
  });

  deckManager.initialize();
});

// ズームを防止する関数
function preventZoom(e) {
  if (e.touches.length > 1) {
    e.preventDefault();
    return; // マルチタッチの場合はここで終了
  }

  var t2 = e.timeStamp;
  var t1 = e.target.dataset && e.target.dataset.lastTouch ? e.target.dataset.lastTouch : 0;
  var dt = t2 - t1;
  var fingers = e.touches.length;

  if (!dt || dt > 500 || fingers > 1) return; // 長押しやマルチタッチは無視

  e.preventDefault();
  e.target.click();

  // 最後のタッチ時間を更新
  if (e.target.dataset) {
    e.target.dataset.lastTouch = t2;
  }
}

document.querySelectorAll('.card-image-container').forEach((container) => {
  container.addEventListener('mouseover', () => {
    if (!container.querySelector('.card-image-hover')) {
      const img = container.querySelector('img');
      const hoverImg = img.cloneNode(true);
      hoverImg.classList.add('card-image-hover');
      container.appendChild(hoverImg);
    }
  });
});

// フィルターの該当表示

function updateActiveFilters() {
  const activeFilters = [];
  for (const [key, values] of Object.entries(filters)) {
    if (values.size > 0) {
      values.forEach((value) => {
        activeFilters.push({ key, value });
      });
    }
  }

  const filterDisplay = activeFilters.map((filter) => `<button class="filter-item" onclick="removeFilter('${filter.key}', '${filter.value}')">${filter.value}</button>`).join('');

  const pcElement = document.getElementById('active-filters-pc');
  const mobileElement = document.getElementById('active-filters-mobile');

  function setDisplayBasedOnScreenSize() {
    const isMobile = window.innerWidth <= 768;
    if (activeFilters.length > 0) {
      pcElement.innerHTML = filterDisplay;
      mobileElement.innerHTML = filterDisplay;
      pcElement.style.display = isMobile ? 'none' : 'flex';
      mobileElement.style.display = isMobile ? 'flex' : 'none';
    } else {
      pcElement.style.display = 'none';
      mobileElement.style.display = 'none';
    }
  }

  setDisplayBasedOnScreenSize();

  window.addEventListener('resize', setDisplayBasedOnScreenSize);
}

function removeFilter(key, value) {
  if (filters[key]) {
    filters[key].delete(value);
    filterCards();
    updateActiveFilters();
    // フィルター削除時にもローカルストレージを更新
    saveFiltersToLocalStorage();
  }
}

document.addEventListener('DOMContentLoaded', updateActiveFilters);

const loadVisibleImages = () => {
  const images = document.querySelectorAll('.card img:not(.loaded)');
  const viewportHeight = window.innerHeight;

  images.forEach((img) => {
    const rect = img.getBoundingClientRect();
    if (rect.top >= 0 && rect.top <= viewportHeight) {
      const src = img.getAttribute('data-src');
      if (src && img.src !== src) {
        img.src = src;
        img.onload = () => {
          img.style.opacity = '1';
          img.classList.add('loaded');
        };
        img.removeAttribute('data-src');
      }
    }
  });
};

// 並び「季節」の実装
const seasonOrder = ['春', '夏', '秋', '冬', '無', '混化'];

const sortCardsBySeason = () => {
  // 季節ボタンがクリックされたら、sortCriteriaを'season'に設定
  sortCriteria = 'season';

  // 順序を反転
  if (window.seasonSortOrder === 'asc') {
    window.seasonSortOrder = 'desc';
  } else {
    window.seasonSortOrder = 'asc';
  }

  const cardList = document.getElementById('card-list');
  const cards = Array.from(document.querySelectorAll('.card'));

  // 以下のソートロジックは同じ
  cards.sort((a, b) => {
    const aSeasons = a.dataset.season.split(' ');
    const bSeasons = b.dataset.season.split(' ');

    const aHasMixed = aSeasons.includes('混化');
    const bHasMixed = bSeasons.includes('混化');

    if (aHasMixed && bHasMixed) {
      return 0;
    } else if (aHasMixed) {
      return window.seasonSortOrder === 'asc' ? 1 : -1;
    } else if (bHasMixed) {
      return window.seasonSortOrder === 'asc' ? -1 : 1;
    } else {
      const aSeasonIndex = seasonOrder.indexOf(aSeasons[0]);
      const bSeasonIndex = seasonOrder.indexOf(bSeasons[0]);
      return window.seasonSortOrder === 'asc' ? aSeasonIndex - bSeasonIndex : bSeasonIndex - aSeasonIndex;
    }
  });

  cards.forEach((card) => cardList.appendChild(card));
  loadVisibleImages();
  updateSeasonSortButtonState();
  saveFiltersToLocalStorage();
};

const updateSeasonSortButtonState = () => {
  const seasonSortButton = document.querySelector('.sort-buttons button[data-filter="season"]');
  seasonSortButton.classList.toggle('active', true); // 常にアクティブ
  seasonSortButton.classList.toggle('desc', window.seasonSortOrder === 'desc');
};

// フィルター条件をローカルストレージに保存する関数（キャッシュ機能）
const saveFiltersToLocalStorage = () => {
  const filtersToSave = {};
  for (const [key, value] of Object.entries(filters)) {
    filtersToSave[key] = Array.from(value);
  }

  // 現在のソート状態を保存
  const sortState = {
    seasonSortOrder: window.seasonSortOrder,
    sortCriteria: sortCriteria,
    sortOrder: sortOrder
  };

  localStorage.setItem('cardFilters', JSON.stringify(filtersToSave));
  localStorage.setItem('sortState', JSON.stringify(sortState));
};

// ローカルストレージからフィルター条件を読み込む関数
const loadFiltersFromLocalStorage = () => {
  // 保存されたデータを一度に読み込み
  const savedFilters = JSON.parse(localStorage.getItem('cardFilters'));
  const savedSortState = JSON.parse(localStorage.getItem('sortState'));

  // フィルターの適用
  if (savedFilters) {
    for (const [key, value] of Object.entries(savedFilters)) {
      filters[key] = new Set(value);
    }
  }

  // ソート状態の復元
  if (savedSortState) {
    window.seasonSortOrder = savedSortState.seasonSortOrder;
    sortCriteria = savedSortState.sortCriteria;
    sortOrder = savedSortState.sortOrder;

    // DOMの更新を一度にまとめる
    requestAnimationFrame(() => {
      const cardList = document.getElementById('card-list');
      const cards = Array.from(document.querySelectorAll('.card'));

      if (sortCriteria === 'season') {
        // 季節ソートの場合
        cards.sort((a, b) => {
          const aSeasons = a.dataset.season.split(' ');
          const bSeasons = b.dataset.season.split(' ');
          const aHasMixed = aSeasons.includes('混化');
          const bHasMixed = bSeasons.includes('混化');

          if (aHasMixed && bHasMixed) {
            return 0;
          } else if (aHasMixed) {
            return window.seasonSortOrder === 'asc' ? 1 : -1;
          } else if (bHasMixed) {
            return window.seasonSortOrder === 'asc' ? -1 : 1;
          } else {
            const aSeasonIndex = seasonOrder.indexOf(aSeasons[0]);
            const bSeasonIndex = seasonOrder.indexOf(bSeasons[0]);
            return window.seasonSortOrder === 'asc' ? aSeasonIndex - bSeasonIndex : bSeasonIndex - aSeasonIndex;
          }
        });

        // 季節ボタンの状態を更新
        const seasonSortButton = document.querySelector('.sort-buttons button[data-filter="season"]');
        if (seasonSortButton) {
          seasonSortButton.classList.add('active');
          seasonSortButton.classList.toggle('desc', window.seasonSortOrder === 'desc');
        }
      } else if (sortCriteria) {
        // 通常のソートの場合
        if (sortCriteria === 'type') {
          const typeOrder = ['場所札', '怪異札', '道具札', '季節札'];
          cards.sort((a, b) => {
            const aType = a.dataset.type;
            const bType = b.dataset.type;
            const aIndex = typeOrder.indexOf(aType);
            const bIndex = typeOrder.indexOf(bType);
            return sortOrder === 'asc' ? aIndex - bIndex : bIndex - aIndex;
          });
        } else {
          cards.sort((a, b) => {
            const aValue = parseInt(a.dataset[sortCriteria]) || 0;
            const bValue = parseInt(b.dataset[sortCriteria]) || 0;
            return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
          });
        }

        // ソートボタンの状態を更新
        const sortButton = document.querySelector(`.sort-buttons button[data-filter="${sortCriteria}"]`);
        if (sortButton) {
          sortButton.classList.add('active');
          sortButton.classList.toggle('desc', sortOrder === 'desc');
        }
      }

      // パフォーマンス改善: DocumentFragment を使用
      const fragment = document.createDocumentFragment();
      cards.forEach((card) => fragment.appendChild(card));
      cardList.appendChild(fragment);

      // フィルターとアクティブ表示の更新
      filterCards();
      updateActiveFilters();
    });
  } else {
    // ソート状態がない場合は単純にフィルターを適用
    filterCards();
    updateActiveFilters();
  }
};

// 画像のプリロード関数を追加
const preloadModalImage = (targetImg) => {
  if (targetImg && targetImg.hasAttribute('data-src')) {
    const src = targetImg.getAttribute('data-src');
    targetImg.src = src;
    targetImg.removeAttribute('data-src');
    targetImg.classList.add('loaded');
    targetImg.style.opacity = '1';
  }
};

// 周辺画像のプリロード
const preloadAdjacentImages = () => {
  // 前の画像をプリロード
  if (currentImageIndex > 0) {
    const prevCard = visibleCards[currentImageIndex - 1];
    preloadModalImage(prevCard.querySelector('img'));
  }

  // 次の画像をプリロード
  if (currentImageIndex < visibleCards.length - 1) {
    const nextCard = visibleCards[currentImageIndex + 1];
    preloadModalImage(nextCard.querySelector('img'));
  }
};

// showNextImage関数
const showNextImage = () => {
  if (currentImageIndex >= visibleCards.length - 1) return;

  const currentCard = visibleCards[currentImageIndex];
  let nextIndex = currentImageIndex + 1;

  // 次のカードが透明カードまたは同じカードの場合はスキップ
  while (nextIndex < visibleCards.length && (visibleCards[nextIndex].hasAttribute('data-empty') || visibleCards[nextIndex].dataset.name === currentCard.dataset.name)) {
    nextIndex++;
  }

  // 次のカードが有効なカードの場合のみ切り替え
  if (nextIndex < visibleCards.length && !visibleCards[nextIndex].hasAttribute('data-empty')) {
    currentImageIndex = nextIndex;
    const nextCard = visibleCards[nextIndex];
    const img = nextCard.querySelector('img');
    const src = img.getAttribute('data-src') || img.src;

    const modalImage = document.getElementById('modal-image');
    modalImage.src = src;

    const cardName = nextCard.dataset.name;
    const controls = document.querySelector('.card-controls');
    if (controls) {
      setupModalCardControls(controls, nextCard, cardName);
      updateCardCountInModal(cardName);
    }

    // 収録情報を更新
    const seriesInfo = document.querySelector('.card-series-info');
    if (seriesInfo) {
      const nextCardName = nextCard.dataset.name;
      const seriesText = getSeriesInfo(nextCardName);
      if (seriesText) {
        seriesInfo.textContent = seriesText;
      }
    }

    updateNavigationButtons();
    preloadAdjacentImages();
  }
};

// showPreviousImage関数
const showPreviousImage = () => {
  if (currentImageIndex <= 0) return;

  const currentCard = visibleCards[currentImageIndex];
  let prevIndex = currentImageIndex - 1;

  // 前のカードが透明カードまたは同じカードの場合はスキップ
  while (prevIndex >= 0 && (visibleCards[prevIndex].hasAttribute('data-empty') || visibleCards[prevIndex].dataset.name === currentCard.dataset.name)) {
    prevIndex--;
  }

  // 前のカードが有効なカードの場合のみ切り替え
  if (prevIndex >= 0 && !visibleCards[prevIndex].hasAttribute('data-empty')) {
    currentImageIndex = prevIndex;
    const prevCard = visibleCards[prevIndex];
    const img = prevCard.querySelector('img');
    const src = img.getAttribute('data-src') || img.src;

    const modalImage = document.getElementById('modal-image');
    modalImage.src = src;

    const cardName = prevCard.dataset.name;
    const controls = document.querySelector('.card-controls');
    if (controls) {
      setupModalCardControls(controls, prevCard, cardName);
      updateCardCountInModal(cardName);
    }

    // 収録情報を更新
    const seriesInfo = document.querySelector('.card-series-info');
    if (seriesInfo) {
      const prevCardName = prevCard.dataset.name;
      const seriesText = getSeriesInfo(prevCardName);
      if (seriesText) {
        seriesInfo.textContent = seriesText;
      }
    }

    updateNavigationButtons();
    preloadAdjacentImages();
  }
};

// ページ読み込み時にローカルストレージからフィルター条件を読み込む
document.addEventListener('DOMContentLoaded', loadFiltersFromLocalStorage);

// デッキの状態をローカルストレージに保存
const saveDeckState = () => {
  localStorage.setItem('deckState', JSON.stringify(deckState));
};

// ローカルストレージからデッキの状態を読み込み
const loadDeckState = () => {
  const saved = localStorage.getItem('deckState');
  if (saved) {
    Object.assign(deckState, JSON.parse(saved));
  }
};

// デッキビルダーを開く関数
function openDeckBuilder() {
  const scrollPosition = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || window.scrollY || 0;

  const modal = document.getElementById('deck-modal');
  modal.style.display = 'block';
  document.body.style.overflow = 'hidden';

  // フェードイン
  requestAnimationFrame(() => {
    modal.classList.add('active');
    deckBuilder.savedScrollPosition = scrollPosition;
    deckBuilder.resizeDisplay(); // サイズを調整
  });
}

// デッキビルダーの状態管理
const deckBuilder = {
  deck: [],
  maxCards: 4,
  restrictedCards: new Set(['人魚の活き血（にんぎょのいきち）']),
  twoCardLimit: new Set(['肥川の大蛇（ひのかわのおろち）', '悠習の古日記（ゆうしゅうのこにっき）', "本物のお化け屋敷（ほんもののおばけやしき）", "消さなきゃ（けさなきゃ）"]),
  sevenCardLimit: new Set(['山口：7つの家（やまぐち：ななつのいえ）']), // 7枚制限カード
  tenCardLimit: new Set(['火の玉（ひのたま）']), // 10枚制限カード
  infiniteCardLimit: new Set(['複製体(くろーん クローン)']), // 無限枚数制限カード
  savedScrollPosition: 0, // スクロール位置保存用の変数

  // デッキビルダーのopen/close関数
  open() {
    const modal = document.getElementById('deck-modal');
    modal.style.display = 'block';

    // スクロール位置を保存
    this.savedScrollPosition = window.pageYOffset || document.documentElement.scrollTop;

    // body要素の固定
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = `-${this.savedScrollPosition}px`;

    // フェードイン
    requestAnimationFrame(() => {
      modal.classList.add('active');
      this.resizeDisplay();
    });
  },

  close() {
    const modal = document.getElementById('deck-modal');
    modal.classList.remove('active');

    // スクロール位置を復元
    const scrollPosition = this.savedScrollPosition;

    // body要素のスタイルを解除
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';

    // スマホの場合の追加処理を解除
    if (window.innerWidth <= 768) {
      document.documentElement.style.overflow = '';
      document.documentElement.style.position = '';
      document.documentElement.style.height = '';
    }

    // スクロール位置を復元
    window.scrollTo(0, scrollPosition);

    setTimeout(() => {
      modal.style.display = 'none';
      updateCardCountBadges();
    }, 300);
  },

  showLimitMessage() {
    const message = document.createElement('div');
    message.className = 'deck-limit-message';
    message.textContent = '制限カードはデッキに1枚まで。';
    document.body.appendChild(message);
    setTimeout(() => message.remove(), 2000);
  },

  showTwoCardMessage() {
    const message = document.createElement('div');
    message.className = 'deck-limit-message';
    message.textContent = '準制限カードはデッキに2枚まで。';
    document.body.appendChild(message);
    setTimeout(() => message.remove(), 2000);
  },

  showTenCardMessage() {
    const message = document.createElement('div');
    message.className = 'deck-limit-message';
    message.textContent = 'このカードはデッキに10枚まで。';
    document.body.appendChild(message);
    setTimeout(() => message.remove(), 2000);
  },

  showSevenCardMessage() {
    const message = document.createElement('div');
    message.className = 'deck-limit-message';
    message.textContent = 'このカードはデッキに7枚まで。';
    document.body.appendChild(message);
    setTimeout(() => message.remove(), 2000);
  },

  // カードを追加
  addCard(card) {
    const cardName = card.dataset.name;
    const sameNameCount = this.deck.filter((c) => c.dataset.name === cardName).length;

    if (this.infiniteCardLimit.has(cardName)) {
      // 無限枚数制限カードは制限なし
    } else if (this.tenCardLimit.has(cardName)) {
      if (sameNameCount >= 10) {
        this.showTenCardMessage();
        return false;
      }
    } else if (this.sevenCardLimit.has(cardName)) {
      if (sameNameCount >= 7) {
        this.showSevenCardMessage('このカードはデッキに7枚まで。');
        return false;
      }
    } else if (this.restrictedCards.has(cardName) && sameNameCount >= 1) {
      this.showLimitMessage();
      return false;
    } else if (this.twoCardLimit.has(cardName) && sameNameCount >= 2) {
      // 追加：2枚制限カードのチェック
      this.showTwoCardMessage(); // 追加：2枚制限メッセージの表示
      return false;
    } else if (sameNameCount >= this.maxCards) {
      this.showMessage('同じカードはデッキに4枚まで。');
      return false;
    }

    // カードを追加
    this.deck.push(card);
    this.updateDisplay();
    this.updateDeckCount();

    // 現在のデッキを自動保存
    deckManager.saveDeck(deckManager.currentDeckId);
    return true;
  },

  // カードを削除（番号のみで識別）
  removeCard(cardName, cardNumber) {
    const index = this.deck.findIndex((card) => card.dataset.number === cardNumber);

    if (index !== -1) {
      this.deck.splice(index, 1);
      this.updateDisplay();
      this.updateDeckCount();

      // 現在のデッキを自動保存
      deckManager.saveDeck(deckManager.currentDeckId);
    }
  },

  // デッキビルダーのupdateDisplay関数を更新
  updateDisplay() {
    const display = document.getElementById('deck-display');
    if (!display) return;

    // アニメーション中のちらつきを防ぐ
    display.style.willChange = 'contents';

    // 既存の内容をクリア
    display.innerHTML = '';

    // 実カードをソートして配置
    const sortedDeck = this.sortDeck([...this.deck]);
    const totalCards = 40;
    const currentCards = sortedDeck.length;
    const emptySlots = currentCards <= 40 ? totalCards - currentCards : 0;

    // まず実カードを配置
    sortedDeck.forEach((card) => {
      const cardElement = this.createDeckCard(card);
      display.appendChild(cardElement);
    });

    // 40枚以下の場合、残りのスロットに透明カードを配置
    if (currentCards <= 40) {
      for (let i = 0; i < emptySlots; i++) {
        const emptyCard = document.createElement('div');
        emptyCard.className = 'deck-card';
        emptyCard.setAttribute('data-empty', 'true');

        const img = document.createElement('img');
        img.src =
          'data:image/svg+xml,' +
          encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 745 1041">
    <rect width="745" height="1041" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" stroke-width="2" rx="8" />
  </svg>
`);
        img.alt = 'Empty Card Slot';

        emptyCard.appendChild(img);
        display.appendChild(emptyCard);
      }
      display.classList.add('fixed-grid');
    } else {
      display.classList.remove('fixed-grid');
    }

    this.resizeDisplay();
    this.updateDeckCount();
    updateCardCountBadges();

    // デッキカウンターをボタン化
    const deckCounter = document.querySelector('.deck-counter');
    if (deckCounter) {
      deckCounter.classList.add('deck-counter-button');
      deckCounter.onclick = () => this.showDistributionModal();
    }
  },

  // createDeckCard関数
  createDeckCard(card) {
    const cardElement = document.createElement('div');
    cardElement.className = 'deck-card';

    // データ属性を設定
    Object.keys(card.dataset).forEach((key) => {
      cardElement.dataset[key] = card.dataset[key];
    });

    // 画像要素の作成
    const img = document.createElement('img');
    img.src = card.querySelector('img').src;
    img.alt = card.dataset.name;
    img.classList.add('card-image');

    // ボタングループの作成
    const buttons = document.createElement('div');
    buttons.className = 'card-buttons';

    const addButton = document.createElement('button');
    addButton.className = 'card-add-button';
    addButton.onclick = (e) => {
      e.stopPropagation();
      this.addCard(card.cloneNode(true));
    };

    const removeButton = document.createElement('button');
    removeButton.className = 'card-remove-button';
    removeButton.onclick = (e) => {
      e.stopPropagation();
      this.removeCard(null, card.dataset.number);
    };

    buttons.appendChild(addButton);
    buttons.appendChild(removeButton);

    // 要素を組み立て
    cardElement.appendChild(img);
    cardElement.appendChild(buttons);

    // クリックイベントの設定（画像表示用）
    cardElement.onclick = (e) => {
      if (!e.target.closest('.card-buttons')) {
        const deckDisplay = document.getElementById('deck-display');
        if (!deckDisplay) return;
        const deckCards = Array.from(deckDisplay.querySelectorAll('.deck-card:not([data-empty="true"])'));
        currentImageIndex = deckCards.indexOf(cardElement);
        visibleCards = deckCards;
        openImageModal(img.src);
      }
    };

    return cardElement;
  },

  // resizeDisplayメソッド
  resizeDisplay() {
    const display = document.getElementById('deck-display');
    if (!display) return;

    const deckMenu = document.querySelector('.deck-menu');
    const menuHeight = deckMenu ? deckMenu.offsetHeight : 0;
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;
    const maxHeight = windowHeight - menuHeight - 20;

    const cards = display.getElementsByClassName('deck-card');
    if (cards.length === 0) return;

    const isFixedGrid = display.classList.contains('fixed-grid');
    const isMobile = windowWidth <= 768;
    const isLandscape = windowWidth > windowHeight;

    // グリッドの列数を決定
    const cols = isMobile ? (isLandscape ? 8 : 5) : 8;
    // 必要な行数を計算
    const rows = isFixedGrid ? (isMobile ? (isLandscape ? 5 : 8) : 5) : Math.ceil(cards.length / cols);

    const aspectRatio = 1041 / 745;

    // 利用可能な最大幅と高さから、カードの最大サイズを計算
    const maxCardWidth = (windowWidth * 0.95 - (cols - 1)) / cols;
    const maxCardHeight = (maxHeight - (rows - 1)) / rows;

    // アスペクト比を維持しながら、画面に収まる最大サイズを計算
    let cardWidth = Math.min(maxCardWidth, maxCardHeight / aspectRatio);
    let cardHeight = cardWidth * aspectRatio;

    // グリッド全体の幅を計算（カード幅 × 列数 + 隙間）
    const totalWidth = cardWidth * cols + (cols - 1);

    // スタイルを適用
    display.style.width = `${totalWidth}px`;
    display.style.height = `${cardHeight * rows + (rows - 1)}px`;
    display.style.justifyContent = 'center';
    display.style.alignContent = 'center';

    // 各カードにサイズを適用
    Array.from(cards).forEach((card) => {
      card.style.width = `${cardWidth}px`;
      card.style.height = `${cardHeight}px`;
    });
  },

  // デッキをソート
  // sortDeck関数
  sortDeck(cards) {
    // cardsが配列でない場合や空の場合のチェック
    if (!Array.isArray(cards) || cards.length === 0) {
      return [];
    }

    const typeOrder = ['場所札', '怪異札', '道具札', '季節札'];
    const seasonOrder = ['春', '夏', '秋', '冬', '無', '混化'];

    // カードを名前でグループ化する前に、有効なデータのチェック
    const cardGroups = cards.reduce((groups, card) => {
      if (card && card.dataset && card.dataset.name) {
        const name = card.dataset.name;
        if (!groups[name]) {
          groups[name] = [];
        }
        groups[name].push(card);
      }
      return groups;
    }, {});

    return Object.values(cardGroups)
      .flat()
      .sort((a, b) => {
        // まず札種類でソート
        const typeA = typeOrder.indexOf(a.dataset.type);
        const typeB = typeOrder.indexOf(b.dataset.type);
        if (typeA !== typeB) return typeA - typeB;

        // 次にコストでソート
        const costCompare = (parseInt(a.dataset.cost) || 0) - (parseInt(b.dataset.cost) || 0);
        if (costCompare !== 0) return costCompare;

        // 次に季節でソート
        const seasonA = seasonOrder.indexOf(a.dataset.season);
        const seasonB = seasonOrder.indexOf(b.dataset.season);
        if (seasonA !== seasonB) return seasonA - seasonB;

        // 最後にカード名でソート
        return a.dataset.name.localeCompare(b.dataset.name);
      });
  },

  // デッキ枚数表示を更新
  updateDeckCount() {
    const deckCounter = document.querySelector('.deck-counter');
    if (deckCounter) {
      deckCounter.textContent = `${this.deck.length}枚`;
      // 39枚以下の場合、warningクラスを追加
      if (this.deck.length <= 39) {
        deckCounter.classList.add('warning');
      } else {
        deckCounter.classList.remove('warning');
      }

      // ここでもクリックイベントを設定（念のため）
      deckCounter.classList.add('deck-counter-button');
      deckCounter.onclick = () => this.showDistributionModal();
    }

    const deckButton = document.getElementById('deckButton');
    const headerIconBadge = document.querySelector('.deck-count-badge');

    if (this.deck.length > 0) {
      if (deckButton) {
        deckButton.setAttribute('data-count', this.deck.length);
      }
      if (headerIconBadge) {
        headerIconBadge.textContent = this.deck.length;
        headerIconBadge.style.display = 'block';
      }
    } else {
      if (deckButton) {
        deckButton.removeAttribute('data-count');
      }
      if (headerIconBadge) {
        headerIconBadge.style.display = 'none';
      }
    }
  },

  // メッセージを表示
  showMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'deck-message';
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    setTimeout(() => {
      messageDiv.remove();
    }, 2000);
  },

  // ローカルストレージに保存
  saveToLocalStorage() {
    const deckData = this.deck.map((card) => ({
      name: card.dataset.name,
      type: card.dataset.type,
      season: card.dataset.season,
      cost: card.dataset.cost,
      number: card.dataset.number,
      src: card.querySelector('img').src
    }));
    localStorage.setItem('kannagi-deck', JSON.stringify(deckData));
  },

  // ローカルストレージから読み込み
  // deckBuilder オブジェクト内の loadFromLocalStorage メソッド
  loadFromLocalStorage() {
    const saved = localStorage.getItem('kannagi-deck');
    if (saved) {
      try {
        const deckData = JSON.parse(saved);
        this.deck = deckData
          .map((data) => {
            // カード一覧から対応するカードを探す
            const originalCard = document.querySelector(`.card[data-number="${data.number}"]`);
            if (originalCard) {
              const card = document.createElement('div');
              card.className = 'card';

              // データ属性を設定
              Object.assign(card.dataset, {
                name: data.name,
                type: data.type,
                season: data.season,
                cost: data.cost,
                number: data.number
              });

              // 画像要素を作成
              const img = document.createElement('img');
              const originalImg = originalCard.querySelector('img');
              img.src = originalImg.getAttribute('data-src') || originalImg.src;
              img.alt = data.name;

              // 画像のロード完了時の処理
              img.onload = () => {
                img.style.opacity = '1';
                img.classList.add('loaded');
              };

              card.appendChild(img);
              return card;
            }
            return null;
          })
          .filter((card) => card !== null); // nullを除外

        this.updateDisplay();
        this.updateDeckCount();
      } catch (e) {
        console.error('デッキデータの読み込みに失敗しました:', e);
        this.deck = [];
        this.updateDisplay();
        this.updateDeckCount();
      }
    }
  },

  // カード分布モーダルを表示する関数
  showDistributionModal() {
    // モーダル表示時にスクロール禁止
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed'; // より確実なスクロール禁止
    document.body.style.width = '100%';

    const modal = document.createElement('div');
    modal.className = 'distribution-modal';

    const content = document.createElement('div');
    content.className = 'distribution-content';

    // コスト分布エリア
    const costContent = this.createCostDistribution();
    content.appendChild(costContent);

    // 中段のコンテナを作成
    const middleSection = document.createElement('div');
    middleSection.className = 'middle-section';

    // 季節分布（中段左）
    const seasonContainer = document.createElement('div');
    seasonContainer.className = 'season-distribution';
    const seasonTitle = document.createElement('div');
    seasonTitle.className = 'area-title';
    seasonTitle.textContent = '季節';
    seasonContainer.appendChild(seasonTitle);
    const seasonContent = this.createSeasonDistribution();
    seasonContainer.appendChild(seasonContent);
    middleSection.appendChild(seasonContainer);

    // 札種類分布（中段右）
    const typeContainer = document.createElement('div');
    typeContainer.className = 'type-distribution';
    const typeTitle = document.createElement('div');
    typeTitle.className = 'area-title';
    typeTitle.textContent = '種類';
    typeContainer.appendChild(typeTitle);
    const typeContent = this.createTypeDistribution();
    typeContainer.appendChild(typeContent);
    middleSection.appendChild(typeContainer);

    content.appendChild(middleSection);

    // 属性分布（下段）
    const attributeContainer = document.createElement('div');
    attributeContainer.className = 'attribute-distribution';
    const attributeTitle = document.createElement('div');
    attributeTitle.className = 'area-title';
    attributeTitle.textContent = '主な属性';
    attributeContainer.appendChild(attributeTitle);
    const attributeContent = this.createAttributeDistribution();
    attributeContainer.appendChild(attributeContent);
    content.appendChild(attributeContainer);

    // 閉じるボタン
    const closeButton = document.createElement('button');
    closeButton.className = 'distribution-close';
    closeButton.innerHTML = '×';
    closeButton.onclick = (e) => {
      e.stopPropagation();
      closeModal();
    };
    content.appendChild(closeButton);

    modal.appendChild(content);
    document.body.appendChild(modal);

    requestAnimationFrame(() => {
      modal.classList.add('active');
    });

    // モーダルを閉じる処理
    const closeModal = () => {
      modal.classList.remove('active');
      setTimeout(() => {
        modal.remove();
        // スクロール禁止を解除
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
      }, 300);
    };

    // ×ボタンのクリックイベント
    closeButton.onclick = (e) => {
      e.stopPropagation();
      closeModal();
    };

    // モーダル外クリックイベント
    modal.onclick = (e) => {
      if (e.target === modal) {
        closeModal();
      }
    };
  },

  // コスト分布グラフの作成
  createCostDistribution() {
    const costContainer = document.createElement('div');
    costContainer.className = 'cost-distribution';

    // コストごとの枚数をカウント
    const costCounts = new Array(11).fill(0);
    this.deck.forEach((card) => {
      const cost = parseInt(card.dataset.cost);
      if (cost >= 10) {
        costCounts[10]++;
      } else {
        costCounts[cost]++;
      }
    });

    // 最大枚数を取得
    const maxCount = Math.max(...costCounts);

    // グラフの作成
    const graphContainer = document.createElement('div');
    graphContainer.className = 'cost-graph-container';

    // 背景バーの高さを計算（グラフ領域の最大高さ）
    const graphHeight = 100; // 100%

    costCounts.forEach((count, index) => {
      const barWrapper = document.createElement('div');
      barWrapper.className = 'cost-bar-wrapper';

      // 背景バーを追加
      const background = document.createElement('div');
      background.className = 'cost-bar-background';
      background.style.height = `${graphHeight}%`;
      barWrapper.appendChild(background);

      const bar = document.createElement('div');
      bar.className = 'cost-bar';

      const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
      bar.style.height = `${height}%`;
      bar.setAttribute('data-count', count);

      // 枚数表示を追加
      const countDisplay = document.createElement('div');
      countDisplay.className = 'cost-bar-count';
      countDisplay.textContent = count > 0 ? count : '';
      bar.appendChild(countDisplay);

      const label = document.createElement('div');
      label.className = 'cost-label';
      label.setAttribute('data-cost', index === 10 ? '10↑' : index);

      barWrapper.appendChild(bar);
      barWrapper.appendChild(label);

      graphContainer.appendChild(barWrapper);
    });

    costContainer.appendChild(graphContainer);
    return costContainer;
  },

  // 季節分布の作成
  createSeasonDistribution() {
    const seasonContent = document.createElement('div');
    seasonContent.className = 'season-content';

    // 季節ごとの枚数をカウント
    const seasonCounts = {};
    const seasonOrder = ['春', '夏', '秋', '冬', '無', '混化'];

    this.deck.forEach((card) => {
      const seasons = card.dataset.season.split(' ');
      seasons.forEach((season) => {
        seasonCounts[season] = (seasonCounts[season] || 0) + 1;
      });
    });

    // 季節の表示
    const seasonRows = document.createElement('div');
    seasonRows.className = 'season-rows';

    seasonOrder.forEach((season) => {
      if (seasonCounts[season]) {
        const seasonText = document.createElement('div');
        seasonText.className = 'season-text';
        seasonText.setAttribute('data-name', season);
        seasonText.setAttribute('data-count', `：${seasonCounts[season]}枚`);
        seasonRows.appendChild(seasonText);
      }
    });

    seasonContent.appendChild(seasonRows);
    return seasonContent;
  },

  // 札種類分布の作成
  createTypeDistribution() {
    const typeContent = document.createElement('div');
    typeContent.className = 'type-content';

    // 札種類ごとの枚数をカウント
    const typeCounts = {};
    const typeOrder = ['場所札', '怪異札', '道具札', '季節札'];

    this.deck.forEach((card) => {
      const type = card.dataset.type;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    // 札種類の表示
    const typeRows = document.createElement('div');
    typeRows.className = 'type-rows';

    typeOrder.forEach((type) => {
      if (typeCounts[type]) {
        const typeText = document.createElement('div');
        typeText.className = 'type-text';
        typeText.setAttribute('data-name', type);
        typeText.setAttribute('data-count', `：${typeCounts[type]}枚`);
        typeRows.appendChild(typeText);
      }
    });

    typeContent.appendChild(typeRows);
    return typeContent;
  },

  // 属性分布の作成
  createAttributeDistribution() {
    const attributeContent = document.createElement('div');
    attributeContent.className = 'attribute-content';

    // 属性ごとの枚数をカウント
    const attributeCounts = {};
    this.deck.forEach((card) => {
      if (card.dataset.attribute) {
        const attributes = card.dataset.attribute.split(' ');
        attributes.forEach((attr) => {
          attributeCounts[attr] = (attributeCounts[attr] || 0) + 1;
        });
      }
    });

    // 属性を枚数順にソート
    const sortedAttributes = Object.entries(attributeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5); // 上位5つのみを取得

    // 属性の表示
    const attributeRows = document.createElement('div');
    attributeRows.className = 'attribute-rows';

    sortedAttributes.forEach(([attribute, count]) => {
      const attributeText = document.createElement('div');
      attributeText.className = 'attribute-text';
      attributeText.setAttribute('data-name', attribute);
      attributeText.setAttribute('data-count', `：${count}枚`);
      attributeRows.appendChild(attributeText);
    });

    attributeContent.appendChild(attributeRows);
    return attributeContent;
  }
};

// モーダル表示処理を分離
function showDeckModal(scrollPosition) {
  const modal = document.getElementById('deck-modal');
  modal.style.display = 'block';
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => {
    modal.classList.add('active');
    deckBuilder.savedScrollPosition = scrollPosition;
    deckBuilder.resizeDisplay();
  });
}

// カード一覧の枚数表示を更新する関数
function updateCardCountBadges() {
  const cardList = document.getElementById('card-list');
  if (!cardList) return;

  const cards = cardList.querySelectorAll('.card');

  // 各カードの枚数バッジを一旦クリア
  cards.forEach((card) => {
    const existingBadge = card.querySelector('.card-count-badge');
    if (existingBadge) {
      existingBadge.remove();
    }
  });

  // デッキ内の各カードの枚数をカウント
  const cardCounts = (deckBuilder.deck || []).reduce((counts, card) => {
    if (card && card.dataset && card.dataset.name) {
      const name = card.dataset.name;
      counts[name] = (counts[name] || 0) + 1;
    }
    return counts;
  }, {});

  // カード一覧の各カードに枚数バッジを追加
  cards.forEach((card) => {
    const count = cardCounts[card.dataset.name];
    if (count) {
      const badge = document.createElement('div');
      badge.className = 'card-count-badge';
      badge.textContent = count;
      card.appendChild(badge);
    }
  });
}

// デッキ画面の表示状態を管理する変数
let isDeckModalOpen = false;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Shift' && !e.repeat) {
    // キーリピートを防止
    if (!isDeckModalOpen) {
      openDeckBuilder();
      isDeckModalOpen = true;
    } else {
      deckBuilder.close();
      isDeckModalOpen = false;
    }
  }
});

// 零探し機能
function performZeroSearch() {
  let modal = document.querySelector('.zero-search-modal');
  const typeOrder = ['場所札', '怪異札', '道具札', '季節札'];

  // 選択済みカードと未選択カードを分ける
  function separateCards(deck) {
    // 選択済みカードと未選択カードを分離
    const selectedCards = deck.filter((card) => card.dataset.zeroSelected === 'true');
    const unselectedCards = deck.filter((card) => card.dataset.zeroSelected !== 'true');

    return { selectedCards, unselectedCards };
  }

  // 未選択カードからランダムに必要な枚数を選ぶ
  function getRandomCards(unselectedCards, neededCount) {
    if (unselectedCards.length < neededCount) {
      deckBuilder.showMessage(`デッキ内のカードが8枚ありません。`);
      return unselectedCards;
    }

    const shuffled = [...unselectedCards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, neededCount);
  }

  // カードを分離
  const { selectedCards, unselectedCards } = separateCards(deckBuilder.deck);

  // 選択済みカードと、残りの枠に必要なランダムカードを組み合わせる
  const neededRandomCards = 8 - selectedCards.length;
  const randomCards = getRandomCards(unselectedCards, neededRandomCards);

  // 最終的な表示カード（選択済み + ランダム）
  const displayCards = [...selectedCards, ...randomCards].sort((a, b) => {
    const typeA = typeOrder.indexOf(a.dataset.type);
    const typeB = typeOrder.indexOf(b.dataset.type);
    if (typeA !== typeB) return typeA - typeB;
    return parseInt(a.dataset.cost) - parseInt(b.dataset.cost);
  });

  // 8枚に満たない場合は処理を中止
  if (displayCards.length < 8 && unselectedCards.length + selectedCards.length >= 8) {
    return;
  }

  // モーダル表示処理
  const content = `
      <div class="zero-search-content">
          <div class="zero-search-result">
              ${displayCards
                .map(
                  (card, index) => `
                      <div class="deck-card ${card.dataset.zeroSelected === 'true' ? 'selected' : ''}" 
                           data-number="${card.dataset.number}" 
                           data-name="${card.dataset.name}"
                           data-index="${index}">
                          <img src="${card.querySelector('img').src}" alt="${card.dataset.name}">
                          ${card.dataset.zeroSelected === 'true' ? '<div class="zero-selected-mark"></div>' : ''}
                      </div>
                  `
                )
                .join('')}
          </div>
          <div class="zero-search-buttons">
              <button onclick="performZeroSearch()">リトライ</button>
              <button onclick="closeZeroSearch()">戻る</button>
              <button onclick="resetZeroSelection()">キープ解除</button>
          </div>
      </div>
  `;

  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'zero-search-modal';
    document.body.appendChild(modal);
  }

  modal.innerHTML = content;

  // カードクリックイベントを追加
  const resultCards = modal.querySelectorAll('.zero-search-result .deck-card');
  resultCards.forEach((card) => {
    card.addEventListener('click', function () {
      const index = this.getAttribute('data-index');
      // 表示カードの配列から対応するカードを取得
      const targetCard = displayCards[index];
      if (targetCard) {
        toggleZeroCardSelection(targetCard, this);
      }
    });
  });

  modal.addEventListener('click', (e) => {
    if (e.target.classList.contains('zero-search-modal')) {
      closeZeroSearch();
    }
  });

  document.body.classList.add('modal-open');
  requestAnimationFrame(() => modal.classList.add('active'));
}

// 零探し用のカード選択状態を切り替える関数
function toggleZeroCardSelection(card, cardElement) {
  if (!card) return;

  // 選択状態を切り替え
  const isSelected = card.dataset.zeroSelected === 'true';

  if (isSelected) {
    // 選択解除の場合
    card.dataset.zeroSelected = 'false';

    if (cardElement) {
      cardElement.classList.remove('selected');
      const mark = cardElement.querySelector('.zero-selected-mark');
      if (mark) mark.remove();
    }
  } else {
    // 選択する場合
    card.dataset.zeroSelected = 'true';

    if (cardElement) {
      cardElement.classList.add('selected');
      if (!cardElement.querySelector('.zero-selected-mark')) {
        const mark = document.createElement('div');
        mark.className = 'zero-selected-mark';
        cardElement.appendChild(mark);
      }
    }
  }
}

// 零探しの選択をすべて解除する関数
function resetZeroSelection() {
  deckBuilder.deck.forEach((card) => {
    card.dataset.zeroSelected = 'false';
  });

  // モーダル内のカードの選択状態も更新
  const modalCards = document.querySelectorAll('.zero-search-modal .deck-card');
  modalCards.forEach((card) => {
    card.classList.remove('selected');
    const mark = card.querySelector('.zero-selected-mark');
    if (mark) mark.remove();
  });

  // 選択解除後の再抽選は行わない
  deckBuilder.showMessage('選択をすべて解除しました');
}

// 零探し機能を閉じる関数
function closeZeroSearch() {
  const modal = document.querySelector('.zero-search-modal');
  if (modal) {
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');

    // 選択状態をすべて解除
    deckBuilder.deck.forEach((card) => {
      card.dataset.zeroSelected = 'false';
    });

    setTimeout(() => modal.remove(), 300);
  }
}

// deckBuilder オブジェクトの updateDisplay メソッドを拡張
const originalUpdateDisplay = deckBuilder.updateDisplay;
deckBuilder.updateDisplay = function () {
  // 元のメソッドを呼び出す
  originalUpdateDisplay.call(this);
};

function returnToDeck() {
  deckBuilder.updateDisplay();
  deckBuilder.updateDeckCount();
}

// デッキリセット
function confirmReset() {
  const confirmPopup = document.createElement('div');
  confirmPopup.className = 'confirm-popup';
  confirmPopup.innerHTML = `
    <div class="confirm-content">
      <p>デッキ内容をリセットしますか？</p>
      <div class="confirm-buttons">
        <button onclick="resetDeck(true)">はい</button>
        <button onclick="resetDeck(false)">いいえ</button>
      </div>
    </div>
  `;

  // オーバーレイ部分のクリックで閉じる
  confirmPopup.addEventListener('click', (e) => {
    if (e.target === confirmPopup) {
      resetDeck(false);
    }
  });

  document.body.classList.add('modal-open');
  document.body.appendChild(confirmPopup);
}

function resetDeck(confirmed) {
  const popup = document.querySelector('.confirm-popup');
  if (confirmed) {
    // デッキ内容をリセット
    deckBuilder.deck = [];
    deckBuilder.updateDisplay();

    // デッキ名をデフォルトに戻す
    const currentDeckId = deckManager.currentDeckId;
    const button = document.querySelector(`.deck-select-button[data-deck-id="${currentDeckId}"]`);
    if (button) {
      button.textContent = `デッキ${currentDeckId}`;
      // デッキマネージャーのデータも更新
      if (deckManager.decks[currentDeckId]) {
        deckManager.decks[currentDeckId].name = `デッキ${currentDeckId}`;
      }
    }

    // 変更を保存
    deckManager.saveDeck(deckManager.currentDeckId);
    deckManager.saveToLocalStorage();
  }
  document.body.classList.remove('modal-open');
  popup.remove();
}

// 前後に移動可能かチェックする関数
function canNavigateToPrevious(currentIndex, currentName) {
  // インデックス0の場合でも、前に同名カードがあれば移動可能
  return currentIndex > 0;
}

function canNavigateToNext(currentIndex, currentName) {
  // 最後のインデックスの場合でも、後ろに同名カードがあれば移動可能
  return currentIndex < visibleCards.length - 1;
}

// カード一覧にもボタンを追加（card生成関数の作成）
function createCardWithButtons(card, isInDeck = false) {
  const cardElement = document.createElement('div');
  cardElement.className = isInDeck ? 'deck-card' : 'card';
  // データ属性の設定
  Object.entries(card.dataset).forEach(([key, value]) => {
    cardElement.setAttribute(`data-${key}`, value);
  });

  const img = document.createElement('img');
  img.src = card.querySelector('img').src;
  img.alt = card.dataset.name;

  // ボタングループ
  const buttons = document.createElement('div');
  buttons.className = 'card-buttons';

  const addButton = document.createElement('button');
  addButton.className = 'card-add-button';
  addButton.onclick = (e) => {
    e.stopPropagation();
    deckBuilder.addCard(card.cloneNode(true));
  };

  const removeButton = document.createElement('button');
  removeButton.className = 'card-remove-button';
  removeButton.onclick = (e) => {
    e.stopPropagation();
    deckBuilder.removeCard(null, card.dataset.number);
  };

  buttons.appendChild(addButton);
  buttons.appendChild(removeButton);
  cardElement.appendChild(img);
  cardElement.appendChild(buttons);

  return cardElement;
}

// キーボードの左右に対応
document.addEventListener('keydown', (e) => {
  if (document.getElementById('image-modal').style.display === 'flex') {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      showPreviousImage();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      showNextImage();
    }
  }
});

// キーボードイベントのリスナー
document.addEventListener('keydown', (e) => {
  // 画像モーダルが表示中の場合のみ
  if (document.getElementById('image-modal').style.display === 'flex') {
    const cardName = visibleCards[currentImageIndex].dataset.name;
    const currentCount = deckBuilder.deck.filter((c) => c.dataset.name === cardName).length;

    // カードの上限枚数を正しく取得
    let maxAllowed = 4;
    if (deckBuilder.infiniteCardLimit.has(cardName)) {
      maxAllowed = Infinity;
    } else if (deckBuilder.tenCardLimit.has(cardName)) {
      maxAllowed = 10;
    } else if (deckBuilder.sevenCardLimit.has(cardName)) {
      maxAllowed = 7;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      // 上キーで増加（上限チェックを正しく行う）
      if (currentCount < maxAllowed) {
        deckBuilder.addCard(visibleCards[currentImageIndex].cloneNode(true));
        updateCardCountInModal(cardName);
      } else {
        // 上限に達した場合のメッセージ表示
        if (maxAllowed === 10) {
          deckBuilder.showTenCardMessage();
        } else if (maxAllowed === 7) {
          deckBuilder.showMessage('このカードはデッキに7枚まで。');
        } else {
          deckBuilder.showMessage('同じカードはデッキに4枚まで。');
        }
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      // 下キーで減少
      if (currentCount > 0) {
        const cardToRemove = deckBuilder.deck.findLast((c) => c.dataset.name === cardName);
        if (cardToRemove) {
          deckBuilder.removeCard(null, cardToRemove.dataset.number);
          updateCardCountInModal(cardName);
        }
      }
    }
  }
});

// モーダル内のカウント表示を更新する関数
function updateCardCountInModal(cardName) {
  const controls = document.querySelector('.card-controls');
  if (!controls) return;

  const currentCount = deckBuilder.deck.filter((c) => c.dataset.name === cardName).length;
  const cardCountDiv = controls.querySelector('.card-count');

  // カードの上限枚数を取得
  let maxAllowed = 4;
  if (deckBuilder.infiniteCardLimit.has(cardName)) {
    maxAllowed = Infinity;
  } else if (deckBuilder.tenCardLimit.has(cardName)) {
    maxAllowed = 10;
  } else if (deckBuilder.sevenCardLimit.has(cardName)) {
    maxAllowed = 7;
  }
  const isInfinite = maxAllowed === Infinity;

  // CSSで表示を制御
  if (isInfinite) {
    cardCountDiv.classList.add('is-infinite');
    cardCountDiv.setAttribute('data-count', currentCount);
    cardCountDiv.textContent = ''; // 元のテキストはクリア
  } else {
    cardCountDiv.classList.remove('is-infinite');
    cardCountDiv.removeAttribute('data-count');
    cardCountDiv.textContent = `${currentCount}/${maxAllowed}`;
  }

  // ボタンの無効化状態を明示的に更新
  const addButton = controls.querySelector('#add-card');
  const removeButton = controls.querySelector('#remove-card');

  addButton.disabled = !isInfinite && currentCount >= maxAllowed;
  removeButton.disabled = currentCount <= 0;

  // スタイルも明示的に更新（CSSの問題対策）
  if (!isInfinite && currentCount >= maxAllowed) {
    addButton.classList.add('disabled');
  } else {
    addButton.classList.remove('disabled');
  }

  if (currentCount <= 0) {
    removeButton.classList.add('disabled');
  } else {
    removeButton.classList.remove('disabled');
  }
}

// カード要素にボタンを追加する関数
const addCardButtons = (cardElement) => {
  const buttons = document.createElement('div');
  buttons.className = 'card-buttons';

  const addButton = document.createElement('button');
  addButton.className = 'card-add-button';
  addButton.onclick = (e) => {
    e.stopPropagation(); // カードのクリックイベントを停止
    deckBuilder.addCard(cardElement.cloneNode(true));
  };

  const removeButton = document.createElement('button');
  removeButton.className = 'card-remove-button';
  removeButton.onclick = (e) => {
    e.stopPropagation(); // カードのクリックイベントを停止
    // cardElementのdata-numberを使用して削除
    deckBuilder.removeCard(null, cardElement.dataset.number);
  };

  buttons.appendChild(addButton);
  buttons.appendChild(removeButton);
  cardElement.appendChild(buttons);
};

// カードコントロールの設定を関数化
const setupCardControls = (controls, card, cardName) => {
  const addButton = controls.querySelector('#add-card');
  const removeButton = controls.querySelector('#remove-card');

  // カードの上限枚数を取得（初期表示時から正しい値を使用）
  let maxAllowed = 4;
  if (deckBuilder.infiniteCardLimit.has(cardName)) {
    maxAllowed = Infinity;
  } else if (deckBuilder.tenCardLimit.has(cardName)) {
    maxAllowed = 10;
  } else if (deckBuilder.sevenCardLimit.has(cardName)) {
    maxAllowed = 7;
  }

  // 初期表示時から正しい上限枚数を表示
  const currentCount = deckBuilder.deck.filter((c) => c.dataset.name === cardName).length;
  const displayMax = maxAllowed === Infinity ? '∞' : maxAllowed;
  controls.querySelector('.card-count').textContent = `${currentCount}/${displayMax}`;

  addButton.onclick = (e) => {
    e.stopPropagation();
    if (!addButton.disabled) {
      // 現在の枚数を取得
      const currentCount = deckBuilder.deck.filter((c) => c.dataset.name === cardName).length;

      if (maxAllowed === Infinity || currentCount < maxAllowed) {
        deckBuilder.addCard(card.cloneNode(true));
        const newCount = deckBuilder.deck.filter((c) => c.dataset.name === cardName).length;
        const displayMax = maxAllowed === Infinity ? '∞' : maxAllowed;
        controls.querySelector('.card-count').textContent = `${newCount}/${displayMax}`;

        // ボタン状態を更新
        addButton.disabled = maxAllowed !== Infinity && newCount >= maxAllowed;
        if (maxAllowed !== Infinity && newCount >= maxAllowed) {
          addButton.classList.add('disabled');
        }

        removeButton.disabled = false;
        removeButton.classList.remove('disabled');
      } else {
        // 上限メッセージ
        if (maxAllowed === 10) {
          deckBuilder.showTenCardMessage();
        } else if (maxAllowed === 7) {
          deckBuilder.showMessage('このカードはデッキに7枚まで。');
        } else {
          deckBuilder.showMessage('同じカードはデッキに4枚まで。');
        }
      }
    }
  };

  removeButton.onclick = (e) => {
    e.stopPropagation();
    if (!removeButton.disabled) {
      const cardToRemove = deckBuilder.deck.findLast((c) => c.dataset.name === cardName);
      if (cardToRemove) {
        deckBuilder.removeCard(null, cardToRemove.dataset.number);
        const newCount = deckBuilder.deck.filter((c) => c.dataset.name === cardName).length;
        const displayMax = maxAllowed === Infinity ? '∞' : maxAllowed;
        controls.querySelector('.card-count').textContent = `${newCount}/${displayMax}`;

        // ボタン状態を更新
        removeButton.disabled = newCount <= 0;
        if (newCount <= 0) {
          removeButton.classList.add('disabled');
        }

        addButton.disabled = maxAllowed !== Infinity && newCount >= maxAllowed;
        if (maxAllowed !== Infinity && newCount >= maxAllowed) {
          addButton.classList.add('disabled');
        } else {
          addButton.classList.remove('disabled');
        }
      }
    }
  };
};

// デッキ管理機能の実装
const deckManager = {
  currentDeckId: 1,
  decks: {},

  // 初期化時にデッキデータを確実に読み込む
  initialize() {
    // 既存のデッキデータをロード
    this.loadFromLocalStorage();

    // デッキヘッダーの切り替えボタン
    const deckMenu = document.querySelector('.deck-menu');
    const helpButton = deckMenu.querySelector('.deck-help-button');
    if (helpButton) {
      const saveButton = document.createElement('button');
      saveButton.className = 'deck-menu-button';
      saveButton.textContent = '切替';
      saveButton.onclick = () => this.openDeckList();
      helpButton.parentNode.replaceChild(saveButton, helpButton);
    }

    // イベントリスナーの設定
    this.setupEventListeners();

    // 現在のデッキを読み込む
    this.loadDeck(this.currentDeckId);
  },

  // デッキを選択
  selectDeck(deckId) {
    // 選択したデッキに切り替え
    this.currentDeckId = deckId;
    this.loadDeck(deckId);
    this.saveToLocalStorage(); // 現在選択中のデッキIDも保存

    // モーダルを閉じる
    this.closeDeckList();
  },

  // 現在のデッキを保存
  saveDeck(deckId) {
    const button = document.querySelector(`.deck-select-button[data-deck-id="${deckId}"]`);
    if (button) {
      this.decks[deckId] = {
        name: button.textContent,
        cards: [...deckBuilder.deck].map((card) => ({
          dataset: { ...card.dataset },
          src: card.querySelector('img')?.src
        }))
      };
      this.saveToLocalStorage();
    }
  },

  // setupEventListeners メソッド
  setupEventListeners() {
    const modal = document.getElementById('deck-list-modal');
    const closeButton = modal.querySelector('.deck-list-close');

    // 閉じるボタン
    closeButton.addEventListener('click', () => this.closeDeckList());

    // デッキ選択ボタン
    modal.querySelectorAll('.deck-select-button').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectDeck(parseInt(button.dataset.deckId));
      });
    });

    // デッキ編集ボタン
    modal.querySelectorAll('.deck-edit-button').forEach((button) => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editDeckName(parseInt(button.dataset.deckId));
      });
    });

    // デッキ削除ボタン
    modal.querySelectorAll('.deck-delete-button').forEach((button) => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const deckId = button.getAttribute('data-deck-id');
        confirmDeckReset(deckId);
      });
    });

    // モーダル外クリックで閉じる
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeDeckList();
      }
    });
  },

  // デッキ一覧を開く
  openDeckList() {
    const modal = document.getElementById('deck-list-modal');
    modal.style.display = 'block';
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => {
      modal.classList.add('active');
    });
    // 現在のデッキをハイライト
    this.updateActiveButton();
    // プレビュー画像を更新
    this.updateDeckPreviews();
  },

  // デッキ一覧を閉じる
  closeDeckList() {
    const modal = document.getElementById('deck-list-modal');
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  },

  // デッキを読み込み
  loadDeck(deckId) {
    const deck = this.decks[deckId];
    if (deck && Array.isArray(deck.cards)) {
      // カード要素を再構築
      deckBuilder.deck = deck.cards.map((cardData) => {
        const card = document.createElement('div');
        card.className = 'card';
        Object.assign(card.dataset, cardData.dataset);
        const img = document.createElement('img');
        img.src = cardData.src;
        img.alt = cardData.dataset.name;
        card.appendChild(img);
        return card;
      });
    } else {
      deckBuilder.deck = [];
      // デッキが空の場合、プレビュー画像を非表示にする
      const previewImg = document.querySelector(`.deck-preview-image[data-deck-id="${deckId}"]`);
      if (previewImg) {
        previewImg.style.display = 'none';
        previewImg.src = '';
      }
    }
    deckBuilder.updateDisplay();
    deckBuilder.updateDeckCount();
    this.updateActiveButton();
  },

  // ローカルストレージに保存
  saveToLocalStorage() {
    const saveData = {
      currentDeckId: this.currentDeckId,
      decks: this.decks
    };
    localStorage.setItem('kannagi-deck-manager', JSON.stringify(saveData));
  },

  // deckManagerオブジェクト内
  saveToLocalStorage() {
    const saveData = {
      currentDeckId: this.currentDeckId,
      decks: this.decks,
      version: '2'
    };
    localStorage.setItem('kannagi-deck-manager-v2', JSON.stringify(saveData));
  },

  loadFromLocalStorage() {
    try {
      const saved = localStorage.getItem('kannagi-deck-manager-v2');
      if (saved) {
        const data = JSON.parse(saved);
        this.currentDeckId = data.currentDeckId || 1;
        this.decks = data.decks || {};

        // デッキ名を復元
        Object.entries(this.decks).forEach(([deckId, deck]) => {
          const button = document.querySelector(`.deck-select-button[data-deck-id="${deckId}"]`);
          if (button && deck.name) {
            button.textContent = deck.name;
          }
        });
      }
    } catch (e) {
      console.error('デッキデータの読み込みに失敗しました:', e);
      this.currentDeckId = 1;
      this.decks = {};
    }
  },

  // アクティブなデッキボタンを更新
  updateActiveButton() {
    document.querySelectorAll('.deck-select-button').forEach((button) => {
      const isActive = parseInt(button.dataset.deckId) === this.currentDeckId;
      button.classList.toggle('active', isActive);
      // アクティブなデッキの背景色をより強調
      if (isActive) {
        button.style.backgroundColor = '#4a4a4a';
      } else {
        button.style.backgroundColor = '';
      }
    });
  },
  // デッキ名を編集
  editDeckName(deckId) {
    const button = document.querySelector(`.deck-select-button[data-deck-id="${deckId}"]`);
    const currentName = button.textContent;
    const newName = prompt('デッキ名を入力してください:', currentName);

    if (newName && newName.trim()) {
      button.textContent = newName.trim();

      // デッキ名のみを更新
      if (this.decks[deckId]) {
        this.decks[deckId].name = newName.trim();
      } else {
        this.decks[deckId] = {
          name: newName.trim(),
          cards: [] // 新規デッキの場合は空の配列を設定
        };
      }

      // デッキ内容は変更せずに保存
      this.saveToLocalStorage();
    }
  },

  // デッキのプレビュー画像を更新
  updateDeckPreviews() {
    Object.entries(this.decks).forEach(([deckId, deck]) => {
      if (!deck || !deck.cards || deck.cards.length === 0) {
        // デッキが空の場合、プレビュー画像を非表示にする
        const previewImg = document.querySelector(`.deck-preview-image[data-deck-id="${deckId}"]`);
        if (previewImg) {
          previewImg.style.display = 'none';
          previewImg.src = '';
        }
        return;
      }

      // コストが最も高いカードを見つける
      const highestCostCard = deck.cards.reduce((highest, current) => {
        const currentCost = parseInt(current.dataset.cost) || 0;
        const highestCost = parseInt(highest.dataset.cost) || 0;
        return currentCost > highestCost ? current : highest;
      }, deck.cards[0]);

      // プレビュー画像を更新
      const previewImg = document.querySelector(`.deck-preview-image[data-deck-id="${deckId}"]`);
      if (previewImg && highestCostCard) {
        // srcプロパティを直接参照
        previewImg.src = highestCostCard.src || '';
        previewImg.style.display = 'block';
      }
    });
  },

  // デッキを消去
  clearDeck(deckId) {
    if (this.decks[deckId]) {
      this.decks[deckId] = { cards: [] };
      this.saveDeckToLocalStorage(deckId);

      // プレビュー画像を即座に非表示にする
      const previewImg = document.querySelector(`.deck-preview-image[data-deck-id="${deckId}"]`);
      if (previewImg) {
        previewImg.style.display = 'none';
        previewImg.src = '';
      }

      // 現在表示中のデッキが消去された場合は表示をクリア
      if (this.currentDeckId === deckId) {
        deckBuilder.deck = [];
        deckBuilder.updateDisplay();
        deckBuilder.updateDeckCount();
      }
    }
  }
};

// html2canvasライブラリを動的に読み込む
function loadHtml2Canvas() {
  return new Promise((resolve, reject) => {
    if (window.html2canvas) {
      resolve(window.html2canvas);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
    script.onload = () => resolve(window.html2canvas);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// デッキ画像の保存機能
async function captureDeck() {
  // 保存中メッセージを表示（最初に表示）
  const messageDiv = document.createElement('div');
  messageDiv.className = 'saving-message';
  messageDiv.textContent = '画像を作成中...';
  document.body.appendChild(messageDiv);

  // 確実にメッセージが表示されるよう少し待機
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    // html2canvasの読み込み
    const html2canvas = await loadHtml2Canvas();

    // デッキ表示エリアの取得
    const deckDisplay = document.getElementById('deck-display');
    const modalContent = document.querySelector('.deck-modal-content');

    // キャプチャ用のクラスを追加
    deckDisplay.classList.add('capturing');
    modalContent.classList.add('capturing-deck');

    // 現在のデッキ名を取得
    const currentDeckId = deckManager.currentDeckId;
    const deckButton = document.querySelector(`.deck-select-button[data-deck-id="${currentDeckId}"]`);
    const deckName = deckButton ? deckButton.textContent : `デッキ${currentDeckId}`;

    // html2canvasでキャプチャ
    const canvas = await html2canvas(deckDisplay, {
      backgroundColor: '#2a2a2a',
      scale: 4,
      logging: false,
      allowTaint: true,
      useCORS: true,
      imageTimeout: 0, // タイムアウトを無効化して処理を高速化
      removeContainer: true
    });

    // キャプチャ用クラスを削除
    deckDisplay.classList.remove('capturing');
    modalContent.classList.remove('capturing-deck');

    // iOSの判定（新しい方式）
    const isIOS = ['iPad', 'iPhone'].includes(navigator.platform) || (navigator.userAgent.includes('Mac') && 'ontouchend' in document);

    if (isIOS) {
      try {
        // DataURLを生成（エラーハンドリング付き）
        const dataUrl = await new Promise((resolve, reject) => {
          try {
            const url = canvas.toDataURL('image/png');
            resolve(url);
          } catch (e) {
            reject(e);
          }
        });

        // モーダルを生成（iOSのみ）
        const imageModal = document.createElement('div');
        imageModal.className = 'deck-image-modal';

        // iOSはシンプルな長押し保存のみのモーダル
        const modalHTML = `
          <div class="deck-image-container">
            <img src="${dataUrl}" alt="${deckName}">
            <p class="save-instruction">画像を長押し保存してください</p>
            <button class="modal-close-button">閉じる</button>
          </div>
        `;

        imageModal.innerHTML = modalHTML;

        // イベントリスナーを追加
        const closeButton = imageModal.querySelector('.modal-close-button');
        if (closeButton) {
          closeButton.addEventListener('click', () => {
            imageModal.remove();
            document.body.classList.remove('modal-open');
          });
        }

        imageModal.addEventListener('click', (e) => {
          if (e.target === imageModal) {
            imageModal.remove();
            document.body.classList.remove('modal-open');
          }
        });

        // DOMに追加
        document.body.appendChild(imageModal);

        // 少し遅延してからフェードイン（Safari対策）
        setTimeout(() => {
          imageModal.classList.add('active');
        }, 200);
      } catch (error) {
        console.error('モーダル表示エラー:', error);
        alert('画像の表示に失敗しました。');
      }
    } else {
      // PCとAndroidは直接保存
      const link = document.createElement('a');
      link.download = `${deckName}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  } catch (error) {
    console.error('デッキの画像生成に失敗しました:', error);
    alert('デッキの画像生成に失敗しました。');
  } finally {
    // 保存中メッセージを削除
    const messageDiv = document.querySelector('.saving-message');
    if (messageDiv) {
      messageDiv.remove();
    }
  }
}

// カード拡大表示時のコントロール設定
function setupModalCardControls(controls, card, cardName) {
  const addButton = controls.querySelector('#add-card');
  const removeButton = controls.querySelector('#remove-card');

  // カードの上限枚数を取得
  let maxAllowed = 4;
  if (deckBuilder.infiniteCardLimit.has(cardName)) {
    maxAllowed = Infinity;
  } else if (deckBuilder.tenCardLimit.has(cardName)) {
    maxAllowed = 10;
  } else if (deckBuilder.sevenCardLimit.has(cardName)) {
    maxAllowed = 7;
  }

  // 現在の枚数を取得して表示
  const currentCount = deckBuilder.deck.filter((c) => c.dataset.name === cardName).length;
  const displayMax = maxAllowed === Infinity ? '∞' : maxAllowed;
  controls.querySelector('.card-count').textContent = `${currentCount}/${displayMax}`;

  // ボタンの無効化状態を設定
  addButton.disabled = maxAllowed !== Infinity && currentCount >= maxAllowed;
  removeButton.disabled = currentCount <= 0;

  // スタイルも更新
  if (maxAllowed !== Infinity && currentCount >= maxAllowed) {
    addButton.classList.add('disabled');
  } else {
    addButton.classList.remove('disabled');
  }

  if (currentCount <= 0) {
    removeButton.classList.add('disabled');
  } else {
    removeButton.classList.remove('disabled');
  }

  // イベントリスナーを再設定
  addButton.onclick = (e) => {
    e.stopPropagation();
    if (!addButton.disabled) {
      // 現在の枚数を再取得
      const currentCount = deckBuilder.deck.filter((c) => c.dataset.name === cardName).length;

      if (maxAllowed === Infinity || currentCount < maxAllowed) {
        deckBuilder.addCard(card.cloneNode(true));
        updateCardCountInModal(cardName);
      } else {
        // 上限メッセージ
        if (maxAllowed === 10) {
          deckBuilder.showTenCardMessage();
        } else if (maxAllowed === 7) {
          deckBuilder.showMessage('このカードはデッキに7枚まで。');
        } else {
          deckBuilder.showMessage('同じカードはデッキに4枚まで。');
        }
      }
    }
  };
  removeButton.onclick = (e) => {
    e.stopPropagation();
    if (!removeButton.disabled) {
      const cardToRemove = deckBuilder.deck.findLast((c) => c.dataset.name === cardName);
      if (cardToRemove) {
        deckBuilder.removeCard(null, cardToRemove.dataset.number);
        updateCardCountInModal(cardName);
      }
    }
  };
}

// デッキ削除ボタンのイベントリスナーを追加
document.querySelectorAll('.deck-delete-button').forEach((button) => {
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    const deckId = button.getAttribute('data-deck-id');
    confirmDeckReset(deckId);
  });
});

// デッキリセット確認ポップアップを表示
function confirmDeckReset(deckId) {
  const confirmPopup = document.createElement('div');
  confirmPopup.className = 'confirm-popup';
  confirmPopup.innerHTML = `
    <div class="confirm-content">
      <p>デッキ${deckId}の内容をリセットしますか？</p>
      <div class="confirm-buttons">
        <button onclick="resetSpecificDeck(${deckId}, true)">はい</button>
        <button onclick="resetSpecificDeck(${deckId}, false)">いいえ</button>
      </div>
    </div>
  `;

  // オーバーレイ部分のクリックで閉じる
  confirmPopup.addEventListener('click', (e) => {
    if (e.target === confirmPopup) {
      resetSpecificDeck(deckId, false);
    }
  });

  document.body.classList.add('modal-open');
  document.body.appendChild(confirmPopup);
}

// 特定のデッキをリセットする関数
function resetSpecificDeck(deckId, confirmed) {
  const popup = document.querySelector('.confirm-popup');

  if (confirmed) {
    // 現在のデッキIDを保存
    const currentDeckId = deckManager.currentDeckId;

    // 指定されたデッキをリセット
    if (deckManager.decks[deckId]) {
      // デッキ内容をリセット
      deckManager.decks[deckId].cards = [];
      deckManager.decks[deckId].name = `デッキ${deckId}`;

      // デッキ名ボタンのテキストを更新
      const button = document.querySelector(`.deck-select-button[data-deck-id="${deckId}"]`);
      if (button) {
        button.textContent = `デッキ${deckId}`;
      }

      // プレビュー画像を非表示
      const previewImg = document.querySelector(`.deck-preview-image[data-deck-id="${deckId}"]`);
      if (previewImg) {
        previewImg.style.display = 'none';
        previewImg.src = '';
      }

      // 現在表示中のデッキが削除対象の場合、デッキ内容も更新
      if (currentDeckId == deckId) {
        deckBuilder.deck = [];
        deckBuilder.updateDisplay();
        deckBuilder.updateDeckCount();
      }

      // 変更を保存
      deckManager.saveToLocalStorage();

      // 成功メッセージを表示
      deckBuilder.showMessage(`デッキ${deckId}をリセットしました`);
    }
  }

  document.body.classList.remove('modal-open');
  popup.remove();
}

// カードの表示数をカウントして表示する関数
function updateCardCount() {
  const visibleCards = document.querySelectorAll('.card[style*="display: block"], .card:not([style*="display"])');
  const countElement = document.getElementById('search-result-count');
  if (countElement) {
    countElement.innerHTML = `検索結果 <span class="count-number">${visibleCards.length}</span> 枚`;
  }
}
