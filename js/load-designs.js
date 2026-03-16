(function () {
    const services = window.AjArtivoFirebase;
    if (!services) return;

    const { db } = services;
    const trendingGrid = document.getElementById("trendingGrid");
    const popularGrid = document.getElementById("popularDesignGrid");

    if (!trendingGrid && !popularGrid) return;

    loadHomepageDesigns();

    async function loadHomepageDesigns() {
        try {
            const snapshot = await db.collection("designs")
                .orderBy("createdAt", "desc")
                .limit(8)
                .get();

            const designs = snapshot.docs.map(function (doc) {
                return { id: doc.id, ...doc.data() };
            });

            if (trendingGrid) {
                renderDesignCards(trendingGrid, designs.slice(0, 4), "trending");
            }

            if (popularGrid) {
                const popularDesigns = [...designs]
                    .sort(function (a, b) {
                        return Number(b.downloads || 0) - Number(a.downloads || 0);
                    })
                    .slice(0, 4);

                renderDesignCards(popularGrid, popularDesigns, "popular");
            }
        } catch (error) {
            console.error("Failed to load designs:", error);
            if (trendingGrid) {
                trendingGrid.innerHTML = '<div class="empty-state">Could not load designs right now.</div>';
            }
            if (popularGrid) {
                popularGrid.innerHTML = '<div class="empty-state">Could not load popular designs right now.</div>';
            }
        }
    }

    function renderDesignCards(container, designs, variant) {
        if (!designs.length) {
            container.innerHTML = '<div class="empty-state">No designs found yet.</div>';
            return;
        }

        container.innerHTML = designs.map(function (design) {
            const type = escapeHtml(design.category || "Other");
            const title = escapeHtml(design.title || "Untitled Design");
            const image = escapeHtml(design.image || "/images/trending1.jpg");
            const price = formatPrice(design.price);
            const docId = encodeURIComponent(design.id);
            const productUrl = `/product.html?id=${docId}`;

            if (variant === "popular") {
                return `
                    <article class="product-card homepage-design-card">
                        <a href="${productUrl}" class="card-link homepage-card-link">
                            <img src="${image}" alt="${title}" class="homepage-card-image">
                            <h3>${title}</h3>
                        </a>
                        <div class="homepage-card-meta">
                            <span class="tag ${type.toLowerCase()}">${type}</span>
                            <strong class="homepage-card-price">${price}</strong>
                        </div>
                        <button class="download-btn homepage-download-btn" type="button" data-download="${escapeHtml(design.download || "")}" data-id="${docId}">
                            Download
                        </button>
                    </article>
                `;
            }

            return `
                <article class="design-card homepage-design-card">
                    <a href="${productUrl}" class="card-link homepage-card-link">
                        <img src="${image}" alt="${title}">
                        <div class="card-info">
                            <h3>${title}</h3>
                            <div class="homepage-card-meta">
                                <span class="file-type ${type.toLowerCase()}">${type}</span>
                                <strong class="homepage-card-price">${price}</strong>
                            </div>
                        </div>
                    </a>
                    <div class="homepage-card-actions">
                        <button class="download-btn homepage-download-btn" type="button" data-download="${escapeHtml(design.download || "")}" data-id="${docId}">
                            Download
                        </button>
                    </div>
                </article>
            `;
        }).join("");

        bindDownloadButtons(container);
    }

    function bindDownloadButtons(scope) {
        scope.querySelectorAll(".homepage-download-btn").forEach(function (button) {
            button.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();

                const docId = button.getAttribute("data-id");
                const downloadUrl = button.getAttribute("data-download");

                if (!downloadUrl) {
                    alert("Download link is not available yet.");
                    return;
                }

                db.collection("designs").doc(docId).update({
                    downloads: services.increment(1)
                }).catch(function (error) {
                    console.error("Failed to update downloads:", error);
                }).finally(function () {
                    window.open(downloadUrl, "_blank", "noopener");
                });
            });
        });
    }

    function formatPrice(price) {
        const value = Number(price);
        return Number.isFinite(value) && value > 0 ? `Rs. ${value}` : "Free";
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})();
