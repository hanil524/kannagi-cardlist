document.addEventListener("DOMContentLoaded", function () {
    const filterSeason = document.getElementById("filter-season");
    const cards = document.querySelectorAll(".card");

    filterSeason.addEventListener("change", function () {
        const selectedSeason = filterSeason.value;
        cards.forEach((card) => {
            if (selectedSeason === "all") {
                card.style.display = "block";
            } else {
                if (card.getAttribute("data-season") === selectedSeason) {
                    card.style.display = "block";
                } else {
                    card.style.display = "none";
                }
            }
        });
    });
});

document.addEventListener("DOMContentLoaded", function () {
    const cards = document.querySelectorAll(".card");
    const largeImage = document.getElementById("large-image");
    const largeImageContainer = document.querySelector(
        ".large-image-container"
    );

    cards.forEach((card) => {
        card.addEventListener("mouseover", function () {
            const imageUrl = card.querySelector("img").getAttribute("src");
            largeImage.setAttribute("src", imageUrl);
            largeImageContainer.style.display = "block";
        });

        card.addEventListener("mouseout", function () {
            largeImageContainer.style.display = "none";
        });
    });
});
