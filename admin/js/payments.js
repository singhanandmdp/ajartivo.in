document.addEventListener("DOMContentLoaded", async function () {
  if (document.body.dataset.page !== "payments") {
    return;
  }

  const form = document.getElementById("paymentForm");
  const table = document.getElementById("paymentsTable");
  const revenueBadge = document.getElementById("revenueBadge");
  const designSelect = document.getElementById("designId");
  const quantityInput = document.getElementById("quantity");
  const amountInput = document.getElementById("amount");

  async function getDesignsSafe() {
    const store = window.AdminData || { connected: false };
    if (store.connected && typeof store.getDesigns === "function") {
      try {
        return await store.getDesigns();
      } catch (error) {
        return window.DataStore.getDesigns();
      }
    }
    return window.DataStore.getDesigns();
  }

  async function getPaymentsSafe() {
    const store = window.AdminData || { connected: false };
    if (store.connected && typeof store.getPayments === "function") {
      try {
        return await store.getPayments();
      } catch (error) {
        return window.DataStore.getPayments();
      }
    }
    return window.DataStore.getPayments();
  }

  async function addPaymentSafe(payload) {
    const store = window.AdminData || { connected: false };
    if (store.connected && typeof store.addPayment === "function") {
      try {
        await store.addPayment(payload);
        return;
      } catch (error) {
        window.DataStore.addPayment(payload);
        return;
      }
    }
    window.DataStore.addPayment(payload);
  }

  async function incrementDesignDownloadsSafe(id, quantity) {
    const store = window.AdminData || { connected: false };
    if (store.connected && typeof store.incrementDesignDownloads === "function") {
      try {
        await store.incrementDesignDownloads(id, quantity);
        return;
      } catch (error) {
        if (window.DataStore.incrementDesignDownloads) {
          window.DataStore.incrementDesignDownloads(id, quantity);
        }
        return;
      }
    }

    if (window.DataStore.incrementDesignDownloads) {
      window.DataStore.incrementDesignDownloads(id, quantity);
    }
  }

  function statusClass(status) {
    if (status === "Paid") {
      return "status-pill status-success";
    }
    if (status === "Pending") {
      return "status-pill status-warning";
    }
    return "status-pill status-danger";
  }

  function getSelectedDesign(designs) {
    return (
      designs.find(function (item) {
        return item.id === designSelect.value;
      }) || null
    );
  }

  function updateAmount(designs) {
    const selectedDesign = getSelectedDesign(designs);
    const quantity = Math.max(1, Number(quantityInput.value || 1));
    const unitPrice = Number(selectedDesign && selectedDesign.price ? selectedDesign.price : 0);
    amountInput.value = String(unitPrice * quantity);
  }

  function populateDesigns(designs) {
    if (designs.length === 0) {
      designSelect.innerHTML = "<option value=''>No designs available</option>";
      form.querySelector("button[type='submit']").disabled = true;
      return;
    }

    designSelect.innerHTML =
      "<option value=''>Select design</option>" +
      designs
        .map(function (item) {
          const label = item.name + " (" + window.AdminApp.formatCurrency(item.price || 0) + ")";
          return "<option value='" + item.id + "'>" + label + "</option>";
        })
        .join("");

    form.querySelector("button[type='submit']").disabled = false;
  }

  function render(payments) {
    if (payments.length === 0) {
      table.innerHTML = "<tr><td colspan='7' class='empty'>No payments available.</td></tr>";
      revenueBadge.textContent = "Revenue: INR 0 | Paid Orders: 0";
      return;
    }

    table.innerHTML = payments
      .map(function (item) {
        return (
          "<tr>" +
          "<td>" + (item.designName || "Manual") + "</td>" +
          "<td>" + item.payer + "</td>" +
          "<td>" + Number(item.quantity || 1) + "</td>" +
          "<td>" + window.AdminApp.formatCurrency(item.amount) + "</td>" +
          "<td>" + item.method + "</td>" +
          "<td><span class='" + statusClass(item.status) + "'>" + item.status + "</span></td>" +
          "<td>" + window.AdminApp.formatDate(item.createdAt) + "</td>" +
          "</tr>"
        );
      })
      .join("");

    const paidPayments = payments.filter(function (item) {
      return item.status === "Paid";
    });
    const revenue = paidPayments.reduce(function (sum, item) {
      return sum + Number(item.amount || 0);
    }, 0);
    revenueBadge.textContent =
      "Revenue: " +
      window.AdminApp.formatCurrency(revenue) +
      " | Paid Orders: " +
      paidPayments.length;
  }

  const designs = await getDesignsSafe();
  populateDesigns(designs);
  render(await getPaymentsSafe());
  updateAmount(designs);

  designSelect.addEventListener("change", function () {
    updateAmount(designs);
  });

  quantityInput.addEventListener("input", function () {
    if (Number(quantityInput.value || 0) < 1) {
      quantityInput.value = "1";
    }
    updateAmount(designs);
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const selectedDesign = getSelectedDesign(designs);
    if (!selectedDesign) {
      return;
    }

    const quantity = Math.max(1, Number(quantityInput.value || 1));
    const amount = Number(amountInput.value || 0);
    const status = form.paymentStatus.value;

    const payload = {
      payer: form.payer.value.trim(),
      designId: selectedDesign.id,
      designName: selectedDesign.name,
      quantity: quantity,
      amount: amount,
      method: form.method.value,
      status: status
    };

    await addPaymentSafe(payload);

    if (status === "Paid") {
      await incrementDesignDownloadsSafe(selectedDesign.id, quantity);
    }

    form.reset();
    quantityInput.value = "1";
    amountInput.value = "";
    updateAmount(designs);
    render(await getPaymentsSafe());
  });
});
