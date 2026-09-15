const express = require("express");
const http = require("http");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const { Server } = require("socket.io");

const menuRoutes = require("./routes/menu");
const reviewRoutes = require("./routes/reviews");
const buildOrderRoutes = require("./routes/orders");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// PIN kitchen staff enter to view the live order board.
// Set KITCHEN_PIN in your host's environment variables to change it from the default.
const KITCHEN_PIN = process.env.KITCHEN_PIN || "1234";

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/menu", menuRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/orders", buildOrderRoutes(io));

app.get("/api/health", (req, res) => {
  const { usingDatabase } = require("./utils/db");
  res.json({
    ok: true,
    name: "R-Andhra Cafe API",
    storage: usingDatabase ? "postgres (persistent)" : "json-file (resets on host restart)",
  });
});

// Kitchen staff "log in" with a PIN before the dashboard will load live orders.
app.post("/api/kitchen/login", (req, res) => {
  const { pin } = req.body;
  if (pin === KITCHEN_PIN) return res.json({ ok: true, token: KITCHEN_PIN });
  res.status(401).json({ ok: false, error: "Incorrect PIN" });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Socket.io: kitchen dashboards join a "kitchen" room (after presenting the PIN)
// and get pushed every new order + every status change in real time.
io.on("connection", (socket) => {
  socket.on("join-kitchen", (pin) => {
    if (pin === KITCHEN_PIN) {
      socket.join("kitchen");
      socket.emit("kitchen-joined", { ok: true });
    } else {
      socket.emit("kitchen-joined", { ok: false, error: "Incorrect PIN" });
    }
  });
});

server.listen(PORT, () => {
  console.log(`R-Andhra Cafe server running at http://localhost:${PORT}`);
  console.log(`Kitchen dashboard: http://localhost:${PORT}/kitchen.html (PIN: ${KITCHEN_PIN})`);
});
