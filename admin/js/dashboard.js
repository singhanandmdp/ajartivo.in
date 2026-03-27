document.addEventListener("DOMContentLoaded", async function () {
  if (document.body.dataset.page !== "dashboard") {
    return;
  }

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

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function aggregatePerformance(designs, payments) {
    const designMap = {};

    designs.forEach(function (design) {
      designMap[design.id] = {
        id: design.id,
        name: design.name || "Untitled Design",
        downloads: 0,
        baseDownloads: Number(design.downloadCount || 0),
        revenue: 0
      };
    });

    payments.forEach(function (payment) {
      const quantity = Math.max(1, Number(payment.quantity || 1));
      const designId = payment.designId || "manual_" + (payment.designName || "Manual");
      if (!designMap[designId]) {
        designMap[designId] = {
          id: designId,
          name: payment.designName || "Manual Entry",
          downloads: 0,
          revenue: 0
        };
      }

      if (payment.status === "Paid") {
        designMap[designId].downloads += quantity;
        designMap[designId].revenue += Number(payment.amount || 0);
      }
    });

    return Object.values(designMap)
      .map(function (item) {
        return {
          id: item.id,
          name: item.name,
          downloads: item.downloads || item.baseDownloads || 0,
          revenue: item.revenue
        };
      })
      .sort(function (a, b) {
      return b.downloads - a.downloads || b.revenue - a.revenue;
      });
  }

  function renderStats(designs, users, payments, performance) {
    const paidPayments = payments.filter(function (item) {
      return item.status === "Paid";
    });
    const revenue = paidPayments.reduce(function (sum, item) {
      return sum + Number(item.amount || 0);
    }, 0);
    const totalDownloads = performance.reduce(function (sum, item) {
      return sum + Number(item.downloads || 0);
    }, 0);

    const stats = [
      { title: "Total Designs", value: designs.length, hint: "All uploaded assets" },
      { title: "Admin Users", value: users.length, hint: "Access panel users" },
      { title: "Current Payments", value: payments.length, hint: "Stored payment entries" },
      { title: "Revenue", value: window.AdminApp.formatCurrency(revenue), hint: "Paid sales only" },
      { title: "Total Downloads", value: totalDownloads, hint: "Paid download count" }
    ];

    const statsRow = document.getElementById("statsRow");
    statsRow.innerHTML = stats
      .map(function (stat) {
        return (
          "<article class='panel stat-card'>" +
          "<h3>" + stat.title + "</h3>" +
          "<p>" + stat.value + "</p>" +
          "<small>" + stat.hint + "</small>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderRecentUploads(designs, performance) {
    const downloadsById = {};
    performance.forEach(function (item) {
      downloadsById[item.id] = item.downloads;
    });

    const recentRows = document.getElementById("recentUploads");
    const recent = designs.slice(0, 5);
    if (recent.length === 0) {
      recentRows.innerHTML = "<tr><td colspan='5' class='empty'>No designs uploaded yet.</td></tr>";
      return;
    }

    recentRows.innerHTML = recent
      .map(function (item) {
        return (
          "<tr>" +
          "<td>" + escapeHtml(item.name) + "</td>" +
          "<td>" + escapeHtml(item.category) + "</td>" +
          "<td>" + window.AdminApp.formatCurrency(item.price) + "</td>" +
          "<td>" + Number(downloadsById[item.id] || item.downloadCount || 0) + "</td>" +
          "<td>" + window.AdminApp.formatDate(item.createdAt) + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderBarChart(containerId, items, key, formatter, emptyText) {
    const container = document.getElementById(containerId);
    const filtered = items
      .filter(function (item) {
        return Number(item[key] || 0) > 0;
      })
      .slice(0, 5);

    if (filtered.length === 0) {
      container.innerHTML = "<p class='empty'>" + emptyText + "</p>";
      return;
    }

    const maxValue = Math.max.apply(
      null,
      filtered.map(function (item) {
        return Number(item[key] || 0);
      })
    );

    container.innerHTML =
      "<div class='chart-bars'>" +
      filtered
        .map(function (item) {
          const value = Number(item[key] || 0);
          const height = maxValue > 0 ? Math.max(16, Math.round((value / maxValue) * 160)) : 16;
          return (
            "<div class='chart-column'>" +
            "<span class='chart-value'>" + formatter(value) + "</span>" +
            "<div class='chart-bar-wrap'><div class='chart-bar' style='height:" + height + "px'></div></div>" +
            "<span class='chart-label'>" + escapeHtml(item.name) + "</span>" +
            "</div>"
          );
        })
        .join("") +
      "</div>";
  }

  function renderTopPerformance(performance) {
    const target = document.getElementById("topPerformance");
    const topItems = performance.slice(0, 6);

    if (topItems.length === 0) {
      target.innerHTML = "<tr><td colspan='3' class='empty'>No design performance data yet.</td></tr>";
      return;
    }

    target.innerHTML = topItems
      .map(function (item) {
        return (
          "<tr>" +
          "<td>" + escapeHtml(item.name) + "</td>" +
          "<td>" + Number(item.downloads || 0) + "</td>" +
          "<td>" + window.AdminApp.formatCurrency(item.revenue || 0) + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderPaymentSnapshot(payments) {
    const paid = payments.filter(function (item) {
      return item.status === "Paid";
    });
    const pending = payments.filter(function (item) {
      return item.status === "Pending";
    });
    const failed = payments.filter(function (item) {
      return item.status === "Failed";
    });
    const paidRevenue = paid.reduce(function (sum, item) {
      return sum + Number(item.amount || 0);
    }, 0);
    const paidDownloads = paid.reduce(function (sum, item) {
      return sum + Math.max(1, Number(item.quantity || 1));
    }, 0);

    document.getElementById("paymentSnapshot").innerHTML = [
      { label: "Paid Orders", value: paid.length },
      { label: "Pending Orders", value: pending.length },
      { label: "Failed Orders", value: failed.length },
      { label: "Sold Amount", value: window.AdminApp.formatCurrency(paidRevenue) },
      { label: "Downloaded Qty", value: paidDownloads }
    ]
      .map(function (item) {
        return (
          "<div class='metric-item'>" +
          "<span>" + item.label + "</span>" +
          "<strong>" + item.value + "</strong>" +
          "</div>"
        );
      })
      .join("");
  }

  const designs = await getDesignsSafe();
  const users = window.AdminData && typeof window.AdminData.getUsers === "function"
    ? await window.AdminData.getUsers().catch(function () { return window.DataStore.getUsers(); })
    : window.DataStore.getUsers();
  const payments = await getPaymentsSafe();
  const performance = aggregatePerformance(designs, payments);

  renderStats(designs, users, payments, performance);
  renderRecentUploads(designs, performance);
  renderBarChart(
    "salesChart",
    performance.slice().sort(function (a, b) {
      return b.revenue - a.revenue;
    }),
    "revenue",
    function (value) {
      return window.AdminApp.formatCurrency(value);
    },
    "No paid sales data available yet."
  );
  renderBarChart(
    "downloadsChart",
    performance,
    "downloads",
    function (value) {
      return String(value);
    },
    "No downloads recorded yet."
  );
  renderTopPerformance(performance);
  renderPaymentSnapshot(payments);

  const session = window.AdminApp.getSession();
  if (session) {
    document.getElementById("adminName").textContent = session.username;
  }
});
