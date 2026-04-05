document.addEventListener("DOMContentLoaded", function () {
  if (document.body.dataset.page !== "users") {
    return;
  }

  const form = document.getElementById("userForm");
  const table = document.getElementById("usersTable");

  function statusClass(status) {
    if (status === "Active") {
      return "status-pill status-success";
    }
    if (status === "Pending") {
      return "status-pill status-warning";
    }
    return "status-pill status-danger";
  }

  function formatRole(role) {
    const value = String(role || "").trim().toLowerCase();
    if (value === "admin") {
      return "Admin";
    }
    if (value === "moderator") {
      return "Moderator";
    }
    return "User";
  }

  function normalizeManageableRole(role) {
    const value = String(role || "").trim().toLowerCase();
    if (value === "moderator") {
      return "moderator";
    }
    return "user";
  }

  async function getUsersSafe() {
    const store = window.AdminData || { connected: false };
    if (store.connected && typeof store.getUsers === "function") {
      try {
        return await store.getUsers();
      } catch (error) {
        return window.DataStore.getUsers();
      }
    }
    return window.DataStore.getUsers();
  }

  async function addUserSafe(payload) {
    const store = window.AdminData || { connected: false };
    if (store.connected && typeof store.addUser === "function") {
      try {
        await store.addUser(payload);
        return;
      } catch (error) {
        window.DataStore.addUser(payload);
        return;
      }
    }
    window.DataStore.addUser(payload);
  }

  async function deleteUserSafe(id) {
    const store = window.AdminData || { connected: false };
    if (store.connected && typeof store.deleteUser === "function") {
      try {
        await store.deleteUser(id);
        return;
      } catch (error) {
        window.DataStore.deleteUser(id);
        return;
      }
    }
    window.DataStore.deleteUser(id);
  }

  function render() {
    getUsersSafe().then(function (users) {
      const visibleUsers = users.filter(function (user) {
        return String(user && user.role || "").trim().toLowerCase() !== "admin";
      });

      if (visibleUsers.length === 0) {
        table.innerHTML = "<tr><td colspan='5' class='empty'>No users found.</td></tr>";
        return;
      }

      table.innerHTML = visibleUsers
        .map(function (user) {
          return (
            "<tr>" +
            "<td>" + user.name + "</td>" +
            "<td>" + user.email + "</td>" +
            "<td>" + formatRole(user.role) + "</td>" +
            "<td><span class='" + statusClass(user.status) + "'>" + user.status + "</span></td>" +
            "<td><button class='btn btn-soft' data-user-id='" + user.id + "'>Remove</button></td>" +
            "</tr>"
          );
        })
        .join("");

      const removeButtons = table.querySelectorAll("[data-user-id]");
      removeButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          deleteUserSafe(button.dataset.userId).then(render);
        });
      });
    }).catch(function () {
      table.innerHTML = "<tr><td colspan='5' class='empty'>Could not load users.</td></tr>";
    });
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    await addUserSafe({
      name: form.userName.value.trim(),
      email: form.userEmail.value.trim(),
      role: normalizeManageableRole(form.userRole.value),
      status: form.userStatus.value
    });
    form.reset();
    render();
  });

  render();
});
