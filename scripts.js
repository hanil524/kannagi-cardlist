// ページがロードされた際の初期設定
console.log('JavaScript is loaded');

// フィルター条件を保持するオブジェクト
const filters = {
  series: new Set(),
  season: new Set(),
  type: new Set(),
  role: new Set(),
  keyword: new Set(),
  attribute: new Set()
};

// ソート条件を保持する変数
let sortCriteria = null;
let sortOrder = 'asc';

// スクロール位置を保持する変数
let scrollPosition = 0;

// ページロード後にDOMの初期設定を行う
document.addEventListener('DOMContentLoaded', () => {
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

  // カード画像にクリックイベントを追加（モバイル用）
  const cards = document.querySelectorAll('.card img');
  cards.forEach((card) => {
    card.addEventListener('click', (event) => {
      event.stopPropagation(); // イベントの伝播を停止
      if (window.innerWidth <= 768) {
        openImageModal(card.src);
      }
    });
  });

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

  // 画像モーダルのイベントリスナーを追加 (新規追加)
  const imageModal = document.getElementById('image-modal');
  imageModal.addEventListener('click', function (event) {
    if (event.target === imageModal) {
      closeImageModal();
    }
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
  if (sortCriteria === criteria) {
    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    sortCriteria = criteria;
    sortOrder = criteria === 'number' ? 'desc' : 'asc';
  }

  const cardList = document.getElementById('card-list');
  const cards = Array.from(document.querySelectorAll('.card'));
  cards.sort((a, b) => {
    const aValue = parseInt(a.dataset[criteria]);
    const bValue = parseInt(b.dataset[criteria]);
    return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
  });
  cards.forEach((card) => cardList.appendChild(card));
};

const resetFilters = () => {
  Object.keys(filters).forEach((key) => filters[key].clear());
  const cards = document.querySelectorAll('.card');
  cards.forEach((card) => (card.style.display = 'block'));
  document.getElementById('no-cards-message').style.display = 'none';
  resetSort();
};

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
};

const filterCards = () => {
  const cards = document.querySelectorAll('.card');
  let anyVisible = false;
  cards.forEach((card) => {
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
    card.style.display = shouldDisplay ? 'block' : 'none';
    if (shouldDisplay) {
      anyVisible = true;
    }
  });

  document.getElementById('no-cards-message').style.display = anyVisible ? 'none' : 'block';
};

const getScrollbarWidth = () => {
  const outer = document.createElement('div');
  outer.style.visibility = 'hidden';
  outer.style.width = '100px';
  outer.style.msOverflowStyle = 'scrollbar';
  document.body.appendChild(outer);

  const widthNoScroll = outer.offsetWidth;
  outer.style.overflow = 'scroll';

  const inner = document.createElement('div');
  inner.style.width = '100%';
  outer.appendChild(inner);

  const widthWithScroll = inner.offsetWidth;

  outer.parentNode.removeChild(outer);

  return widthNoScroll - widthWithScroll;
};

const openModal = (filterId) => {
  const modal = document.getElementById('modal');
  const modalButtons = document.getElementById('modal-buttons');
  modalButtons.innerHTML = '';

  const filterElement = document.getElementById(filterId);
  if (!filterElement) {
    console.error(`Element with id ${filterId} not found`);
    return;
  }

  const filterContent = filterElement.querySelectorAll('button');
  filterContent.forEach((button) => {
    const newButton = document.createElement('button');
    newButton.innerText = button.innerText;
    newButton.onclick = () => {
      toggleFilterCard(filterId, button.innerText.trim());
      closeModal();
    };
    // 元のボタンのクラスを新しいボタンに追加
    newButton.className = button.className;
    modalButtons.appendChild(newButton);
  });

  // スクロール位置を保存
  scrollPosition = window.pageYOffset;

  // スクロールバーの幅を計算
  const scrollbarWidth = getScrollbarWidth();

  // ボディにパディングを追加する前にモーダルを表示
  modal.style.display = 'block';

  document.body.style.paddingRight = `${scrollbarWidth}px`;
  document.body.classList.add('modal-open');

  const headerContent = document.querySelector('.header-content');
  headerContent.style.paddingRight = `${scrollbarWidth}px`;
};

const closeModal = () => {
  const modal = document.getElementById('modal');
  modal.style.display = 'none';
  document.body.classList.remove('modal-open');
  window.scrollTo(0, scrollPosition);
  document.body.style.top = '';
  document.body.style.paddingRight = '';

  const headerContent = document.querySelector('.header-content');
  headerContent.style.paddingRight = '';

  if (
    filters.series.size === 0 &&
    filters.season.size === 0 &&
    filters.type.size === 0 &&
    filters.role.size === 0 &&
    filters.keyword.size === 0 &&
    filters.attribute.size === 0
  ) {
    document.getElementById('no-cards-message').style.display = 'none';
    resetSort();
  }
};

const closeModalOnClick = (event) => {
  if (event.target.id === 'modal') {
    closeModal();
  }
};
let savedScrollPosition = 0;

// 画像モーダルを開く関数
const openImageModal = (src) => {
  const modal = document.getElementById('image-modal');
  const modalImage = document.getElementById('modal-image');
  const closeIcon = modal.querySelector('.close-icon');

  savedScrollPosition = window.pageYOffset;
  modalImage.src = src;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedScrollPosition}px`;
  document.body.style.width = '100%';
  document.getElementById('topButton').style.display = 'none';

  closeIcon.classList.remove('show');
  setTimeout(() => {
    closeIcon.classList.add('show');
  }, 100);
};

// 画像モーダルを閉じる関数
const closeImageModal = () => {
  const modal = document.getElementById('image-modal');
  modal.style.display = 'none';
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  window.scrollTo(0, savedScrollPosition);

  setTimeout(() => {
    handleScroll();
  }, 100);
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

// ハンバーガーメニュー関連 (更新)
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

  function toggleMenu() {
    hamburgerMenu.classList.toggle('active');
    mobileNav.classList.toggle('active');
    menuOverlay.classList.toggle('active');

    if (mobileNav.classList.contains('active')) {
      // メニューを開く時だけスクロールを禁止
      document.body.style.overflow = 'hidden';
    } else {
      // メニューを閉じる時はスクロールを許可
      document.body.style.overflow = '';
    }
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

// 遅延読み込みの追加部分

document.addEventListener('DOMContentLoaded', () => {
  const options = {
    root: null,
    rootMargin: '200px',
    threshold: 0.1
  };

  let isInitialSetup = true;

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

  const setupLazyLoading = () => {
    if (!isInitialSetup) {
      return;
    }

    const images = document.querySelectorAll('.card img:not(.loaded)');
    images.forEach((img, index) => {
      if (!img.classList.contains('loaded')) {
        img.style.opacity = '0';
        if (index < 20) {
          loadImage(img);
        } else {
          observer.observe(img);
        }
      }
    });
    isInitialSetup = false;
  };

  // 初期セットアップを遅延実行
  setTimeout(setupLazyLoading, 100);

  // フィルターや並び替え後に再セットアップ
  const resetLazyLoading = () => {
    observer.disconnect();
    isInitialSetup = true;
    setupLazyLoading();
  };

  // フィルターボタンにイベントリスナーを追加
  document.querySelectorAll('.filter-buttons button, .sort-buttons button').forEach((button) => {
    button.addEventListener('click', () => {
      setTimeout(resetLazyLoading, 100);
    });
  });

  // ページの完全な読み込み後にも確認
  window.addEventListener('load', () => {
    if (document.querySelectorAll('.card img:not(.loaded)').length > 0) {
      isInitialSetup = true;
      setupLazyLoading();
    }
  });
});

// 遅延読み込みの終わり部分
