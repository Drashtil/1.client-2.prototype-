const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { readData, addRecord } = require("../utils/db");

// GET /api/reviews - all reviews, newest first, plus average rating
router.get("/", async (req, res) => {
  try {
    const reviews = (await readData("reviews")).slice().reverse();
    const avg =
      reviews.length > 0
        ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
        : null;
    res.json({ reviews, average: avg, count: reviews.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Couldn't load reviews right now." });
  }
});

// POST /api/reviews - submit a review (stored server-side)
router.post("/", async (req, res) => {
  const { name, rating, comment } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Please add your name." });
  }
  const numRating = Number(rating);
  if (!numRating || numRating < 1 || numRating > 5) {
    return res.status(400).json({ error: "Rating must be between 1 and 5." });
  }
  if (!comment || !comment.trim()) {
    return res.status(400).json({ error: "Please write a short review." });
  }

  const review = {
    id: uuidv4().slice(0, 8),
    name: name.trim().slice(0, 60),
    rating: numRating,
    comment: comment.trim().slice(0, 500),
    createdAt: new Date().toISOString(),
  };

  try {
    await addRecord("reviews", review);
    res.status(201).json({ review });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Couldn't save your review right now. Please try again." });
  }
});

module.exports = router;
