// ページがロードされた際の初期設定
console.log("JavaScript is loaded");

// フィルター条件を保持するオブジェクト
const filters = {
    series: new Set(),
    season: new Set(),
    type: new Set(),
    role: new Set(),
    keyword: new Set(),
    attribute: new Set(),
};

// ソート条件を保持する変数
let sortCriteria = null;
let sortOrder = "asc";

// ページロード後にDOMの初期設定を行う
document.addEventListener("DOMContentLoaded", () => {
    // 検索ボックスにイベントリスナーを追加
    const searchBox = document.getElementById("search-box");
    searchBox.addEventListener("input", filterCardsByName);

    // カード画像にクリックイベントを追加（モバイル用）
    const cards = document.querySelectorAll(".card img");
    cards.forEach((card) => {
        card.addEventListener("click", () => {
            if (window.innerWidth <= 768) {
                openImageModal(card.src);
            }
        });
    });

    // フィルターボタンにクリックイベントを追加
    const filterButtons = document.querySelectorAll(".filter-buttons button");
    filterButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            const attribute = button.getAttribute("data-filter");
            const value = button.innerText.trim();
            toggleFilterCard(attribute, value);
        });
    });

    // モーダルボタンにクリックイベントを追加
    const modalButtons = document.querySelectorAll(".filter-group button");
    modalButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            const match = button
                .getAttribute("onclick")
                .match(/openModal\('(.+?)'\)/);
            if (match) {
                const filterId = match[1];
                openModal(filterId);
            }
        });
    });
});

// カード名でのフィルタリングを行う関数
const filterCardsByName = (event) => {
    const query = event.target.value.toLowerCase();
    const cards = document.querySelectorAll(".card");
    cards.forEach((card) => {
        const name = card.dataset.name.toLowerCase();
        card.style.display = name.includes(query) ? "block" : "none";
    });
};

// カードのソートを行う関数
const sortCards = (criteria) => {
    if (sortCriteria === criteria) {
        sortOrder = sortOrder === "asc" ? "desc" : "asc";
    } else {
        sortCriteria = criteria;
        sortOrder = criteria === "number" ? "desc" : "asc"; // 'number'の場合、初回は'降順'に設定
    }

    const cardList = document.getElementById("card-list");
    const cards = Array.from(document.querySelectorAll(".card"));
    cards.sort((a, b) => {
        const aValue = parseInt(a.dataset[criteria]);
        const bValue = parseInt(b.dataset[criteria]);
        return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
    });
    cards.forEach((card) => cardList.appendChild(card));
};

// フィルターをリセットする関数
const resetFilters = () => {
    Object.keys(filters).forEach((key) => filters[key].clear());
    const cards = document.querySelectorAll(".card");
    cards.forEach((card) => (card.style.display = "block")); // すべてのカードを再表示
    document.getElementById("no-cards-message").style.display = "none";
    resetSort();
};

// ソートをリセットする関数
const resetSort = () => {
    sortCriteria = null;
    sortOrder = "asc";
    const cardList = document.getElementById("card-list");
    const cards = Array.from(document.querySelectorAll(".card"));
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
    const cards = document.querySelectorAll(".card");
    let anyVisible = false;
    cards.forEach((card) => {
        let shouldDisplay = true;
        for (const [attribute, values] of Object.entries(filters)) {
            if (values.size > 0) {
                const cardAttribute = card.getAttribute(`data-${attribute}`);
                const cardAttributes = cardAttribute
                    ? cardAttribute.split(" ")
                    : [];
                const matches =
                    values.has(cardAttribute) ||
                    cardAttributes.some((attr) => values.has(attr));
                if (!matches) {
                    shouldDisplay = false;
                    break;
                }
            }
        }
        card.style.display = shouldDisplay ? "block" : "none";
        if (shouldDisplay) {
            anyVisible = true;
        }
    });

    document.getElementById("no-cards-message").style.display = anyVisible
        ? "none"
        : "block";
};

// モーダルを開く関数
const openModal = (filterId) => {
    const modal = document.getElementById("modal");
    const modalButtons = document.getElementById("modal-buttons");
    modalButtons.innerHTML = "";

    const filterElement = document.getElementById(filterId);
    if (!filterElement) {
        console.error(`Element with id ${filterId} not found`);
        return;
    }

    const filterContent = filterElement.querySelectorAll("button");
    filterContent.forEach((button) => {
        const newButton = document.createElement("button");
        newButton.innerText = button.innerText;
        newButton.onclick = () => {
            toggleFilterCard(filterId, button.innerText.trim());
            closeModal();
        };
        modalButtons.appendChild(newButton);
    });

    modal.style.display = "block";
};

// モーダルを閉じる関数
const closeModal = () => {
    const modal = document.getElementById("modal");
    modal.style.display = "none";
};

// 画像モーダルを開く関数
const openImageModal = (src) => {
    const modal = document.getElementById("image-modal");
    const modalImage = document.getElementById("modal-image");
    modalImage.src = src;
    modal.style.display = "flex";
};

// 画像モーダルを閉じる関数
const closeImageModal = () => {
    const modal = document.getElementById("image-modal");
    modal.style.display = "none";
};
