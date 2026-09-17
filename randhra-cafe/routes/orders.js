const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { readData, addRecord, updateRecord, deleteRecord } = require("../utils/db");

const VALID_PAYMENT_METHODS = ["upi", "card", "netbanking", "scanner", "cod"];
const VALID_STATUSES = ["received", "preparing", "ready", "served", "cancelled"];
const KITCHEN_PIN = process.env.KITCHEN_PIN || "1234";

function calcTotal(items, menu) {
  let total = 0;
  const lineItems = [];
  for (const cartItem of items) {
    const menuItem = menu.find((m) => m.id === cartItem.id);
    if (!menuItem) continue;
    const qty = Math.max(1, Number(cartItem.qty) || 1);
    const lineTotal = menuItem.price * qty;
    total += lineTotal;
    lineItems.push({
      id: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      qty,
      lineTotal,
    });
  }
  return { total, lineItems };
}

function processMockPayment(method, amount) {
  // Simulated gateway response. Swap this out for a real integration:
  //  - UPI: create a payment intent / VPA collect request or show a dynamic QR
  //  - Card / Netbanking: redirect to gateway checkout, verify webhook
  //  - Scanner: same as UPI, using the cafe's static counter QR code
  const ref = `PAY-${Date.now().toString(36).toUpperCase()}`;
  if (method === "cod") {
    return { status: "pending_on_delivery", ref, message: "Pay at the counter / table." };
  }
  return {
    status: "success",
    ref,
    message: `₹${amount} received via ${method.toUpperCase()} (simulated).`,
  };
}

function requireKitchenAuth(req, res, next) {
  if (req.get("x-kitchen-pin") === KITCHEN_PIN) return next();
  res.status(401).json({ error: "Kitchen authentication required" });
}

// This module is a function so server.js can inject the shared Socket.io instance.
module.exports = function buildOrderRoutes(io) {
  const router = express.Router();

  // POST /api/orders - place a new order (table, pickup, or delivery)
  router.post("/", async (req, res) => {
    try {
      const { items, customer, paymentMethod, notes, orderType, tableNumber } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Cart is empty. Add items before ordering." });
      }
      if (!customer || !customer.name) {
        return res.status(400).json({ error: "Name is required." });
      }
      if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
        return res.status(400).json({ error: "Select a valid payment method." });
      }

      const resolvedType = orderType || (customer.address ? "delivery" : "pickup");
      if (resolvedType === "table" && !tableNumber) {
        return res.status(400).json({ error: "Table number is missing. Please rescan the QR code at your table." });
      }
      if (resolvedType === "delivery" && !customer.address) {
        return res.status(400).json({ error: "Delivery address is required." });
      }
      if (resolvedType !== "table" && !customer.phone) {
        return res.status(400).json({ error: "Phone number is required." });
      }

      const menu = await readData("menu");
      const { total, lineItems } = calcTotal(items, menu);

      if (lineItems.length === 0) {
        return res.status(400).json({ error: "None of the cart items were recognized." });
      }

      // Free chocolates reward on bills of 500+ (matches in-store promo)
      const freeChocolates = total >= 500;

      // --- Mock payment processing (see processMockPayment for how to go live) ---
      const paymentResult = processMockPayment(paymentMethod, total);

      const order = {
        id: uuidv4().slice(0, 8).toUpperCase(),
        items: lineItems,
        total,
        freeChocolates,
        customer: {
          name: customer.name,
          phone: customer.phone || "",
          address: customer.address || "",
        },
        orderType: resolvedType,
        tableNumber: resolvedType === "table" ? String(tableNumber) : null,
        paymentMethod,
        paymentStatus: paymentResult.status,
        paymentRef: paymentResult.ref,
        notes: notes || "",
        status: "received",
        createdAt: new Date().toISOString(),
      };

      await addRecord("orders", order);

      // Push the new order straight to any kitchen dashboards watching live.
      io.to("kitchen").emit("new-order", order);

      res.status(201).json({ order, payment: paymentResult });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Something went wrong placing your order. Please try again." });
    }
  });

  // GET /api/orders/:id - track an order
  router.get("/:id", async (req, res) => {
    const orders = await readData("orders");
    const order = orders.find((o) => o.id === req.params.id.toUpperCase());
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  });

  // GET /api/orders - list recent orders (kitchen view, PIN-protected)
  router.get("/", requireKitchenAuth, async (req, res) => {
    try {
      const orders = await readData("orders");
      res.json(orders.slice().reverse());
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Couldn't load orders right now." });
    }
  });

  // PATCH /api/orders/:id/status - kitchen updates an order's progress
  router.patch("/:id/status", requireKitchenAuth, async (req, res) => {
    try {
      const { status } = req.body;
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: "Invalid status." });
      }
      const orders = await readData("orders");
      const order = orders.find((o) => o.id === req.params.id.toUpperCase());
      if (!order) return res.status(404).json({ error: "Order not found" });

      order.status = status;
      order.updatedAt = new Date().toISOString();
      await updateRecord("orders", order.id, order);

      io.to("kitchen").emit("order-updated", order);
      res.json({ order });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Couldn't update the order right now." });
    }
  });

  // DELETE /api/orders/:id - kitchen removes an order (e.g. clearing served orders)
  router.delete("/:id", requireKitchenAuth, async (req, res) => {
    try {
      const id = req.params.id.toUpperCase();
      await deleteRecord("orders", id);
      io.to("kitchen").emit("order-deleted", { id });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Couldn't delete the order right now." });
    }
  });

  return router;
};
