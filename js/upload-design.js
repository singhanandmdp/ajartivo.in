(function () {
    const services = window.AjArtivoFirebase;
    if (!services) return;

    const uploadButton = document.getElementById("uploadBtn");
    const statusBox = document.getElementById("uploadStatus");

    if (!uploadButton || !statusBox) return;

    uploadButton.addEventListener("click", handleUpload);

    async function handleUpload() {
        const title = document.getElementById("designName")?.value.trim();
        const category = document.getElementById("designCategory")?.value;
        const price = Number(document.getElementById("designPrice")?.value || 0);
        const description = document.getElementById("designDescription")?.value.trim();
        const download = document.getElementById("designDownload")?.value.trim();
        const tagsInput = document.getElementById("designTags")?.value.trim();
        const previewFile = document.getElementById("designPreview")?.files?.[0];

        if (!title || !category || !description || !download || !previewFile) {
            statusBox.textContent = "Please complete all required fields.";
            return;
        }

        statusBox.textContent = "Uploading preview image...";

        try {
            const storageRef = services.storage.ref().child(`previews/${Date.now()}-${sanitizeFileName(previewFile.name)}`);
            const snapshot = await storageRef.put(previewFile);
            const imageUrl = await snapshot.ref.getDownloadURL();
            const tags = tagsInput
                ? tagsInput.split(",").map(function (tag) { return tag.trim(); }).filter(Boolean)
                : [];

            statusBox.textContent = "Saving design to Firestore...";

            await services.db.collection("designs").add({
                title,
                category,
                description,
                price: Number.isFinite(price) ? price : 0,
                image: imageUrl,
                download,
                tags,
                downloads: 0,
                views: 0,
                createdAt: services.timestamp()
            });

            resetForm();
            statusBox.textContent = "Design uploaded successfully.";
        } catch (error) {
            console.error("Upload failed:", error);
            statusBox.textContent = "Upload failed. Please try again.";
        }
    }

    function resetForm() {
        const fields = ["designName", "designPrice", "designDescription", "designDownload", "designTags", "designPreview"];
        fields.forEach(function (id) {
            const element = document.getElementById(id);
            if (!element) return;
            element.value = "";
        });

        const category = document.getElementById("designCategory");
        if (category) {
            category.value = "PSD";
        }
    }

    function sanitizeFileName(name) {
        return String(name || "preview").replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");
    }
})();
