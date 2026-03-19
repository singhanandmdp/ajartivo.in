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
                        </div>
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
                            </div>
                        </div>
                    </a>
                </article>
            `;
        }).join("");
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
