(function () {
    const services = window.AjArtivoFirebase;
    if (!services) return;

    const designList = document.getElementById("designList");
    const statusBox = document.getElementById("manageStatus");

    if (!designList || !statusBox) return;

    loadDesigns();

    async function loadDesigns() {
        try {
            const snapshot = await services.db.collection("designs")
                .orderBy("createdAt", "desc")
                .get();

            if (snapshot.empty) {
                designList.innerHTML = '<div class="empty-state-card">No designs found in Firestore.</div>';
                statusBox.textContent = "No uploaded designs";
                return;
            }

            designList.innerHTML = snapshot.docs.map(function (doc) {
                const data = doc.data();
                const title = escapeHtml(data.title || "Untitled Design");
                const category = escapeHtml(data.category || "Other");
                const price = Number(data.price || 0);
                const description = escapeHtml(data.description || "No description added yet.");
                const image = escapeHtml(data.image || "/images/trending1.jpg");
                const download = escapeHtml(data.download || "#");

                return `
                    <article class="storage-card">
                        <div class="storage-preview">
                            <img src="${image}" alt="${title}">
                        </div>
                        <div class="storage-content">
                            <strong>${title}</strong>
                            <span class="storage-meta">Category: ${category}</span>
                            <span class="storage-meta">Price: Rs ${price}</span>
                            <span class="storage-meta">Views: ${Number(data.views || 0)} | Downloads: ${Number(data.downloads || 0)}</span>
                            <p class="storage-description">${description}</p>
                            <a href="${download}" target="_blank" rel="noreferrer">Open Download Link</a>
                        </div>
                    </article>
                `;
            }).join("");

            statusBox.textContent = "Firestore designs loaded";
        } catch (error) {
            console.error("Manage designs load failed:", error);
            designList.innerHTML = '<div class="empty-state-card">Could not load Firestore data.</div>';
            statusBox.textContent = "Could not load designs";
        }
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
