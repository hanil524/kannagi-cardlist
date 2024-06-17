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

  // PC版の検索ボックスにイベントリスナーを追加
  const searchBox = document.getElementById('search-box');
  searchBox.addEventListener('input', filterCardsByName);

  // モバイル版の検索ボックスにイベントリスナーを追加
  const mobileSearchBox = document.getElementById('mobile-search-box');
  mobileSearchBox.addEventListener('input', filterCardsByName);

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
      const value = button.innerText.trim();
      toggleFilterCard(attribute, value);
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

  // 初期表示範囲の画像を選択し、それ以外の画像は遅延読み込み
  const initialImages = document.querySelectorAll('#card-list .card:nth-child(-n+10) img'); // 初期表示範囲の画像を選択
  const lazyImages = document.querySelectorAll('#card-list .card:nth-child(n+11) img'); // それ以降の画像

  // 初期表示範囲の画像は通常読み込み
  initialImages.forEach((img) => {
    const src = img.getAttribute('data-src');
    if (src) {
      img.src = src;
      img.removeAttribute('data-src');
    }
  });

  // それ以降の画像は遅延読み込みを設定
  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.getAttribute('data-src');
        img.removeAttribute('data-src');
        img.alt = img.getAttribute('data-alt'); // alt属性を復元
        observer.unobserve(img);
      }
    });
  });

  lazyImages.forEach((img) => {
    img.src = ''; // プレースホルダー画像を使わずにsrc属性を空に設定
    img.alt = ''; // alt属性を一時的に空に設定
    observer.observe(img);
  });
});

// カード名でのフィルタリングを行う関数
const filterCardsByName = (event) => {
  const query = event.target.value.toLowerCase();
  const cards = document.querySelectorAll('.card');
  cards.forEach((card) => {
    const name = card.dataset.name.toLowerCase();
    const attributes = card.dataset.attribute ? card.dataset.attribute.toLowerCase() : '';
    card.style.display = name.includes(query) || attributes.includes(query) ? 'block' : 'none';
  });
};

// カードのソートを行う関数
const sortCards = (criteria) => {
  if (sortCriteria === criteria) {
    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    sortCriteria = criteria;
    sortOrder = criteria === 'number' ? 'desc' : 'asc'; // 'number'の場合、初回は'降順'に設定
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

// フィルターをリセットする関数
const resetFilters = () => {
  Object.keys(filters).forEach((key) => filters[key].clear());
  const cards = document.querySelectorAll('.card');
  cards.forEach((card) => (card.style.display = 'block')); // すべてのカードを再表示
  document.getElementById('no-cards-message').style.display = 'none';
  resetSort();
};

// ソートをリセットする関数
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

// フィルター条件をトグルする関数
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

// カードをフィルタリングする関数
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

// スクロールバーの幅を取得する関数
const getScrollbarWidth = () => {
  const outer = document.createElement('div');
  outer.style.visibility = 'hidden';
  outer.style.width = '100px';
  outer.style.msOverflowStyle = 'scrollbar'; // for Internet Explorer
  document.body.appendChild(outer);

  const widthNoScroll = outer.offsetWidth;
  // Force scrollbars
  outer.style.overflow = 'scroll';

  // Add inner div
  const inner = document.createElement('div');
  inner.style.width = '100%';
  outer.appendChild(inner);

  const widthWithScroll = inner.offsetWidth;

  // Remove divs
  outer.parentNode.removeChild(outer);

  return widthNoScroll - widthWithScroll;
};

// モーダルを開く関数を更新
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
    modalButtons.appendChild(newButton);
  });

  const scrollbarWidth = getScrollbarWidth();
  modal.style.display = 'block';
  scrollPosition = window.pageYOffset; // スクロール位置を保存
  document.body.style.paddingRight = `${scrollbarWidth}px`; // スクロールバー幅分のパディングを追加
  document.body.classList.add('modal-open'); // クラスを追加してスクロールを無効にし、パディングを追加
};

// モーダルを閉じる関数を更新
const closeModal = () => {
  const modal = document.getElementById('modal');
  modal.style.display = 'none';
  document.body.classList.remove('modal-open'); // クラスを削除してスクロールを有効に戻し、パディングをリセット
  window.scrollTo(0, scrollPosition); // スクロール位置を復元
  document.body.style.top = '';
  document.body.style.paddingRight = ''; // パディングをリセット
};

// 背景をタップしてモーダルを閉じる関数
const closeModalOnClick = (event) => {
  if (event.target.id === 'modal') {
    closeModal();
  }
};

// 画像モーダルを開く関数
const openImageModal = (src) => {
  const modal = document.getElementById('image-modal');
  const modalImage = document.getElementById('modal-image');
  modalImage.src = src;
  modal.style.display = 'flex';
  scrollPosition = window.pageYOffset; // スクロール位置を保存
  document.body.style.top = `-${scrollPosition}px`;
  document.body.classList.add('no-scroll'); // スクロールを無効にする
};

// 画像モーダルを閉じる関数
const closeImageModal = () => {
  const modal = document.getElementById('image-modal');
  modal.style.display = 'none';
  document.body.classList.remove('no-scroll'); // スクロールを有効に戻す
  window.scrollTo(0, scrollPosition); // スクロール位置を復元
  document.body.style.top = '';
};

// ページの上部にスクロールする関数
const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// スクロール時にボタンを表示・非表示にする関数
const handleScroll = () => {
  const topButton = document.getElementById('topButton');
  if (window.pageYOffset > 300) {
    topButton.classList.add('show');
  } else {
    topButton.classList.remove('show');
  }
};

// スクロールイベントリスナーを追加
window.addEventListener('scroll', handleScroll);
