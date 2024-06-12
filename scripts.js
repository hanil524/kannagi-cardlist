console.log("JavaScript is loaded");

const filters = {
    series: new Set(),
    season: new Set(),
    type: new Set(),
    role: new Set(),
    keyword: new Set(),
    attribute: new Set(),
};

let sortCriteria = null;
let sortOrder = "asc";

document.addEventListener("DOMContentLoaded", () => {
    const searchBox = document.getElementById("search-box");
    searchBox.addEventListener("input", filterCardsByName);

    const cards = document.querySelectorAll(".card img");
    cards.forEach((card) => {
        card.addEventListener("click", () => {
            if (window.innerWidth <= 768) {
                openImageModal(card.src);
            }
        });
    });

    const filterButtons = document.querySelectorAll(".filter-buttons button");
    filterButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const attribute = button.parentNode.getAttribute("data-attribute");
            const value = button.innerText.trim();
            toggleFilterCard(attribute, value);
        });
    });

    const modalButtons = document.querySelectorAll(".filter-group button");
    modalButtons.forEach((button) => {
        button.addEventListener("click", () => {
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

const filterCardsByName = (event) => {
    const query = event.target.value.toLowerCase();
    const cards = document.querySelectorAll(".card");
    cards.forEach((card) => {
        const name = card.dataset.name.toLowerCase();
        if (name.includes(query)) {
            card.style.display = "";
        } else {
            card.style.display = "none";
        }
    });
};

const sortCards = (criteria) => {
    if (sortCriteria === criteria) {
        sortOrder = sortOrder === "asc" ? "desc" : "asc";
    } else {
        sortCriteria = criteria;
        sortOrder = "asc";
    }

    const cardList = document.getElementById("card-list");
    const cards = Array.from(document.querySelectorAll(".card"));
    cards.sort((a, b) => {
        const aValue = parseInt(a.dataset[criteria]);
        const bValue = parseInt(b.dataset[criteria]);
        if (sortOrder === "asc") {
            return aValue - bValue;
        } else {
            return bValue - aValue;
        }
    });
    cards.forEach((card) => cardList.appendChild(card));
};

const resetFilters = () => {
    Object.keys(filters).forEach((key) => filters[key].clear());
    const cards = document.querySelectorAll(".card");
    cards.forEach((card) => (card.style.display = ""));
    document.getElementById("no-cards-message").style.display = "none";
    resetSort();
};

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

const toggleFilterCard = (attribute, value) => {
    if (filters[attribute].has(value)) {
        filters[attribute].delete(value);
    } else {
        filters[attribute].add(value);
    }
    filterCards();
};

const filterCards = () => {
    const cards = document.querySelectorAll(".card");
    let anyVisible = false;
    cards.forEach((card) => {
        let shouldDisplay = true;
        for (const [attribute, values] of Object.entries(filters)) {
            if (values.size > 0) {
                const cardAttribute = card.getAttribute(`data-${attribute}`);
                const cardAttributes = cardAttribute.split(" "); // 複数の属性を考慮
                if (
                    !values.has(cardAttribute) &&
                    !cardAttributes.some((attr) => values.has(attr))
                ) {
                    shouldDisplay = false;
                    break;
                }
            }
        }
        card.style.display = shouldDisplay ? "" : "none";
        if (shouldDisplay) {
            anyVisible = true;
        }
    });

    document.getElementById("no-cards-message").style.display = anyVisible
        ? "none"
        : "block";
};

const openModal = (filterId) => {
    console.log(`openModal called with filterId: ${filterId}`);
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
    console.log("Modal should be visible now");
};

const closeModal = () => {
    console.log("closeModal called");
    const modal = document.getElementById("modal");
    modal.style.display = "none";
};

const openImageModal = (src) => {
    const modal = document.getElementById("image-modal");
    const modalImage = document.getElementById("modal-image");
    modalImage.src = src;
    modal.style.display = "flex";
};

const closeImageModal = () => {
    const modal = document.getElementById("image-modal");
    modal.style.display = "none";
};
