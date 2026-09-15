(() => {
  "use strict";

  const API = "/api";
  let MENU = [];
  let CART = load("randhra_cart", []);
  let selectedPaymentMethod = "upi";
  let selectedStars = 0;

  document.getElementById("year").textContent = new Date().getFullYear();

  /* ---------- table ordering (via QR code: ?table=5) ---------- */
  const params = new URLSearchParams(window.location.search);
  const TABLE_NUMBER = params.get("table");
  if (TABLE_NUMBER) {
    save("randhra_table", TABLE_NUMBER);
  }
  const ACTIVE_TABLE = TABLE_NUMBER || load("randhra_table", null);

  if (ACTIVE_TABLE) {
    const banner = document.getElementById("tableBanner");
    banner.hidden = false;
    document.getElementById("tableBannerNumber").textContent = `Table ${ACTIVE_TABLE}`;
  }

  /* ---------- storage helpers ---------- */
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function money(n) { return "₹" + Number(n).toLocaleString("en-IN"); }

  /* ---------- image / description helpers ---------- */
  const W = "https://commons.wikimedia.org/wiki/Special:FilePath/";
  const FALLBACK_IMAGES = {
    "Dosa": W + "Masala%20dosa%2001.jpg?width=700",
    "Paper Dosa": W + "Paper%20Masala%20Dosa.jpg?width=700",
    "Benne Dosa": W + "Mysore%20Masala%20Dosa.jpg?width=700",
    "Finger Licking Dosa's": W + "Masala%20dosa%2001.jpg?width=700",
    "Dosa Wraps": W + "Uttapam.jpg?width=700",
    "Uthappam": W + "Uttapam.jpg?width=700",
    "New Arrivals": W + "A%20Thali%2C%20famous%20South%20Indian%20meal%20served%20on%20a%20banana%20leaf.jpg?width=700",
    "Bhaath & Rice": W + "A%20Thali%2C%20famous%20South%20Indian%20meal%20served%20on%20a%20banana%20leaf.jpg?width=700",
    "Beverages & Desserts": W + "South%20Indian%20filter%20coffee.JPG?width=700",
  };
  const CATEGORY_BLURBS = {
    "Dosa": "A classic South Indian crepe made from fermented rice & lentil batter, cooked fresh to order.",
    "Paper Dosa": "Extra-thin and extra-crisp — rolled large and served piping hot.",
    "Benne Dosa": "Karnataka-style dosa finished with a generous layer of butter for a rich, golden crunch.",
    "Finger Licking Dosa's": "Our indulgent, loaded dosa creations — stuffed and topped for serious flavour.",
    "Dosa Wraps": "Dosa batter rolled wrap-style around bold, modern fillings.",
    "Uthappam": "A thick, fluffy fermented pancake topped with fresh vegetables.",
    "New Arrivals": "Fresh on the menu — one of our latest additions.",
    "Bhaath & Rice": "Comforting South Indian rice preparations, made fresh.",
    "Beverages & Desserts": "The perfect way to finish (or start) your meal.",
  };
  function imageFor(item) { return item.image || FALLBACK_IMAGES[item.category] || FALLBACK_IMAGES["Dosa"]; }
  function blurbFor(item) { return CATEGORY_BLURBS[item.category] || "Made fresh to order in our kitchen."; }

  /* ================= MENU ================= */
  async function loadMenu() {
    const grid = document.getElementById("menuGrid");
    try {
      const res = await fetch(`${API}/menu`);
      MENU = await res.json();
      renderCategoryPills();
      renderMenu();
      renderTrending();
    } catch (e) {
      grid.innerHTML = `<p class="loading-note">Couldn't load the menu right now. Please refresh.</p>`;
    }
  }

  function categoriesInOrder() {
    const seen = [];
    for (const item of MENU) {
      if (!seen.includes(item.category)) seen.push(item.category);
    }
    return seen;
  }

  function renderCategoryPills() {
    const wrap = document.getElementById("categoryPills");
    const cats = ["All", ...categoriesInOrder()];
    wrap.innerHTML = cats.map((c, i) =>
      `<button class="pill ${i === 0 ? "active" : ""}" data-cat="${c}">${c}</button>`
    ).join("");
    wrap.querySelectorAll(".pill").forEach(btn => {
      btn.addEventListener("click", () => {
        wrap.querySelectorAll(".pill").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderMenu(btn.dataset.cat);
      });
    });
  }

  function renderMenu(filterCat) {
    const grid = document.getElementById("menuGrid");
    const cats = filterCat && filterCat !== "All" ? [filterCat] : categoriesInOrder();
    let html = "";
    for (const cat of cats) {
      const items = MENU.filter(m => m.category === cat);
      if (!items.length) continue;
      html += `<div class="menu-category-heading">${cat}</div>`;
      html += items.map(renderItemCard).join("");
    }
    grid.innerHTML = html || `<p class="loading-note">No items in this category.</p>`;
    grid.querySelectorAll("[data-add]").forEach(btn => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); addToCart(Number(btn.dataset.add)); });
    });
    grid.querySelectorAll("[data-inc]").forEach(btn => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); changeQty(Number(btn.dataset.inc), 1); });
    });
    grid.querySelectorAll("[data-dec]").forEach(btn => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); changeQty(Number(btn.dataset.dec), -1); });
    });
    grid.querySelectorAll(".item-card").forEach(card => {
      card.addEventListener("click", () => openItemDetail(Number(card.dataset.item)));
    });
  }

  function renderItemCard(item) {
    const inCart = CART.find(c => c.id === item.id);
    const priceHtml = item.originalPrice
      ? `<span class="orig">${money(item.originalPrice)}</span>${money(item.price)}`
      : money(item.price);
    return `
      <div class="item-card" data-item="${item.id}" tabindex="0">
        <div class="item-top">
          <div class="item-name">${item.name}</div>
          <div class="item-tags">
            ${item.veg ? '<span class="tag-veg" title="Vegetarian"></span>' : ""}
            ${item.spicy ? '<span class="tag-spicy" title="Spicy">🌶</span>' : ""}
          </div>
        </div>
        ${item.tag ? `<span class="tag-new">${item.tag}</span>` : ""}
        <div class="item-price-row">
          <span class="item-price">${priceHtml}</span>
          ${inCart
            ? `<div class="qty-stepper">
                 <button data-dec="${item.id}" aria-label="Remove one">−</button>
                 <span>${inCart.qty}</span>
                 <button data-inc="${item.id}" aria-label="Add one">+</button>
               </div>`
            : `<button class="add-btn" data-add="${item.id}">Add +</button>`
          }
        </div>
      </div>
    `;
  }

  /* ================= TRENDING ================= */
  function renderTrending() {
    const section = document.getElementById("trending");
    const row = document.getElementById("trendingRow");
    const items = MENU.filter(m => m.trending);
    if (!items.length) { section.hidden = true; return; }
    row.innerHTML = items.map(item => `
      <div class="trending-card" data-item="${item.id}" tabindex="0">
        <div class="trending-card-img-wrap">
          <span class="trending-flame">🔥 Trending</span>
          <img src="${imageFor(item)}" alt="${item.name}" loading="lazy">
        </div>
        <div class="trending-card-body">
          <div class="trending-card-name">${item.name}</div>
          <div class="trending-card-price">${money(item.price)}</div>
        </div>
      </div>
    `).join("");
    row.querySelectorAll("[data-item]").forEach(card => {
      card.addEventListener("click", () => openItemDetail(Number(card.dataset.item)));
      card.addEventListener("keydown", e => { if (e.key === "Enter") openItemDetail(Number(card.dataset.item)); });
    });
  }

  /* ================= ITEM ZOOM DETAIL MODAL ================= */
  let detailItemId = null;
  const itemBackdrop = document.getElementById("itemBackdrop");

  function openItemDetail(id) {
    const item = MENU.find(m => m.id === id);
    if (!item) return;
    detailItemId = id;
    document.getElementById("itemModalMedia").innerHTML =
      `<img src="${imageFor(item)}" alt="${item.name}">`;
    document.getElementById("itemModalBadge").hidden = !item.trending;
    document.getElementById("itemModalName").textContent = item.name;
    document.getElementById("itemModalDesc").textContent = blurbFor(item);
    document.getElementById("itemModalTags").innerHTML = `
      ${item.veg ? '<span class="tag-veg" title="Vegetarian"></span>' : ""}
      ${item.spicy ? '<span class="tag-spicy">🌶 Spicy</span>' : ""}
    `;
    document.getElementById("itemModalPrice").textContent = money(item.price);
    updateItemModalQty();
    itemBackdrop.classList.add("open");
  }
  function closeItemDetail() { itemBackdrop.classList.remove("open"); }

  function updateItemModalQty() {
    const inCart = CART.find(c => c.id === detailItemId);
    document.getElementById("itemModalQtyVal").textContent = inCart ? inCart.qty : 0;
  }

  document.getElementById("closeItemBtn").addEventListener("click", closeItemDetail);
  itemBackdrop.addEventListener("click", (e) => { if (e.target === itemBackdrop) closeItemDetail(); });

  document.getElementById("itemModalInc").addEventListener("click", () => {
    const existing = CART.find(c => c.id === detailItemId);
    if (existing) existing.qty += 1; else CART.push({ id: detailItemId, qty: 1 });
    persistCart();
    updateItemModalQty();
    renderMenu(currentActivePill());
  });
  document.getElementById("itemModalDec").addEventListener("click", () => {
    changeQty(detailItemId, -1);
    updateItemModalQty();
  });
  document.getElementById("itemModalAddBtn").addEventListener("click", () => {
    const existing = CART.find(c => c.id === detailItemId);
    if (!existing) {
      CART.push({ id: detailItemId, qty: 1 });
      persistCart();
      renderMenu(currentActivePill());
    }
    closeItemDetail();
    openCart();
  });

  /* ================= GALLERY ZOOM LIGHTBOX ================= */
  const zoomLightbox = document.getElementById("zoomLightbox");
  const zoomLightboxImg = document.getElementById("zoomLightboxImg");
  document.querySelectorAll("[data-zoomable]").forEach(img => {
    img.addEventListener("click", () => {
      zoomLightboxImg.src = img.src;
      zoomLightboxImg.alt = img.alt;
      zoomLightbox.classList.add("open");
    });
  });
  zoomLightbox.addEventListener("click", () => zoomLightbox.classList.remove("open"));

  /* ================= CART ================= */
  function addToCart(id) {
    const existing = CART.find(c => c.id === id);
    if (existing) existing.qty += 1;
    else CART.push({ id, qty: 1 });
    persistCart();
    renderMenu(currentActivePill());
  }

  function changeQty(id, delta) {
    const item = CART.find(c => c.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) CART = CART.filter(c => c.id !== id);
    persistCart();
    renderMenu(currentActivePill());
  }

  function removeFromCart(id) {
    CART = CART.filter(c => c.id !== id);
    persistCart();
    renderMenu(currentActivePill());
  }

  function currentActivePill() {
    const active = document.querySelector(".pill.active");
    return active ? active.dataset.cat : "All";
  }

  function persistCart() {
    save("randhra_cart", CART);
    renderCartDrawer();
  }

  function cartTotal() {
    return CART.reduce((sum, c) => {
      const m = MENU.find(m => m.id === c.id);
      return sum + (m ? m.price * c.qty : 0);
    }, 0);
  }

  function renderCartDrawer() {
    const container = document.getElementById("cartItems");
    const countEl = document.getElementById("cartCount");
    const totalEl = document.getElementById("cartTotal");
    const checkoutBtn = document.getElementById("checkoutBtn");
    const rewardNote = document.getElementById("rewardNote");

    const totalQty = CART.reduce((s, c) => s + c.qty, 0);
    countEl.textContent = totalQty;

    if (!CART.length) {
      container.innerHTML = `<p class="empty-note">Your cart is empty. Add some dosa!</p>`;
      checkoutBtn.disabled = true;
      totalEl.textContent = money(0);
      rewardNote.hidden = true;
      return;
    }

    container.innerHTML = CART.map(c => {
      const m = MENU.find(m => m.id === c.id);
      if (!m) return "";
      return `
        <div class="cart-line">
          <div>
            <div class="cart-line-name">${m.name}</div>
            <div class="cart-line-price">${money(m.price)} × ${c.qty} = ${money(m.price * c.qty)}</div>
          </div>
          <div style="display:flex;align-items:center;">
            <div class="qty-stepper">
              <button data-dec="${m.id}" aria-label="Remove one">−</button>
              <span>${c.qty}</span>
              <button data-inc="${m.id}" aria-label="Add one">+</button>
            </div>
            <button class="cart-line-remove" data-remove="${m.id}">Remove</button>
          </div>
        </div>
      `;
    }).join("");

    container.querySelectorAll("[data-inc]").forEach(btn =>
      btn.addEventListener("click", () => changeQty(Number(btn.dataset.inc), 1)));
    container.querySelectorAll("[data-dec]").forEach(btn =>
      btn.addEventListener("click", () => changeQty(Number(btn.dataset.dec), -1)));
    container.querySelectorAll("[data-remove]").forEach(btn =>
      btn.addEventListener("click", () => removeFromCart(Number(btn.dataset.remove))));

    const total = cartTotal();
    totalEl.textContent = money(total);
    checkoutBtn.disabled = false;
    rewardNote.hidden = total < 500;
  }

  /* ---------- drawer open/close ---------- */
  const cartDrawer = document.getElementById("cartDrawer");
  const drawerBackdrop = document.getElementById("drawerBackdrop");
  function openCart() { cartDrawer.classList.add("open"); drawerBackdrop.classList.add("open"); }
  function closeCart() { cartDrawer.classList.remove("open"); drawerBackdrop.classList.remove("open"); }
  document.getElementById("openCartBtn").addEventListener("click", openCart);
  document.getElementById("closeCartBtn").addEventListener("click", closeCart);
  drawerBackdrop.addEventListener("click", () => { closeCart(); closeCheckout(); closeReview(); });

  /* ================= CHECKOUT ================= */
  const checkoutBackdrop = document.getElementById("checkoutBackdrop");
  const orderTypeSelect = document.getElementById("orderType");
  const addressGroup = document.getElementById("addressGroup");

  function openCheckout() {
    if (!CART.length) return;
    document.getElementById("checkoutStepForm").hidden = false;
    document.getElementById("checkoutStepSuccess").hidden = true;

    if (ACTIVE_TABLE) {
      document.getElementById("phoneGroup").hidden = true;
      document.getElementById("orderTypeGroup").hidden = true;
      document.getElementById("tableGroup").hidden = false;
      document.getElementById("tableLockedDisplay").textContent = `Table ${ACTIVE_TABLE}`;
      addressGroup.hidden = true;
    }

    checkoutBackdrop.classList.add("open");
  }
  function closeCheckout() { checkoutBackdrop.classList.remove("open"); }

  document.getElementById("checkoutBtn").addEventListener("click", () => { closeCart(); openCheckout(); });
  document.getElementById("closeCheckoutBtn").addEventListener("click", closeCheckout);
  document.getElementById("closeSuccessBtn").addEventListener("click", closeCheckout);

  orderTypeSelect.addEventListener("change", () => {
    addressGroup.hidden = orderTypeSelect.value !== "delivery";
  });

  /* payment tabs */
  const payPanels = {
    upi: document.getElementById("payPanelUpi"),
    card: document.getElementById("payPanelCard"),
    netbanking: document.getElementById("payPanelNetbanking"),
    scanner: document.getElementById("payPanelScanner"),
    cod: document.getElementById("payPanelCod"),
  };
  document.querySelectorAll(".pay-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".pay-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      selectedPaymentMethod = tab.dataset.method;
      Object.entries(payPanels).forEach(([key, el]) => { el.hidden = key !== selectedPaymentMethod; });
    });
  });

  function showCheckoutError(msg) {
    const el = document.getElementById("checkoutError");
    el.textContent = msg;
    el.hidden = false;
  }
  function clearCheckoutError() {
    document.getElementById("checkoutError").hidden = true;
  }

  document.getElementById("placeOrderBtn").addEventListener("click", async () => {
    clearCheckoutError();
    const name = document.getElementById("custName").value.trim();
    const phone = document.getElementById("custPhone").value.trim();
    const orderType = ACTIVE_TABLE ? "table" : orderTypeSelect.value;
    const address = document.getElementById("custAddress").value.trim();
    const notes = document.getElementById("orderNotes").value.trim();

    if (!name) return showCheckoutError("Please enter your name.");
    if (!ACTIVE_TABLE && (!phone || phone.replace(/\D/g, "").length < 10)) {
      return showCheckoutError("Please enter a valid phone number.");
    }
    if (orderType === "delivery" && !address) return showCheckoutError("Please enter a delivery address.");
    if (!CART.length) return showCheckoutError("Your cart is empty.");

    const payload = {
      items: CART.map(c => ({ id: c.id, qty: c.qty })),
      customer: { name, phone, address: orderType === "delivery" ? address : "" },
      paymentMethod: selectedPaymentMethod,
      notes,
      orderType,
      tableNumber: ACTIVE_TABLE || undefined,
    };

    const btn = document.getElementById("placeOrderBtn");
    btn.disabled = true;
    btn.textContent = "Placing order…";

    try {
      const res = await fetch(`${API}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong placing your order.");

      document.getElementById("successOrderId").textContent = data.order.id;
      document.getElementById("successPayMsg").textContent = ACTIVE_TABLE
        ? `Sent to the kitchen for Table ${ACTIVE_TABLE}. ${data.payment.message}`
        : data.payment.message;
      document.getElementById("successRewardMsg").hidden = !data.order.freeChocolates;
      document.getElementById("checkoutStepForm").hidden = true;
      document.getElementById("checkoutStepSuccess").hidden = false;

      CART = [];
      persistCart();
    } catch (e) {
      showCheckoutError(e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Place order";
    }
  });

  /* ================= REVIEWS ================= */
  async function loadReviews() {
    const list = document.getElementById("reviewList");
    try {
      const res = await fetch(`${API}/reviews`);
      const data = await res.json();
      document.getElementById("reviewAvgStat").textContent = data.average ? `${data.average}★` : "New";
      document.getElementById("reviewSummary").textContent = data.count
        ? `${data.average}★ average from ${data.count} review${data.count === 1 ? "" : "s"}`
        : "Be the first to leave a review.";

      if (!data.reviews.length) {
        list.innerHTML = `<p class="loading-note">No reviews yet — share your experience!</p>`;
        return;
      }
      list.innerHTML = data.reviews.map(r => `
        <div class="review-card">
          <div class="review-card-top">
            <span class="review-name">${escapeHtml(r.name)}</span>
            <span class="review-stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
          </div>
          <p class="review-comment">${escapeHtml(r.comment)}</p>
          <span class="review-date">${new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
        </div>
      `).join("");
    } catch (e) {
      list.innerHTML = `<p class="loading-note">Couldn't load reviews right now.</p>`;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  const reviewBackdrop = document.getElementById("reviewBackdrop");
  function openReview() { reviewBackdrop.classList.add("open"); }
  function closeReview() { reviewBackdrop.classList.remove("open"); }
  document.getElementById("writeReviewBtn").addEventListener("click", openReview);
  document.getElementById("closeReviewBtn").addEventListener("click", closeReview);

  document.querySelectorAll("#starInput button").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedStars = Number(btn.dataset.star);
      document.querySelectorAll("#starInput button").forEach(b => {
        b.classList.toggle("filled", Number(b.dataset.star) <= selectedStars);
      });
    });
  });

  document.getElementById("submitReviewBtn").addEventListener("click", async () => {
    const errorEl = document.getElementById("reviewError");
    errorEl.hidden = true;
    const name = document.getElementById("reviewName").value.trim();
    const comment = document.getElementById("reviewComment").value.trim();

    if (!name) { errorEl.textContent = "Please add your name."; errorEl.hidden = false; return; }
    if (!selectedStars) { errorEl.textContent = "Please pick a star rating."; errorEl.hidden = false; return; }
    if (!comment) { errorEl.textContent = "Please write a short review."; errorEl.hidden = false; return; }

    const btn = document.getElementById("submitReviewBtn");
    btn.disabled = true;
    btn.textContent = "Submitting…";

    try {
      const res = await fetch(`${API}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rating: selectedStars, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't submit your review.");

      document.getElementById("reviewName").value = "";
      document.getElementById("reviewComment").value = "";
      selectedStars = 0;
      document.querySelectorAll("#starInput button").forEach(b => b.classList.remove("filled"));
      closeReview();
      loadReviews();
    } catch (e) {
      errorEl.textContent = e.message;
      errorEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Submit review";
    }
  });

  /* ================= INIT ================= */
  loadMenu().then(renderCartDrawer);
  loadReviews();
})();
