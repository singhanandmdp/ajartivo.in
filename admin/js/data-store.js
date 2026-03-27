(function () {
  const KEYS = {
    designs: "ajartivo_designs",
    users: "ajartivo_users",
    payments: "ajartivo_payments"
  };

  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch (error) {
      return [];
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function uid(prefix) {
    return prefix + "_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  }

  function normalizeDesign(item) {
    return {
      ...item,
      price: Number(item.price || item.Price || 0),
      downloadCount: Number(item.downloadCount || 0)
    };
  }

  function normalizePayment(item) {
    const rawStatus = String(item.status || "").trim().toLowerCase();
    const status =
      rawStatus === "paid" ? "Paid" : rawStatus === "failed" ? "Failed" : "Pending";

    return {
      ...item,
      amount: Number(item.amount || 0),
      quantity: Math.max(1, Number(item.quantity || 1)),
      status: status
    };
  }

  function seed() {
    if (read(KEYS.designs).length === 0) {
      write(KEYS.designs, []);
    } else {
      write(KEYS.designs, read(KEYS.designs).map(normalizeDesign));
    }

    if (read(KEYS.users).length === 0) {
      write(KEYS.users, [
        {
          id: uid("usr"),
          name: "Anand Singh",
          email: "admin@ajartivo.com",
          role: "Super Admin",
          status: "Active",
          createdAt: new Date().toISOString()
        }
      ]);
    }

    if (read(KEYS.payments).length === 0) {
      write(KEYS.payments, []);
    } else {
      write(
        KEYS.payments,
        read(KEYS.payments)
          .filter(function (item) {
            return !(
              item &&
              item.payer === "Starter Customer" &&
              Number(item.amount || 0) === 499 &&
              item.status === "Paid"
            );
          })
          .map(normalizePayment)
      );
    }
  }

  const DataStore = {
    getDesigns: function () {
      return read(KEYS.designs).map(normalizeDesign);
    },
    getDesignById: function (id) {
      return (
        read(KEYS.designs)
          .map(normalizeDesign)
          .find(function (item) {
            return item.id === id;
          }) || null
      );
    },
    addDesign: function (design) {
      const items = read(KEYS.designs);
      items.unshift(
        normalizeDesign({
          id: uid("dsn"),
          createdAt: new Date().toISOString(),
          downloadCount: 0,
          ...design
        })
      );
      write(KEYS.designs, items);
      return items;
    },
    updateDesign: function (id, patch) {
      const items = read(KEYS.designs).map(function (item) {
        if (item.id !== id) {
          return normalizeDesign(item);
        }

        return normalizeDesign({
          ...item,
          ...patch,
          updatedAt: new Date().toISOString()
        });
      });

      write(KEYS.designs, items);
      return items;
    },
    deleteDesign: function (id) {
      const items = read(KEYS.designs).filter(function (item) {
        return item.id !== id;
      });
      write(KEYS.designs, items);
      return items;
    },
    incrementDesignDownloads: function (id, quantity) {
      const count = Math.max(1, Number(quantity || 1));
      const items = read(KEYS.designs).map(function (item) {
        if (item.id !== id) {
          return normalizeDesign(item);
        }

        return normalizeDesign({
          ...item,
          downloadCount: Number(item.downloadCount || 0) + count,
          updatedAt: new Date().toISOString()
        });
      });

      write(KEYS.designs, items);
      return items;
    },
    getUsers: function () {
      return read(KEYS.users);
    },
    addUser: function (user) {
      const items = read(KEYS.users);
      items.unshift({
        id: uid("usr"),
        createdAt: new Date().toISOString(),
        ...user
      });
      write(KEYS.users, items);
      return items;
    },
    deleteUser: function (id) {
      const items = read(KEYS.users).filter(function (item) {
        return item.id !== id;
      });
      write(KEYS.users, items);
      return items;
    },
    getPayments: function () {
      return read(KEYS.payments).map(normalizePayment);
    },
    addPayment: function (payment) {
      const items = read(KEYS.payments);
      items.unshift(
        normalizePayment({
          id: uid("pay"),
          createdAt: new Date().toISOString(),
          ...payment
        })
      );
      write(KEYS.payments, items);
      return items;
    }
  };

  seed();
  window.DataStore = DataStore;
})();
