document.addEventListener("DOMContentLoaded", () => {
  fetch("header.html")
    .then(r => r.text())
    .then(h => {
      document.getElementById("site-header").innerHTML = h;

      const menuBtn = document.getElementById("menuBtn");
      const sidebar = document.getElementById("sidebarMenu");
      const overlay = document.getElementById("menuOverlay");

      if (!menuBtn || !sidebar || !overlay) return;

      menuBtn.onclick = () => {
        sidebar.classList.add("active");
        overlay.classList.add("active");
      };

      overlay.onclick = () => {
        sidebar.classList.remove("active");
        overlay.classList.remove("active");
      };
    });
});
