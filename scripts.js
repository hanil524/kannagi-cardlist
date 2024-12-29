// ページ更新時に最上部にスクロール（最優先で実行）
window.onbeforeunload = function () {
  window.scrollTo(0, 0);
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
    const name = card.dataset.name.toLowerCase();
    const attributes = card.dataset.attribute ? card.dataset.attribute.toLowerCase() : '';
    card.style.display = name.includes(query) || attributes.includes(query) ? 'block' : 'none';
  });
};

const sortCards = (criteria) => {
  // 既存のソート状態をクリア（seasonは除く）
  if (criteria !== 'season' && sortCriteria !== criteria) {
    sortCriteria = criteria;
    // No.と力の場合は初期値をdescに
    if (criteria === 'number' || criteria === 'power') {
      sortOrder = 'desc';
    } else {
      sortOrder = 'asc';
    }
  } else if (criteria !== 'season') {
    // 同じボタンを押した場合は順序を反転
    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
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
      const aValue = parseInt(a.dataset[criteria]);
      const bValue = parseInt(b.dataset[criteria]);
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

  // 複製カードの削除
  document.querySelectorAll('.card[data-cloned]').forEach((clonedCard) => clonedCard.remove());

  cards.forEach((card) => {
    if (card.hasAttribute('data-cloned')) return; // 複製カードはスキップ

    let shouldDisplay = true;
    for (const [attribute, values] of Object.entries(filters)) {
      if (values.size > 0) {
        const cardAttribute = card.getAttribute(`data-${attribute}`);
        const cardAttributes = cardAttribute ? cardAttribute.split(' ') : [];
        const matches = values.has(cardAttribute) || cardAttributes.some((attr) => values.has(attr));
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
    tooltip.style.animation = 'fadeOut 2s forwards'; // マウスオーバーで説明を表示する秒数

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
      toggleFilterCard(filterId, button.innerText.trim());
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

  // 現在の表示状態に応じてカードリストを取得
  visibleCards = isDeckModalVisible
    ? Array.from(document.querySelectorAll('.deck-card')) // デッキ内のカード
    : Array.from(document.querySelectorAll('.card')).filter((card) => window.getComputedStyle(card).display !== 'none'); // 表示中のカード一覧

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

  // コントロール要素の更新
  let controls = modal.querySelector('.card-controls');
  if (!controls) {
    controls = document.createElement('div');
    controls.className = 'card-controls';
    modal.querySelector('.modal-content').appendChild(controls);
  }

  controls.innerHTML = `
    <button class="card-control-button" id="remove-card" ${currentCount <= 0 ? 'disabled' : ''}>−</button>
    <div class="card-count">${currentCount}/4</div>
    <button class="card-control-button" id="add-card" ${currentCount >= 4 ? 'disabled' : ''}>＋</button>
  `;

  // ボタンのイベントリスナー設定
  setupCardControls(controls, currentCard, cardName);

  // 画像の表示処理
  // 画像とコントロールをコンテナでラップ
  const container = document.createElement('div');
  container.className = 'image-container';

  // 画像の表示処理
  modalImage.style.opacity = '0';
  modalImage.src = src;

  // コンテナに画像を追加
  container.appendChild(modalImage);

  // 既存のコントロールを更新
  controls.innerHTML = `
    <button class="card-control-button" id="remove-card" ${currentCount <= 0 ? 'disabled' : ''}>−</button>
    <div class="card-count">${currentCount}/4</div>
    <button class="card-control-button" id="add-card" ${currentCount >= 4 ? 'disabled' : ''}>＋</button>
  `;

  container.appendChild(controls);

  // モーダルのコンテンツに追加
  const modalContent = modal.querySelector('.modal-content');
  modalContent.innerHTML = ''; // 既存のコンテンツをクリア
  modalContent.appendChild(container);

  // 既存のナビゲーションボタンを再利用
  modalContent.appendChild(prevButton);
  modalContent.appendChild(nextButton);

  setupCardControls(controls, currentCard, cardName);

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedScrollPosition}px`; // 保存した位置を使用
  document.body.style.width = '100%';

  // フェードイン効果とナビゲーションの表示を調整
  requestAnimationFrame(() => {
    modalImage.style.transition = 'opacity 0.3s ease';
    modalImage.style.opacity = '1';

    // 画像のロード完了後にナビゲーションボタンを表示
    modalImage.onload = () => {
      updateNavigationButtons();
      preloadAdjacentImages();
    };

    // 既にキャッシュされている場合のためのフォールバック
    if (modalImage.complete) {
      updateNavigationButtons();
      preloadAdjacentImages();
    }
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
            const aValue = parseInt(a.dataset[sortCriteria]);
            const bValue = parseInt(b.dataset[sortCriteria]);
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
    const currentCount = deckBuilder.deck.filter((card) => card.dataset.name === cardName).length;

    const controls = document.querySelector('.card-controls');
    if (controls) {
      controls.innerHTML = `
              <button class="card-control-button" id="remove-card" ${currentCount <= 0 ? 'disabled' : ''}>−</button>
              <div class="card-count">${currentCount}/4</div>
              <button class="card-control-button" id="add-card" ${currentCount >= 4 ? 'disabled' : ''}>＋</button>
          `;
      setupCardControls(controls, nextCard, cardName);
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
    const currentCount = deckBuilder.deck.filter((card) => card.dataset.name === cardName).length;

    const controls = document.querySelector('.card-controls');
    if (controls) {
      controls.innerHTML = `
              <button class="card-control-button" id="remove-card" ${currentCount <= 0 ? 'disabled' : ''}>−</button>
              <div class="card-count">${currentCount}/4</div>
              <button class="card-control-button" id="add-card" ${currentCount >= 4 ? 'disabled' : ''}>＋</button>
          `;
      setupCardControls(controls, prevCard, cardName);
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
  restrictedCards: new Set(['人魚の活き血（にんぎょのいきち）', '悠習の古日記（ゆうしゅうのこにっき）']),
  tenCardLimit: new Set(['火の玉（ひのたま）']), // 10枚制限カード
  savedScrollPosition: 0, // スクロール位置保存用の変数

  // デッキビルダーのopen/close関数
  open() {
    const modal = document.getElementById('deck-modal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

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

  showTenCardMessage() {
    const message = document.createElement('div');
    message.className = 'deck-limit-message';
    message.textContent = 'このカードはデッキに10枚まで。';
    document.body.appendChild(message);
    setTimeout(() => message.remove(), 2000);
  },

  // カードを追加
  addCard(card) {
    const cardName = card.dataset.name;
    const sameNameCount = this.deck.filter((c) => c.dataset.name === cardName).length;

    if (this.tenCardLimit.has(cardName)) {
      if (sameNameCount >= 10) {
        this.showTenCardMessage();
        return false;
      }
    } else if (this.restrictedCards.has(cardName) && sameNameCount >= 1) {
      this.showLimitMessage();
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
        const costCompare = parseInt(a.dataset.cost) - parseInt(b.dataset.cost);
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

  // Fisher-Yatesシャッフルで40枚から完全にランダムに8枚を選ぶ
  function getRandomCards(deck, count) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  }

  // 完全にランダムに8枚を選択し、その後で種類とコストで並び替え
  const selectedCards = getRandomCards(deckBuilder.deck, 8).sort((a, b) => {
    const typeA = typeOrder.indexOf(a.dataset.type);
    const typeB = typeOrder.indexOf(b.dataset.type);
    if (typeA !== typeB) return typeA - typeB;
    return parseInt(a.dataset.cost) - parseInt(b.dataset.cost);
  });

  // 以降のモーダル表示処理は変更なし
  const content = `
      <div class="zero-search-content">
          <div class="zero-search-result">
              ${selectedCards
                .map(
                  (card) => `
                      <div class="deck-card">
                          <img src="${card.querySelector('img').src}" alt="${card.dataset.name}">
                      </div>
                  `
                )
                .join('')}
          </div>
          <div class="zero-search-buttons">
              <button onclick="performZeroSearch()">リトライ</button>
              <button onclick="closeZeroSearch()">戻る</button>
          </div>
      </div>
  `;

  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'zero-search-modal';
    document.body.appendChild(modal);
  }

  modal.innerHTML = content;

  modal.addEventListener('click', (e) => {
    if (e.target.classList.contains('zero-search-modal')) {
      closeZeroSearch();
    }
  });

  document.body.classList.add('modal-open');
  requestAnimationFrame(() => modal.classList.add('active'));
}

function closeZeroSearch() {
  const modal = document.querySelector('.zero-search-modal');
  modal.classList.remove('active');
  document.body.classList.remove('modal-open');
  setTimeout(() => modal.remove(), 300);
}

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
    deckBuilder.deck = [];
    deckBuilder.updateDisplay();
    deckManager.saveDeck(deckManager.currentDeckId);
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

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      // 上キーで増加
      const maxAllowed = deckBuilder.tenCardLimit.has(cardName) ? 10 : 4;
      if (currentCount < maxAllowed) {
        deckBuilder.addCard(visibleCards[currentImageIndex].cloneNode(true));
        updateCardCountInModal(cardName);
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
  const maxAllowed = deckBuilder.tenCardLimit.has(cardName) ? 10 : 4;

  controls.querySelector('.card-count').textContent = `${currentCount}/${maxAllowed}`;
  controls.querySelector('#add-card').disabled = currentCount >= maxAllowed;
  controls.querySelector('#remove-card').disabled = currentCount <= 0;
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

  addButton.onclick = (e) => {
    e.stopPropagation();
    if (!addButton.disabled) {
      // 現在の枚数を取得
      const currentCount = deckBuilder.deck.filter((c) => c.dataset.name === cardName).length;

      // 10枚制限カードの場合は10枚まで許可
      const maxAllowed = deckBuilder.tenCardLimit.has(cardName) ? 10 : 4;

      if (currentCount < maxAllowed) {
        deckBuilder.addCard(card.cloneNode(true));
        const newCount = deckBuilder.deck.filter((c) => c.dataset.name === cardName).length;
        controls.querySelector('.card-count').textContent = `${newCount}/${maxAllowed}`;
        addButton.disabled = newCount >= maxAllowed;
        removeButton.disabled = false;
      } else {
        // 上限に達した場合のメッセージ表示
        if (maxAllowed === 10) {
          deckBuilder.showTenCardMessage();
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
        controls.querySelector('.card-count').textContent = `${newCount}/4`;
        removeButton.disabled = newCount <= 0;
        addButton.disabled = false;
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
      saveButton.textContent = 'デッキ切替';
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

        // データ属性を設定
        Object.assign(card.dataset, cardData.dataset);

        // 画像要素を作成
        const img = document.createElement('img');
        img.src = cardData.src;
        img.alt = cardData.dataset.name;

        card.appendChild(img);
        return card;
      });
    } else {
      deckBuilder.deck = [];
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
  }
};
