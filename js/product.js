const params = new URLSearchParams(window.location.search);
const name = params.get("name");

fetch("designs.json")
.then(res => res.json())
.then(data => {

    const design = data.find(d => d.name === name);

    if(!design) return;

    document.querySelector(".product-info h1").innerText = design.name;

    document.getElementById("mainImage").src = design.preview1;

    const thumbs = document.querySelectorAll(".thumbnail-row img");

    thumbs[0].src = design.preview1;
    thumbs[1].src = design.preview2;
    thumbs[2].src = design.preview3;

    const btn = document.querySelector(".download-btn");
    btn.onclick = () => {
        window.open(design.download, "_blank");
    };

});