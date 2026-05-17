(function () {
    function initPremiumPlanPage() {
        if (!document.body.classList.contains("premium-plans-page")) {
            return;
        }

        const statusNode = document.getElementById("premiumPlanStatus");
        const buttons = Array.from(document.querySelectorAll("[data-plan-id]"));
        if (!buttons.length) {
            return;
        }

        buttons.forEach(function (button) {
            button.addEventListener("click", async function () {
                const planId = String(button.getAttribute("data-plan-id") || "").trim();
                if (!planId || !window.AjArtivoPayment || typeof window.AjArtivoPayment.startPremiumPlanCheckout !== "function") {
                    setStatus(statusNode, "Premium checkout is not available right now.", "error");
                    return;
                }

                setBusy(buttons, true, button, "Opening...");
                setStatus(statusNode, "Opening secure premium checkout...", "success");

                try {
                    await window.AjArtivoPayment.startPremiumPlanCheckout(planId);
                    setStatus(statusNode, "Premium checkout opened successfully.", "success");
                } catch (error) {
                    setStatus(statusNode, error && error.message ? error.message : "Unable to start premium checkout.", "error");
                } finally {
                    setBusy(buttons, false);
                }
            });
        });
    }

    function setBusy(buttons, disabled, activeButton, label) {
        buttons.forEach(function (button) {
            button.disabled = disabled;
            button.textContent = disabled && button === activeButton
                ? label
                : readButtonLabel(button);
        });
    }

    function readButtonLabel(button) {
        const planId = String(button && button.getAttribute("data-plan-id") || "").trim();
        if (planId === "starter_149_15d") return "Choose Starter";
        if (planId === "basic_299_3m") return "Choose Basic";
        if (planId === "advanced_599_6m") return "Choose Advanced";
        return "Choose Ultimate";
    }

    function setStatus(node, message, tone) {
        if (!node) {
            return;
        }

        node.hidden = !message;
        node.textContent = message || "";
        node.classList.remove("is-success", "is-error");
        if (message) {
            node.classList.add(tone === "success" ? "is-success" : "is-error");
        }
    }

    document.addEventListener("DOMContentLoaded", initPremiumPlanPage);
})();
