/*
 * Restock — turning an approved forecast into a purchase order.
 *
 * A plan points at one or more demand-forecasting campaigns and reads their
 * computed rows. Nothing is forecast again here: the quantities come from the
 * runs the campaigns already produced, and this module only decides what to
 * buy, from whom, and what to move between warehouses.
 *
 *   Required  = forecast + DOI cover - in hand
 *   To buy    = Required rounded up to the SKU's MOQ
 *   Transfers = a warehouse holding more than it needs ships to one short
 */
(function (FS) {
  "use strict";

  const U = FS.util;
  const S = FS.store;
  const C = FS.catalog;

  // In-hand stock is spread across the warehouses in fixed proportions; the
  // rotation keeps one site from always being the big one.
  const SPLITS = [
    [0.5, 0.3, 0.2],
    [0.25, 0.5, 0.25],
    [0.2, 0.3, 0.5],
  ];

  /**
   * The campaigns a plan draws from.
   *
   * A seeded campaign carries a Success status but computes its rows lazily on
   * first open — so a plan built before anyone visited the forecast screen has
   * to trigger that run itself, or it reads as covering nothing.
   */
  function sourceCampaigns(plan) {
    return (plan.campaignIds || [])
      .map((id) => {
        const c = S.getCampaign(id);
        if (c && !c.result && c.runStatus === "Success") S.runCampaign(c.id);
        return c;
      })
      .filter((c) => c && c.result && c.result.rows.length);
  }

  /** Round a quantity up to the next whole multiple of the order minimum. */
  function applyMoq(qty, moq) {
    if (!moq || moq <= 1 || qty <= 0) return qty;
    return Math.ceil(qty / moq) * moq;
  }

  /**
   * Build the plan's lines from its campaigns.
   *
   * A SKU appearing in two campaigns is summed once, which is the point of
   * letting a plan select several: one purchase order covers them all.
   */
  function buildPlan(plan) {
    const campaigns = sourceCampaigns(plan);
    const moq = (plan.moqRules || []).reduce((n, r) => Math.max(n, Number(r.moq) || 0), 0);
    const leadOverride = (plan.leadRules || []).reduce((n, r) => Math.max(n, Number(r.days) || 0), 0);
    const doi = Number(plan.doi) || 0;

    const bySku = new Map();

    campaigns.forEach((c) => {
      const horizon = c.result.totals.horizon || 1;
      c.result.rows.forEach((row) => {
        const hit = bySku.get(row.sku) || {
          sku: row.sku,
          name: row.name,
          channel: row.channel,
          forecastQty: 0,
          inHand: 0,
          dailyRate: 0,
          price: 0,
          leadTimeDays: row.leadTimeDays,
        };
        hit.forecastQty += row.qty;
        // Stock on hand is a property of the SKU, not of the campaign, so it
        // must not be added twice when two campaigns share a SKU.
        hit.inHand = row.onHand;
        hit.dailyRate += row.qty / horizon;
        hit.price = C.BY_SKU.get(row.sku) ? C.BY_SKU.get(row.sku).cost : 0;
        if (leadOverride) hit.leadTimeDays = leadOverride;
        bySku.set(row.sku, hit);
      });
    });

    const lines = [...bySku.values()].map((r) => {
      const doiCover = Math.round(r.dailyRate * doi);
      const required = Math.max(0, Math.round(r.forecastQty + doiCover - r.inHand));
      const toPurchase = applyMoq(required, moq);
      return Object.assign(r, {
        forecastQty: Math.round(r.forecastQty),
        doiCover,
        required,
        toPurchase,
        value: toPurchase * r.price,
      });
    });

    lines.sort((a, b) => b.value - a.value);

    // --- per-warehouse view
    const warehouseLines = [];
    lines.forEach((line, i) => {
      const split = SPLITS[i % SPLITS.length];
      S.WAREHOUSES.forEach((wh, w) => {
        const forecastQty = Math.round(line.forecastQty * split[w]);
        const inHand = Math.round(line.inHand * split[(w + 1) % 3]);
        warehouseLines.push({
          channel: line.channel,
          sku: line.sku,
          warehouse: wh,
          forecastQty,
          inHand,
          required: Math.max(0, forecastQty - inHand),
        });
      });
    });

    // --- transfers: a site with spare stock ships to one that is short
    const transfers = [];
    lines.forEach((line) => {
      const rows = warehouseLines.filter((w) => w.sku === line.sku);
      const surplus = rows.filter((r) => r.inHand > r.forecastQty);
      const deficit = rows.filter((r) => r.inHand < r.forecastQty);
      deficit.forEach((d) => {
        const from = surplus.find((s) => s.inHand - s.forecastQty > 0);
        if (!from) return;
        const qty = Math.min(from.inHand - from.forecastQty, d.forecastQty - d.inHand);
        if (qty <= 0) return;
        from.inHand -= qty;
        transfers.push({
          channel: line.channel,
          sku: line.sku,
          from: from.warehouse,
          to: d.warehouse,
          qty,
        });
      });
    });

    const totals = {
      skus: lines.length,
      forecastQty: lines.reduce((n, r) => n + r.forecastQty, 0),
      inHand: lines.reduce((n, r) => n + r.inHand, 0),
      required: lines.reduce((n, r) => n + r.required, 0),
      toPurchase: lines.reduce((n, r) => n + r.toPurchase, 0),
      // What this order costs — the cash that leaves on raising the PO.
      value: lines.reduce((n, r) => n + r.value, 0),
      // The whole inventory position once it lands: stock on hand plus the buy.
      inventoryValue: lines.reduce((n, r) => n + (r.inHand + r.toPurchase) * r.price, 0),
      transferQty: transfers.reduce((n, r) => n + r.qty, 0),
      // Headline figures, read off the campaigns this plan covers.
      revenue: campaigns.reduce((n, c) => n + c.result.totals.value, 0),
      dio: campaigns.length
        ? Math.round(campaigns.reduce((n, c) => n + c.result.totals.dio, 0) / campaigns.length)
        : 0,
      riskPct: campaigns.length
        ? campaigns.reduce((n, c) => n + c.result.totals.riskPct, 0) / campaigns.length
        : 0,
      moq,
      leadOverride,
      maxLead: lines.reduce((n, r) => Math.max(n, r.leadTimeDays), 0),
    };

    return { lines, warehouseLines, transfers, totals, campaigns };
  }

  FS.restock = { buildPlan, sourceCampaigns, applyMoq };
})(window.FS);
