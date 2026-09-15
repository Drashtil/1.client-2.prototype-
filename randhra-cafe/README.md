# R-Andhra Cafe — Online Ordering Website

A full-stack website for **R-Andhra Cafe** (South Indian dosa, uthappam &amp; benne
dosa cafe): a themed frontend, an Express/Node backend, a cart + order system,
a customer review system, and mock payment methods (UPI, card, netbanking,
QR scanner, pay‑at‑counter).

## What's inside

```
randhra-cafe/
├── server.js              Express server (serves the site + JSON API)
├── routes/
│   ├── menu.js             GET /api/menu, /api/menu/:id
│   ├── orders.js           POST/GET /api/orders  (cart checkout + payment)
│   └── reviews.js          GET/POST /api/reviews
├── utils/db.js             tiny JSON-file datastore (no DB server needed)
├── data/
│   ├── menu.json            full menu, taken from your menu board photo
│   ├── orders.json          orders placed through the site (starts empty)
│   └── reviews.json         customer reviews (starts empty)
└── public/                 the website itself
    ├── index.html
    ├── css/style.css
    └── js/app.js            cart, checkout, and review logic
```

Data is stored as JSON files on disk, so orders and reviews persist between
restarts with zero database setup. When you're ready to run this for real
traffic, swap `utils/db.js` for a proper database (Postgres/MySQL/Mongo) —
every route already goes through `readData()` / `writeData()`, so that's the
only file you'd need to change.

## Running it locally

