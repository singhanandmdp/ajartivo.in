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
      if (users.length === 0) {
        table.innerHTML = "<tr><td colspan='5' class='empty'>No users found.</td></tr>";
        return;
      }

      table.innerHTML = users
        .map(function (user) {
          return (
            "<tr>" +
            "<td>" + user.name + "</td>" +
            "<td>" + user.email + "</td>" +
            "<td>" + user.role + "</td>" +
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
      role: form.userRole.value,
      status: form.userStatus.value
    });
    form.reset();
    render();
  });

  render();
});
