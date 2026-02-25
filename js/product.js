const previewBox = document.querySelector(".preview-box");
const mainImage = document.getElementById("mainImage");

previewBox.addEventListener("mousemove", (e) => {
    const rect = previewBox.getBoundingClientRect();

    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    mainImage.style.transformOrigin = `${x}% ${y}%`;
    mainImage.style.transform = "scale(2)";
});

previewBox.addEventListener("mouseleave", () => {
    mainImage.style.transform = "scale(1)";
});

/* Thumbnail click */
function changeImage(el) {
    mainImage.src = el.src;
    mainImage.style.transform = "scale(1)";
}
