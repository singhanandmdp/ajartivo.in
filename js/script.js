document.addEventListener("DOMContentLoaded", () => {

    /* ================= HEADER PATH ================= */

    const headerPath = window.location.pathname.includes("/about/")
        ? "../header.html"
        : "header.html";

    fetch(headerPath)
        .then(res => res.text())
        .then(data => {

            const container = document.getElementById("site-header");

            if (container) {
                container.innerHTML = data;

                initMenu();
                initSearch();
            }

        })
        .catch(err => console.log("Header load error:", err));


    /* ================= FOOTER PATH ================= */

    const footerPath = window.location.pathname.includes("/about/")
        ? "../footer.html"
        : "footer.html";

    fetch(footerPath)
        .then(res => res.text())
        .then(data => {

            const container = document.getElementById("site-footer");

            if (container) {
                container.innerHTML = data;
            }

        })
        .catch(err => console.log("Footer load error:", err));


    /* ================= SEARCH RESULTS PAGE ================= */

    initSearchResults();

});


/* ================= MENU LOGIC ================= */

function initMenu() {

    const menuBtn = document.querySelector(".menu-icon");
    const sidebar = document.getElementById("sidebarMenu");
    const overlay = document.getElementById("menuOverlay");

    if (!menuBtn || !sidebar || !overlay) return;

    menuBtn.addEventListener("click", () => {
        sidebar.classList.add("active");
        overlay.classList.add("active");
    });

    overlay.addEventListener("click", () => {
        sidebar.classList.remove("active");
        overlay.classList.remove("active");
    });

}


/* ================= SEARCH FUNCTION ================= */

function searchDesign(inputId){

    let input = document.getElementById(inputId);

    if(!input) return;

    let query = input.value;

    if(query.trim() !== ""){

        window.location.href =
        "search.html?q=" + encodeURIComponent(query);

    }

}


/* ================= ENTER KEY SEARCH ================= */

function initSearch(){

    const heroInput = document.getElementById("heroSearchInput");
    const headerInput = document.getElementById("headerSearchInput");

    if(heroInput){
        heroInput.addEventListener("keydown", function(e){

            if(e.key === "Enter"){
                searchDesign("heroSearchInput");
            }

        });
    }

    if(headerInput){
        headerInput.addEventListener("keydown", function(e){

            if(e.key === "Enter"){
                searchDesign("headerSearchInput");
            }

        });
    }

}


/* ================= QUICK SEARCH TAG ================= */

function quickSearch(keyword){

    const input = document.getElementById("heroSearchInput");

    if(!input) return;

    input.value = keyword;

    searchDesign("heroSearchInput");

}


/* ================= SEARCH RESULTS PAGE ================= */

function initSearchResults(){

    const container = document.getElementById("results");
    const title = document.getElementById("searchTitle");

    if(!container || !title) return;

    const params = new URLSearchParams(window.location.search);
    const query = params.get("q");

    if(!query) return;

    title.innerText = "Search Results for: " + query;


    const designs = [
        { title: "Birthday Banner", type: "PSD" },
        { title: "Business Logo", type: "AI" },
        { title: "Shop Banner", type: "PSD" },
        { title: "Election Poster", type: "PSD" },
        { title: "Business Card", type: "CDR" }
    ];


    designs.forEach(design => {

        if (design.title.toLowerCase().includes(query.toLowerCase())) {

            let card = `
            <div class="design-card">

                <div class="product-img">Preview</div>

                <div class="card-info">
                    <h3>${design.title}</h3>
                    <span class="file-type">${design.type}</span>
                </div>

            </div>
            `;

            container.innerHTML += card;

        }

    });

}