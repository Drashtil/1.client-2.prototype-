(() => {
  "use strict";

  const API = "/api";
  let PIN = sessionStorage.getItem("kitchen_pin") || "";
  let orders = [];

  const STAGES = ["received", "preparing", "ready", "served"];
  const NEXT_STAGE = { received: "preparing", preparing: "ready", ready: "served" };
  const NEXT_LABEL = { received: "Start preparing", preparing: "Mark ready", ready: "Mark served" };

  const pinScreen = document.getElementById("pinScreen");
  const kitchenWrap = document.getElementById("kitchenWrap");
  const connStatus = document.getElementById("connStatus");

  const ORIGINAL_TITLE = document.title;
  let titleFlashTimer = null;

  function startTitleFlash() {
    if (titleFlashTimer) return;
    let on = false;
    titleFlashTimer = setInterval(() => {
      document.title = on ? ORIGINAL_TITLE : "🔴 New Order!";
      on = !on;
    }, 1000);
  }
  function stopTitleFlash() {
    if (titleFlashTimer) {
      clearInterval(titleFlashTimer);
      titleFlashTimer = null;
      document.title = ORIGINAL_TITLE;
    }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) stopTitleFlash(); });
  window.addEventListener("focus", stopTitleFlash);

  function notifyNewOrder(order) {
    beep();
    const label = order.orderType === "table"
      ? `Table ${order.tableNumber}`
      : (order.orderType === "delivery" ? "Delivery" : "Pickup");

    if (document.hidden) {
      startTitleFlash();
      if ("Notification" in window && Notification.permission === "granted") {
        const n = new Notification("🍽️ New order — " + label, {
          body: order.items.map(i => `${i.qty}× ${i.name}`).join(", "),
          tag: order.id,
        });
        n.onclick = () => { window.focus(); n.close(); };
      }
    }
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.start();
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) { /* audio not available, ignore */ }
  }

  async function tryLogin(pin) {
    const res = await fetch(`${API}/kitchen/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    return res.ok;
  }

  async function enterDashboard(pin) {
    PIN = pin;
    sessionStorage.setItem("kitchen_pin", pin);
    pinScreen.hidden = true;
    kitchenWrap.hidden = false;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    await loadOrders();
    connectSocket();
  }

  document.getElementById("pinSubmit").addEventListener("click", submitPin);
  document.getElementById("pinInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitPin();
  });

  async function submitPin() {
    const pin = document.getElementById("pinInput").value.trim();
    const errorEl = document.getElementById("pinError");
    const btn = document.getElementById("pinSubmit");
    errorEl.hidden = true;
    if (!pin) return;

    btn.disabled = true;
    btn.textContent = "Checking…";
    try {
      const ok = await tryLogin(pin);
      if (ok) {
        enterDashboard(pin);
      } else {
        errorEl.textContent = "Incorrect PIN — try again.";
        errorEl.hidden = false;
      }
    } catch (e) {
      errorEl.textContent = "Couldn't reach the server. If the site was idle, it may be waking up — wait 20–30 seconds and try again.";
      errorEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Enter";
    }
  }

  // If we already have a PIN from an earlier session, skip straight to the board.
  if (PIN) {
    tryLogin(PIN)
      .then(ok => { if (ok) enterDashboard(PIN); })
      .catch(() => { /* server unreachable right now — just leave the PIN screen showing */ });
  }

  async function loadOrders() {
    const res = await fetch(`${API}/orders`, { headers: { "x-kitchen-pin": PIN } });
    if (!res.ok) return;
    orders = await res.json();
    render();
  }

  function connectSocket() {
    const socket = io();
    socket.on("connect", () => {
      socket.emit("join-kitchen", PIN);
    });
    socket.on("kitchen-joined", (data) => {
      connStatus.textContent = data.ok ? "● Live" : "● Not authorized";
      connStatus.classList.toggle("offline", !data.ok);
    });
    socket.on("disconnect", () => {
      connStatus.textContent = "● Reconnecting…";
      connStatus.classList.add("offline");
    });
    socket.on("new-order", (order) => {
      orders.unshift(order);
      render();
      notifyNewOrder(order);
    });
    socket.on("order-updated", (updated) => {
      const idx = orders.findIndex(o => o.id === updated.id);
      if (idx !== -1) orders[idx] = updated;
      render();
    });
    socket.on("order-deleted", ({ id }) => {
      orders = orders.filter(o => o.id !== id);
      render();
    });
  }

  async function advanceStatus(orderId, newStatus) {
    await fetch(`${API}/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-kitchen-pin": PIN },
      body: JSON.stringify({ status: newStatus }),
    });
    // The server also broadcasts this over the socket, so no local render needed here.
  }

  async function deleteOrder(orderId) {
    await fetch(`${API}/orders/${orderId}`, {
      method: "DELETE",
      headers: { "x-kitchen-pin": PIN },
    });
    // The server also broadcasts "order-deleted" over the socket, so no local render needed here.
  }

  function money(n) { return "₹" + Number(n).toLocaleString("en-IN"); }

  function timeAgo(iso) {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return "just now";
    if (mins === 1) return "1 min ago";
    return `${mins} mins ago`;
  }

  function orderCard(order) {
    const nextStatus = NEXT_STAGE[order.status];
    return `
      <div class="order-card ${order.orderType === "table" ? "table" : ""}">
        <div class="order-card-top">
          ${order.orderType === "table"
            ? `<span class="order-table-tag">Table ${order.tableNumber}</span>`
            : `<span class="order-table-tag" style="background:var(--turmeric);color:var(--ink);">${order.orderType === "delivery" ? "Delivery" : "Pickup"}</span>`
          }
          <span class="order-id">#${order.id}</span>
        </div>
        <div class="order-customer">${escapeHtml(order.customer.name)}</div>
        <ul class="order-items">
          ${order.items.map(i => `<li><span>${i.qty}× ${escapeHtml(i.name)}</span></li>`).join("")}
        </ul>
        ${order.notes ? `<div class="order-notes">📝 ${escapeHtml(order.notes)}</div>` : ""}
        <div class="order-time">${money(order.total)} · ${timeAgo(order.createdAt)}</div>
        ${nextStatus ? `
          <div class="order-actions">
            <button class="btn-advance" data-order="${order.id}" data-next="${nextStatus}">${NEXT_LABEL[order.status]}</button>
          </div>
        ` : `
          <div class="order-actions">
            <button class="btn-delete" data-delete="${order.id}">Delete</button>
          </div>
        `}
      </div>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function render() {
    renderKanban();
    renderTables();
  }

  function renderKanban() {
    const todayKey = new Date().toDateString();
    for (const stage of STAGES) {
      const col = document.getElementById(`col${capitalize(stage)}`);
      const countEl = document.getElementById(`count${capitalize(stage)}`);
      let stageOrders = orders.filter(o => o.status === stage);
      if (stage === "served") {
        stageOrders = stageOrders.filter(o => new Date(o.createdAt).toDateString() === todayKey);
      }
      countEl.textContent = stageOrders.length;
      col.innerHTML = stageOrders.length
        ? stageOrders.map(orderCard).join("")
        : `<p class="empty-col-note">No orders</p>`;
    }

    document.querySelectorAll("[data-order]").forEach(btn => {
      btn.addEventListener("click", () => advanceStatus(btn.dataset.order, btn.dataset.next));
    });
    document.querySelectorAll("[data-delete]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (confirm("Delete this order? This can't be undone.")) {
          deleteOrder(btn.dataset.delete);
        }
      });
    });
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ---------- "By Table" admin view ---------- */
  document.querySelectorAll("#viewToggle button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#viewToggle button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const isTables = btn.dataset.view === "tables";
      document.getElementById("kanbanView").hidden = isTables;
      document.getElementById("tableView").hidden = !isTables;
    });
  });

  function renderTables() {
    const container = document.getElementById("tableView");
    const activeByTable = {};
    orders
      .filter(o => o.orderType === "table" && o.status !== "served" && o.status !== "cancelled")
      .forEach(o => {
        const t = o.tableNumber;
        if (!activeByTable[t]) activeByTable[t] = [];
        activeByTable[t].push(o);
      });

    const tableNumbers = Object.keys(activeByTable).sort((a, b) => Number(a) - Number(b));
    if (!tableNumbers.length) {
      container.innerHTML = `<p class="no-tables-note">No active table orders right now.</p>`;
      return;
    }

    container.innerHTML = tableNumbers.map(t => {
      const tableOrders = activeByTable[t];
      const total = tableOrders.reduce((s, o) => s + o.total, 0);
      return `
        <div class="table-group">
          <div class="table-group-head">
            <h3>Table ${escapeHtml(t)}</h3>
            <span class="table-group-total">${money(total)}</span>
          </div>
          <div class="table-group-orders">
            ${tableOrders.map(o => `
              <div class="table-mini-order">
                <div class="table-mini-order-top">
                  <span>#${o.id} · ${timeAgo(o.createdAt)}</span>
                  <span class="table-mini-badge ${o.status}">${o.status}</span>
                </div>
                ${o.items.map(i => `${i.qty}× ${escapeHtml(i.name)}`).join("<br>")}
              </div>
            `).join("")}
          </div>
          <button class="table-group-settle" data-settle-table="${escapeHtml(t)}">Settle &amp; clear table</button>
        </div>
      `;
    }).join("");

    container.querySelectorAll("[data-settle-table]").forEach(btn => {
      btn.addEventListener("click", () => settleTable(btn.dataset.settleTable));
    });
  }

  async function settleTable(tableNumber) {
    const tableOrders = orders.filter(
      o => o.tableNumber === tableNumber && o.status !== "served" && o.status !== "cancelled"
    );
    await Promise.all(tableOrders.map(o => advanceStatus(o.id, "served")));
  }
})();
