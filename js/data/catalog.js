/*
 * The dummy catalogue and its sales history.
 *
 * This is the demo's "database". Everything downstream — the target picker's
 * counts, the look-back averages, the forecast itself — is computed from the
 * daily series built here, so the numbers on screen are real arithmetic over
 * real (if invented) data rather than hardcoded figures.
 */
(function (FS) {
  "use strict";

  const U = FS.util;

  // How much history the demo carries. 18 months is enough for a 120-day
  // look-back plus a "same period last year" comparison.
  const HISTORY_DAYS = 560;

  const DAY0 = U.addDays(U.today(), -HISTORY_DAYS + 1);

  const CHANNELS = ["Amazon", "Flipkart", "Myntra", "Meesho", "Nykaa", "Ajio", "Blinkit", "Shopify"];

  const CATEGORIES = [
    "Audio",
    "Wearables",
    "Mobile Accessories",
    "Home Appliances",
    "Personal Care",
    "Kitchen",
    "Apparel",
    "Footwear",
  ];

  const BRANDS = ["Nexora", "Volt", "Kasa", "Lumen", "Terra"];

  /*
   * Seed products. Each one is expanded into several marketplace listings
   * below, which is how a real catalogue looks: one product, many channel SKUs.
   */
  const PRODUCTS = [
    { name: "Wireless Earbuds Pro", cat: "Audio", mrp: 3499, base: 46, trend: 0.28, season: "festive" },
    { name: "Noise Cancelling Headphones", cat: "Audio", mrp: 7999, base: 14, trend: 0.18, season: "festive" },
    { name: "Bluetooth Speaker X10", cat: "Audio", mrp: 2299, base: 33, trend: 0.05, season: "summer" },
    { name: "Soundbar 2.1 Channel", cat: "Audio", mrp: 11999, base: 7, trend: 0.3, season: "festive" },
    { name: "Smart Watch Series 5", cat: "Wearables", mrp: 4999, base: 38, trend: 0.42, season: "festive" },
    { name: "Fitness Band Lite", cat: "Wearables", mrp: 1799, base: 52, trend: -0.12, season: "newyear" },
    { name: "Smart Ring Titanium", cat: "Wearables", mrp: 14999, base: 4, trend: 0.65, season: "festive" },
    { name: "USB-C Cable Premium", cat: "Mobile Accessories", mrp: 799, base: 118, trend: 0.08, season: "flat" },
    { name: "65W GaN Charger", cat: "Mobile Accessories", mrp: 1899, base: 64, trend: 0.22, season: "flat" },
    { name: "Power Bank 20000mAh", cat: "Mobile Accessories", mrp: 2499, base: 44, trend: 0.03, season: "summer" },
    { name: "Tempered Glass Pack", cat: "Mobile Accessories", mrp: 349, base: 165, trend: -0.05, season: "flat" },
    { name: "Air Fryer 4.5L", cat: "Home Appliances", mrp: 6999, base: 19, trend: 0.36, season: "festive" },
    { name: "Robot Vacuum R2", cat: "Home Appliances", mrp: 24999, base: 3, trend: 0.5, season: "festive" },
    { name: "Tower Fan Silent", cat: "Home Appliances", mrp: 4499, base: 21, trend: 0.02, season: "summer" },
    { name: "Room Humidifier", cat: "Home Appliances", mrp: 2199, base: 17, trend: 0.1, season: "winter" },
    { name: "Beard Trimmer T9", cat: "Personal Care", mrp: 1599, base: 71, trend: 0.07, season: "festive" },
    { name: "Hair Dryer 1800W", cat: "Personal Care", mrp: 1999, base: 29, trend: 0.04, season: "winter" },
    { name: "Electric Toothbrush", cat: "Personal Care", mrp: 2799, base: 23, trend: 0.26, season: "flat" },
    { name: "Vitamin C Serum 30ml", cat: "Personal Care", mrp: 899, base: 96, trend: 0.31, season: "summer" },
    { name: "Nonstick Cookware Set", cat: "Kitchen", mrp: 3299, base: 26, trend: 0.06, season: "festive" },
    { name: "Insulated Bottle 1L", cat: "Kitchen", mrp: 1099, base: 83, trend: 0.14, season: "summer" },
    { name: "Coffee Press 600ml", cat: "Kitchen", mrp: 1499, base: 18, trend: 0.09, season: "winter" },
    { name: "Mixer Grinder 750W", cat: "Kitchen", mrp: 4299, base: 15, trend: 0.0, season: "festive" },
    { name: "Cotton Casual Shirt", cat: "Apparel", mrp: 1799, base: 58, trend: 0.11, season: "festive" },
    { name: "Slim Fit Chinos", cat: "Apparel", mrp: 2199, base: 41, trend: 0.05, season: "winter" },
    { name: "Oversized Graphic Tee", cat: "Apparel", mrp: 899, base: 124, trend: 0.24, season: "summer" },
    { name: "Fleece Hoodie", cat: "Apparel", mrp: 2499, base: 34, trend: 0.16, season: "winter" },
    { name: "Running Shoes Flyknit", cat: "Footwear", mrp: 3999, base: 37, trend: 0.19, season: "newyear" },
    { name: "Everyday Sneakers", cat: "Footwear", mrp: 2899, base: 49, trend: 0.08, season: "festive" },
    { name: "Trail Sandals", cat: "Footwear", mrp: 1699, base: 22, trend: -0.04, season: "summer" },
  ];

  /*
   * Recurring retail events, by month/day. They shape the history that the
   * look-back averages read, and the forecast window that future events lift.
   * Each occurrence is materialised for every year the demo touches.
   */
  const EVENT_MASTER = [
    { name: "New Year Sale", from: [11, 28], to: [0, 2], uplift: 38 },
    { name: "Republic Day Sale", from: [0, 19], to: [0, 26], uplift: 46 },
    { name: "Valentine Week", from: [1, 7], to: [1, 14], uplift: 22 },
    { name: "Holi Sale", from: [2, 5], to: [2, 12], uplift: 27 },
    { name: "Summer Sale", from: [3, 25], to: [4, 6], uplift: 31 },
    { name: "Prime Day", from: [6, 14], to: [6, 18], uplift: 58 },
    { name: "Independence Day Sale", from: [7, 7], to: [7, 15], uplift: 44 },
    { name: "Onam / Raksha Bandhan", from: [7, 24], to: [8, 2], uplift: 25 },
    { name: "Big Billion Days", from: [8, 26], to: [9, 6], uplift: 96 },
    { name: "Diwali Festive Push", from: [9, 20], to: [10, 5], uplift: 74 },
    { name: "Black Friday", from: [10, 25], to: [10, 30], uplift: 52 },
    { name: "Year End Clearance", from: [11, 18], to: [11, 27], uplift: 29 },
  ];

  /** Every occurrence of every event inside the demo's date span. */
  function buildEventOccurrences() {
    const first = DAY0.getFullYear() - 1;
    const last = U.addDays(U.today(), 420).getFullYear();
    const out = [];
    for (let y = first; y <= last; y += 1) {
      EVENT_MASTER.forEach((e) => {
        const start = new Date(y, e.from[0], e.from[1]);
        // A window that wraps the new year (28 Dec – 2 Jan) ends next year.
        const endYear = e.to[0] < e.from[0] ? y + 1 : y;
        const end = new Date(endYear, e.to[0], e.to[1]);
        out.push({
          key: `${e.name}-${y}`,
          name: e.name,
          start: U.startOfDay(start),
          end: U.startOfDay(end),
          uplift: e.uplift,
        });
      });
    }
    return out.sort((a, b) => a.start - b.start);
  }

  const EVENTS = buildEventOccurrences();

  /** Multiplier applied to a day's sales by whatever events cover it. */
  function eventFactorOn(date) {
    let f = 1;
    for (let i = 0; i < EVENTS.length; i += 1) {
      const e = EVENTS[i];
      if (date >= e.start && date <= e.end) f *= 1 + e.uplift / 100;
    }
    return f;
  }

  // Precompute the per-day event factor once; it is the same for every SKU.
  const EVENT_FACTOR = new Array(HISTORY_DAYS + 500);
  for (let i = 0; i < EVENT_FACTOR.length; i += 1) {
    EVENT_FACTOR[i] = eventFactorOn(U.addDays(DAY0, i));
  }

  /** Factor for a day index, including days past the end of history. */
  function eventFactorAt(dayIndex) {
    if (dayIndex >= 0 && dayIndex < EVENT_FACTOR.length) return EVENT_FACTOR[dayIndex];
    return eventFactorOn(U.addDays(DAY0, dayIndex));
  }

  // Shoppers buy more at the weekend; the shape is the same across channels.
  const WEEKDAY = [0.92, 0.88, 0.9, 0.95, 1.08, 1.18, 1.09]; // Sun..Sat

  // Seasonal profiles by month, keyed by the product's "season" tag.
  const SEASON = {
    flat:    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    festive: [0.85, 0.82, 0.88, 0.9, 0.92, 0.9, 0.95, 1.05, 1.25, 1.45, 1.2, 0.95],
    summer:  [0.8, 0.85, 1.0, 1.25, 1.4, 1.3, 1.1, 1.0, 0.95, 0.9, 0.8, 0.75],
    winter:  [1.3, 1.15, 0.95, 0.8, 0.7, 0.68, 0.7, 0.78, 0.9, 1.05, 1.25, 1.4],
    newyear: [1.35, 1.1, 0.95, 0.9, 0.9, 0.88, 0.9, 0.95, 1.0, 1.1, 1.05, 1.2],
  };

  // Channels differ in size and in how much of a product's demand they take.
  const CHANNEL_WEIGHT = {
    Amazon: 1.0, Flipkart: 0.78, Myntra: 0.42, Meesho: 0.36,
    Nykaa: 0.3, Ajio: 0.26, Blinkit: 0.22, Shopify: 0.18,
  };

  // Which channels a category actually sells on.
  const CATEGORY_CHANNELS = {
    Audio: ["Amazon", "Flipkart", "Meesho", "Shopify"],
    Wearables: ["Amazon", "Flipkart", "Myntra", "Shopify"],
    "Mobile Accessories": ["Amazon", "Flipkart", "Meesho", "Blinkit"],
    "Home Appliances": ["Amazon", "Flipkart", "Shopify"],
    "Personal Care": ["Amazon", "Nykaa", "Blinkit", "Flipkart"],
    Kitchen: ["Amazon", "Flipkart", "Shopify", "Blinkit"],
    Apparel: ["Myntra", "Ajio", "Amazon", "Meesho"],
    Footwear: ["Myntra", "Ajio", "Flipkart", "Amazon"],
  };

  /** Build the listing rows: one product x channel = one SKU. */
  function buildSkus() {
    const rows = [];
    PRODUCTS.forEach((p, pi) => {
      const parentId = `PRT${String(1000 + pi)}`;
      const brand = BRANDS[pi % BRANDS.length];
      const channels = CATEGORY_CHANNELS[p.cat] || ["Amazon"];
      channels.forEach((channel, ci) => {
        const code = p.name
          .split(" ")
          .map((w) => w.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase())
          .join("")
          .slice(0, 9);
        const sku = `${code}-${channel.slice(0, 3).toUpperCase()}-${String(pi * 10 + ci).padStart(3, "0")}`;
        const rnd = U.mulberry32(U.hash(sku));
        // Channel price differs a little — marketplace fees and offers.
        const price = Math.round((p.mrp * (0.82 + rnd() * 0.16)) / 10) * 10;
        const base = p.base * (CHANNEL_WEIGHT[channel] || 0.3) * (0.75 + rnd() * 0.5);
        rows.push({
          sku,
          name: p.name,
          productId: `PRD${String(50000 + pi * 10 + ci)}`,
          parentId,
          brand,
          channel,
          category: p.cat,
          season: p.season,
          mrp: p.mrp,
          price,
          // Cost drives the cash side of the plan, not the revenue side.
          cost: Math.round(price * (0.55 + rnd() * 0.12)),
          trend: p.trend * (0.7 + rnd() * 0.6),
          baseRate: base,
          leadTimeDays: 18 + Math.floor(rnd() * 28),
          currentQty: Math.round(base * (20 + rnd() * 45)),
          orderedQty: Math.round(base * (4 + rnd() * 14)),
          pendingQty: Math.round(base * (1 + rnd() * 7)),
          _seed: U.hash(sku),
        });
      });
    });
    return rows;
  }

  const SKUS = buildSkus();
  const BY_SKU = new Map(SKUS.map((s) => [s.sku, s]));

  /*
   * Daily units sold, built once per SKU and cached.
   *
   * The series is the product of five independent shapes, which is what makes
   * the forecast worth running: a plain average of the look-back would miss
   * the trend, and ignoring the event factor would read a Diwali spike as the
   * new normal.
   */
  const SERIES = new Map();

  function seriesFor(sku) {
    if (SERIES.has(sku)) return SERIES.get(sku);
    const row = BY_SKU.get(sku);
    if (!row) return null;
    const rnd = U.mulberry32(row._seed);
    const season = SEASON[row.season] || SEASON.flat;
    const out = new Float64Array(HISTORY_DAYS);
    for (let i = 0; i < HISTORY_DAYS; i += 1) {
      const date = U.addDays(DAY0, i);
      const growth = 1 + (row.trend * i) / 365;
      const noise = 0.72 + rnd() * 0.56;
      const v =
        row.baseRate *
        growth *
        season[date.getMonth()] *
        WEEKDAY[date.getDay()] *
        EVENT_FACTOR[i] *
        noise;
      out[i] = Math.max(0, Math.round(v));
    }
    SERIES.set(sku, out);
    return out;
  }

  /** Day index of a date inside the history array (may fall outside it). */
  function indexOf(date) {
    return U.diffDays(DAY0, date);
  }

  /** Units sold for one SKU across [start, end] inclusive. */
  function soldBetween(sku, start, end) {
    const s = seriesFor(sku);
    if (!s) return 0;
    const a = Math.max(0, indexOf(start));
    const b = Math.min(HISTORY_DAYS - 1, indexOf(end));
    let total = 0;
    for (let i = a; i <= b; i += 1) total += s[i];
    return total;
  }

  /** The daily slice of history a look-back window covers. */
  function sliceBetween(sku, start, end) {
    const s = seriesFor(sku);
    if (!s) return [];
    const a = Math.max(0, indexOf(start));
    const b = Math.min(HISTORY_DAYS - 1, indexOf(end));
    const out = [];
    for (let i = a; i <= b; i += 1) out.push({ i, qty: s[i], date: U.addDays(DAY0, i) });
    return out;
  }

  // Purchase orders, used by the "Select from B2B PO" target mode.
  function buildPos() {
    const names = ["ABC Manufacturer", "Shreeji Exports", "Vertex Industries", "Kaveri Textiles"];
    const out = [];
    for (let i = 0; i < 8; i += 1) {
      const rnd = U.mulberry32(U.hash(`PO${i}`));
      // Each PO covers a slice of the catalogue.
      const picked = SKUS.filter((_, idx) => (idx + i) % 7 === 0).slice(0, 6 + Math.floor(rnd() * 6));
      const lines = picked.map((s) => ({
        sku: s.sku,
        ordered: Math.round(s.baseRate * (20 + rnd() * 40)),
        received: 0,
      }));
      lines.forEach((l) => {
        l.received = Math.round(l.ordered * (0.3 + rnd() * 0.6));
      });
      const value = lines.reduce((n, l) => n + l.ordered * (BY_SKU.get(l.sku).cost || 0), 0);
      const fill = lines.reduce((n, l) => n + l.received, 0) / Math.max(1, lines.reduce((n, l) => n + l.ordered, 0));
      out.push({
        key: `PO1000${i + 1}`,
        po: `PO 1000${i + 1}`,
        manufacturer: names[i % names.length],
        date: U.addDays(U.today(), -(10 + i * 9)),
        value,
        fill: Math.round(fill * 100),
        lines,
      });
    }
    return out;
  }

  const POS = buildPos();

  /** Distinct values for a filter field, for the target picker's dropdowns. */
  function optionsFor(field) {
    if (field === "channel") return CHANNELS.slice();
    if (field === "subcategory") return CATEGORIES.slice();
    if (field === "brand") return BRANDS.slice();
    const seen = new Set();
    SKUS.forEach((s) => seen.add(s[field]));
    return [...seen].sort();
  }

  FS.catalog = {
    HISTORY_DAYS, DAY0,
    CHANNELS, CATEGORIES, BRANDS,
    SKUS, BY_SKU, EVENTS, EVENT_MASTER, POS,
    seriesFor, soldBetween, sliceBetween, indexOf,
    eventFactorAt, eventFactorOn, optionsFor,
    WEEKDAY,
  };
})(window.FS);
