const express = require("express");
const router = express.Router();
const { readData } = require("../utils/db");

// GET /api/menu - full menu, optionally grouped by category
router.get("/", async (req, res) => {
  try {
    const menu = await readData("menu");
    const { grouped } = req.query;

    if (grouped === "true") {
      const byCategory = {};
      for (const item of menu) {
        if (!byCategory[item.category]) byCategory[item.category] = [];
        byCategory[item.category].push(item);
      }
      return res.json(byCategory);
    }

    res.json(menu);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Couldn't load the menu right now." });
  }
});

// GET /api/menu/:id - single item
router.get("/:id", async (req, res) => {
  const menu = await readData("menu");
  const item = menu.find((m) => m.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: "Item not found" });
  res.json(item);
});

module.exports = router;
