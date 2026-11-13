/*
 * Core namespace, date helpers and formatting.
 *
 * Everything in this demo is static: no backend, no build step. The files are
 * plain <script> tags loaded in order, so each one hangs its exports off the
 * single FS global rather than using ES modules (which file:// refuses to load).
 */
window.FS = window.FS || {};

(function (FS) {
  "use strict";

  // ---------------------------------------------------------------- dates
  const MS_DAY = 86400000;

  /** Midnight today, so every window is measured from the same instant. */
  function today() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(date, n) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /** Whole days between two dates, ignoring clock time. */
  function diffDays(a, b) {
    return Math.round((startOfDay(b) - startOfDay(a)) / MS_DAY);
  }

  /* Accepts a Date, an epoch number, or a "YYYY-MM-DD" string — campaigns
     store dates as strings but stamp createdAt as a number. */
  function startOfDay(d) {
    let x;
    if (d instanceof Date) x = new Date(d.getTime());
    else if (typeof d === "number") x = new Date(d);
    else x = new Date(Date.parse(d));
    x.setHours(0, 0, 0, 0);
    return x;
  }

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /** "08 Mar 26" — the format the Figma board uses throughout. */
  function fmtDate(d) {
    if (!d) return "—";
    const x = startOfDay(d);
    return `${String(x.getDate()).padStart(2, "0")} ${MONTHS[x.getMonth()]} ${String(x.getFullYear()).slice(2)}`;
  }

  /** "Mar 8, 2026" — used by the campaigns table's created column. */
  function fmtLongDate(d) {
    if (!d) return "—";
    const x = startOfDay(d);
    return `${MONTHS[x.getMonth()]} ${x.getDate()}, ${x.getFullYear()}`;
  }

  function fmtRange(a, b) {
    if (!a || !b) return "—";
    return `${fmtDate(a)} – ${fmtDate(b)}`;
  }

  /** "2026-03-08" — the key shape used for storage and month buckets. */
  function ymd(d) {
    const x = startOfDay(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  }

  function monthKey(d) {
    const x = startOfDay(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
  }

  /** "2026-03" -> "Mar 2026" for the forecast table's column heads. */
  function monthLabel(key) {
    const [y, m] = String(key).split("-");
    return `${MONTHS[Number(m) - 1]} ${y}`;
  }

  /** ISO-ish week key, good enough to group a forecast window by week. */
  function weekKey(d, origin) {
    const n = Math.floor(diffDays(origin, d) / 7);
    return `W${String(n + 1).padStart(2, "0")}`;
  }

  // ------------------------------------------------------------ formatting
  /** Indian digit grouping — 12,34,567, not 1,234,567. */
  function inr(n) {
    return Math.round(Number(n) || 0).toLocaleString("en-IN");
  }

  function money(n) {
    return "₹" + inr(n);
  }

  /** ₹1.2Cr / ₹3.4L / ₹5,600 — whichever reads smallest. */
  function compactMoney(n) {
    const v = Number(n) || 0;
    const abs = Math.abs(v);
    if (abs >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
    if (abs >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
    if (abs >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
    return `₹${Math.round(v)}`;
  }

  function compactQty(n) {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1e5) return `${(v / 1e5).toFixed(2)}L`;
    if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return inr(v);
  }

  function pct(n, digits) {
    return `${(Number(n) || 0).toFixed(digits === undefined ? 1 : digits)}%`;
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  // -------------------------------------------------------------- randomness
  /*
   * Seeded PRNG. The sales history has to be identical on every reload —
   * a forecast that changed its own inputs between runs would be impossible
   * to demo, let alone compare two scenarios against.
   */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Stable string -> int, so a SKU name always seeds the same series. */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function uid(prefix) {
    uid.n = (uid.n || 0) + 1;
    return `${prefix || "id"}_${uid.n}_${Math.floor(Math.random() * 1e6)}`;
  }

  FS.util = {
    MS_DAY, MONTHS,
    today, addDays, diffDays, startOfDay,
    fmtDate, fmtLongDate, fmtRange, ymd, monthKey, monthLabel, weekKey,
    inr, money, compactMoney, compactQty, pct, clamp,
    mulberry32, hash, uid,
  };
})(window.FS);
