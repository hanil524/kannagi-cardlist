document.addEventListener("DOMContentLoaded", () => {
    const searchBox = document.getElementById("search-box");
    const mobileSearchBox = document.getElementById("mobile-search-box");
    searchBox.addEventListener("input", filterCardsByName);
    mobileSearchBox.addEventListener("input", filterCardsByName);
});

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
    closeModal();
};

const filterCards = () => {
    const cards = document.querySelectorAll(".card");
    cards.forEach((card) => {
        let shouldDisplay = true;
        for (let attribute in filters) {
            if (filters[attribute].size > 0) {
                let cardAttributes = card.dataset[attribute].split(" ");
                let hasMatch = false;
                for (let filterValue of filters[attribute]) {
                    if (cardAttributes.includes(filterValue)) {
                        hasMatch = true;
                        break;
                    }
                }
                if (!hasMatch) {
                    shouldDisplay = false;
                    break;
                }
            }
        }
        if (shouldDisplay) {
            card.style.display = "";
        } else {
            card.style.display = "none";
        }
    });
};

const openModal = (filterId) => {
    const modal = document.getElementById("modal");
    const modalButtons = document.getElementById("modal-buttons");
    modalButtons.innerHTML = "";

    const filterContent = document
        .querySelector(`#${filterId} .filter-content`)
        .querySelectorAll("button");
    filterContent.forEach((button) => {
        const newButton = document.createElement("button");
        newButton.innerText = button.innerText;
        newButton.onclick = () => {
            toggleFilterCard(filterId, button.innerText);
            closeModal();
        };
        modalButtons.appendChild(newButton);
    });

    modal.style.display = "block";
};

const closeModal = () => {
    const modal = document.getElementById("modal");
    modal.style.display = "none";
};

const toggleMenu = () => {
    const mobileMenu = document.getElementById("mobile-menu");
    if (mobileMenu.style.display === "flex") {
        mobileMenu.style.display = "none";
    } else {
        mobileMenu.style.display = "flex";
    }
};

const toggleFilter = (filterId) => {
    const filterContent = document.getElementById(filterId);
    if (filterContent.style.display === "flex") {
        filterContent.style.display = "none";
    } else {
        filterContent.style.display = "flex";
    }
};