You need [Node.js](https://nodejs.org) 16 or newer.

```bash
cd randhra-cafe
npm install
npm start
```

Then open **http://localhost:3000** in your browser. That's it — frontend
and backend are served from the same process.

## Fixing disappearing reviews/orders (do this before going live)

If you deployed on Render's free tier, reviews and orders were disappearing
after a few hours because that plan's **disk is wiped every time your app
restarts** (which happens on every free-tier spin-down after ~15 minutes of
no traffic). The app was storing them in plain JSON files on that disk.

**The fix:** the app now supports a real persistent database. Set the
`DATABASE_URL` environment variable on your host and it automatically
switches from JSON files to Postgres — no code changes needed.

1. Create a free Postgres database — [Supabase](https://supabase.com) or
   [Neon](https://neon.tech) both have generous free tiers (500 MB+, plenty
   for a cafe's orders and reviews).
2. Copy the connection string they give you (starts with `postgres://…`).
3. On Render, go to your service → **Environment** → add a variable:
   `DATABASE_URL` = that connection string.
4. Redeploy. Check `/api/health` on your live site — it'll now say
   `"storage": "postgres (persistent)"` instead of `"json-file"`.

The app creates its own tables automatically on first boot — nothing to run
by hand. If `DATABASE_URL` isn't set, everything still works exactly as
before using the JSON files (handy for local development), it just won't
survive a host restart.

## What's implemented

- **Menu** — every item from your menu photo (Dosa, Paper Dosa, Benne Dosa,
  Finger Licking Dosa's, Dosa Wraps, Uthappam, New Arrivals, Bhaath & Rice,
  Beverages & Desserts), with veg/spicy tags and "New" badges, browsable by
  category.
- **Trending section + zoom-in detail view** — a handful of popular/new
  items are flagged `trending: true` in `data/menu.json` and shown in a
  "🔥 Trending Now" row on the homepage. Tapping any menu item or trending
  card opens a zoom-animated detail view (photo, description, qty picker,
  add to cart). Gallery photos have the same tap-to-zoom lightbox.
- **Cart** — add/remove items, adjust quantity, running total, saved in the
  visitor's browser (`localStorage`) so it survives a refresh.
- **Table ordering** — scan a table's QR code (`yoursite.com/?table=5`) and
  the site locks in that table for the whole visit; checkout skips phone/
  address and just needs a name. The order is pushed to the kitchen the
  instant it's placed. Regular pickup/delivery ordering (no table scanned)
  still works exactly as before.
- **Kitchen dashboard** (`/kitchen.html`) — a live, PIN-protected board with
  two views:
  - **Board** — four columns (New → Preparing → Ready → Served). New orders
    appear instantly with a beep (via Socket.io, not polling); if the tab
    isn't focused, the browser tab title flashes and an OS-level
    notification fires too (once you allow notifications when prompted).
  - **By Table** — the admin/chef view requested: every table with an
    active order, its combined items and running bill, and a "Settle &
    clear table" button once it's done.
- **Table QR generator** (`/admin-tables.html`) — enter how many tables you
  have, get a printable QR code per table, each linking straight to your
  menu with that table pre-filled. No backend needed — generates in the
  browser.
- **Orders** — checkout collects name (+ phone/address for pickup/delivery),
  order type, and notes, then places the order through the backend. Orders
  ≥ ₹500 automatically qualify for the "free chocolates" reward, matching
  the in-store promotion on your menu board.
- **Payments** — UPI, Card, Netbanking, Scan QR, and Pay-at-counter are all
  selectable at checkout. Right now the actual charge is **simulated** (see
  "Connecting real payments" below) — a QR placeholder is shown for the
  scanner option, ready for you to swap in your real counter QR image.
- **Reviews** — a star-rating + comment form that stores each review
  persistently (see "Fixing disappearing reviews" above) and displays the
  running average and full list on the homepage.

## Using table ordering

1. Open `/admin-tables.html` on your live site, enter your table count, and
   print the QR codes (one per table). Stick one on each table.
2. A guest scans it, lands on your homepage with a **"Ordering for Table N"**
   banner, browses the menu, and checks out — no phone number needed.
3. The order appears immediately on `/kitchen.html`, tagged with the table
   number, with a beep to get attention.
4. Open `/kitchen.html` on a tablet/laptop in the kitchen, enter the PIN
   (default **1234** — change it via the `KITCHEN_PIN` environment variable
   on your host), and tap orders through New → Preparing → Ready → Served
   as they're worked on.

**Important for hosting:** the kitchen dashboard needs a real, persistent
server connection (Socket.io/WebSockets), which Render and Railway both
support fine on their standard web service — but it will **not** work on
serverless hosts like Vercel or Netlify. Stick with Render/Railway/a VPS.

## Connecting real payments

`routes/orders.js` has a `processMockPayment()` function that stands in for
a real payment gateway. To go live:

1. Pick a gateway that supports UPI/cards/netbanking for Indian businesses
   (e.g. Razorpay, PayU, Cashfree, Instamojo).
2. Sign up, get your API keys, and follow their Node.js integration guide to
   create an order/payment intent server-side and verify the payment
   webhook/callback.
3. Replace the body of `processMockPayment()` with that real call, keeping
   the same return shape (`{ status, ref, message }`) so the rest of the app
   doesn't need to change.
4. For **UPI / Scan QR**, most gateways can generate a dynamic QR per order;
   swap the placeholder SVG in `index.html` (`#qrPlaceholder`) for an
   `<img>` pointing at that generated QR, or for your **static counter QR**
   once you send it over — just drop the image into `public/img/` and
   reference it there.

## Editing the menu

Everything the site displays comes from `data/menu.json` — edit prices,
names, or add new items there and refresh the page. Each item looks like:

```json
{ "id": 5, "sr": 5, "category": "Dosa", "name": "Masala Dosa (180g)", "price": 169, "veg": true, "spicy": false }
```

`tag: "New"` adds a "New" badge; `originalPrice` shows a struck-through price
next to a discounted one (used for the Malabar Paratha combo).

## Deploying

Any Node-friendly host works (Render, Railway, a VPS, etc.). Set the `PORT`
environment variable if your host requires it — the server already reads
`process.env.PORT`. Because orders/reviews are stored as JSON files, make
sure your host's filesystem persists between deploys, or move to a real
database first (see above).
