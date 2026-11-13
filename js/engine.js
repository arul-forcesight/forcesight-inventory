/*
 * The forecast engine.
 *
 * This is the part that makes the demo a demo rather than a mockup: given a
 * campaign's saved settings it actually computes a per-SKU, per-day forecast
 * from the dummy sales history, and reports every stage it went through so
 * the result screen can show its working.
 *
 * Pipeline, in order:
 *   1  resolve the target set from the filters
 *   2  read each target's reference series over the look-back window
 *   3  bucket the look-back into weeks (or days)
 *   4  take AVG / MIN / MAX of each bucket
 *   5  apply the weighted-average model -> one baseline daily rate per SKU
 *   6  strip the uplift of any ticked PAST event out of that baseline
 *   7  measure trend across the look-back and damp it
 *   8  project each forecast day: baseline x trend x weekday x adjustments
 *   9  roll the days up into months (or weeks) and price them
 *  10  apply the capital / DIO constraints and report what they cost
 */
(function (FS) {
  "use strict";

  const U = FS.util;
  const C = FS.catalog;

  // ------------------------------------------------------------ 1. targeting
  /**
   * Which SKUs a selection covers.
   *
   * The filters ARE the selection — the same idea as the real module, where a
   * set of tens of thousands of SKUs is described rather than ticked.
   */
  function resolveTargets(selection) {
    const sel = selection || {};
    const filters = sel.filters || {};
    const terms = String(sel.search || "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    let rows = C.SKUS;

    // A PO-mode selection is a line list, not a filter set.
    if (sel.mode === "po" && sel.poKey) {
      const po = C.POS.find((p) => p.key === sel.poKey);
      const keep = new Set((po ? po.lines : []).map((l) => l.sku));
      rows = rows.filter((r) => keep.has(r.sku));
    }

    Object.keys(filters).forEach((field) => {
      const vals = filters[field];
      if (!Array.isArray(vals) || !vals.length) return;
      const set = new Set(vals.map(String));
      rows = rows.filter((r) => set.has(String(r[field])));
    });

    if (terms.length) {
      rows = rows.filter((r) => {
        const hay = `${r.sku} ${r.name}`.toLowerCase();
        return terms.some((t) => hay.includes(t));
      });
    }

    return rows;
  }

  // ------------------------------------------------- 3/4. buckets and stats
  /** Split a window into whole weeks (or days), the way the weights modal does. */
  function buildBuckets(start, end, unit) {
    const total = U.diffDays(start, end) + 1;
    if (total <= 0) return [];
    if (unit === "day") {
      const days = Math.min(total, 60);
      return Array.from({ length: days }, (_, i) => {
        const d = U.addDays(start, i);
        return { key: `d${i}`, label: String(i + 1), start: d, end: d };
      });
    }
    const weeks = Math.ceil(total / 7);
    return Array.from({ length: weeks }, (_, i) => {
      const s = U.addDays(start, i * 7);
      let e = U.addDays(start, i * 7 + 6);
      if (e > end) e = end;
      return { key: `w${i}`, label: `W${i + 1}`, start: s, end: e };
    });
  }

  /** An even split that still totals exactly 100. */
  function evenWeights(n) {
    if (!n) return [];
    const base = Math.floor((100 / n) * 100) / 100;
    const out = new Array(n).fill(base);
    const drift = +(100 - base * n).toFixed(2);
    out[n - 1] = +(out[n - 1] + drift).toFixed(2);
    return out;
  }

  /**
   * Weights the model picks for itself.
   *
   * "Using AI" means recent buckets count for more — an exponential ramp,
   * normalised to 100. It is the one base that does not ask the user to place
   * the weights by hand.
   */
  function aiWeights(n) {
    if (!n) return [];
    const raw = Array.from({ length: n }, (_, i) => Math.pow(1.22, i));
    const sum = raw.reduce((a, b) => a + b, 0);
    return raw.map((v) => +((v / sum) * 100).toFixed(2));
  }

  function bucketStat(values, base) {
    if (!values.length) return 0;
    if (base === "MIN") return Math.min.apply(null, values);
    if (base === "MAX") return Math.max.apply(null, values);
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  // ------------------------------------------------------------ adjustments
  /** Does an adjustment's scope cover this SKU? */
  function scopeCovers(scope, row) {
    if (!scope) return true;
    const filters = scope.filters || {};
    const keys = Object.keys(filters).filter((k) => (filters[k] || []).length);
    if (!keys.length) return true;
    return keys.every((k) => new Set(filters[k].map(String)).has(String(row[k])));
  }

  /** And does it cover this day? */
  function scopeActiveOn(scope, date) {
    if (!scope || !scope.range || !scope.range[0] || !scope.range[1]) return true;
    const a = U.startOfDay(scope.range[0]);
    const b = U.startOfDay(scope.range[1]);
    return date >= a && date <= b;
  }

  const signed = (dir, value) => (dir === "decrease" ? -Math.abs(value) : Math.abs(value));

  /**
   * Per-day multiplier for one SKU from every adjustment that touches it.
   *
   * Impacts compose multiplicatively — two +10% levers give +21%, not +20%,
   * which is how stacked promotions actually behave.
   */
  function adjustmentFactor(adj, row, date, eventsByName) {
    let f = 1;
    const a = adj || {};

    (a.ads || []).forEach((r) => {
      if (!scopeCovers(r.scope, row) || !scopeActiveOn(r.scope, date)) return;
      f *= 1 + signed(r.direction, Number(r.impact) || 0) / 100;
    });

    (a.price || []).forEach((r) => {
      if (!scopeCovers(r.scope, row) || !scopeActiveOn(r.scope, date)) return;
      f *= 1 + signed(r.impactDirection, Number(r.impact) || 0) / 100;
    });

    (a.custom || []).forEach((r) => {
      if (!scopeCovers(r.scope, row) || !scopeActiveOn(r.scope, date)) return;
      f *= 1 + signed(r.direction, Number(r.impact) || 0) / 100;
    });

    // Only ticked events count, and only on the days they actually run.
    (a.events || []).forEach((e) => {
      if (!e.selected) return;
      const start = U.startOfDay(e.start);
      const end = U.startOfDay(e.end);
      if (date < start || date > end) return;
      f *= 1 + signed(e.direction || "increase", Number(e.impact) || 0) / 100;
    });

    return f;
  }

  /** The price lever also moves revenue per unit, not just units. */
  function priceFactor(adj, row, date) {
    let f = 1;
    (adj && adj.price ? adj.price : []).forEach((r) => {
      if (!scopeCovers(r.scope, row) || !scopeActiveOn(r.scope, date)) return;
      f *= 1 + signed(r.direction, Number(r.change) || 0) / 100;
    });
    return f;
  }

  // --------------------------------------------------------------- the run
  /**
   * Run a campaign's settings through the pipeline.
   *
   * Returns the table the result screen renders plus a `stages` log, which is
   * what the "How this was computed" panel reads. Nothing here touches the
   * DOM or storage: same settings in, same numbers out, every time.
   */
  function runForecast(settings) {
    const t0 = performance.now();
    const stages = [];
    const note = (title, detail) => stages.push({ title, detail });

    const forecastStart = U.startOfDay(settings.forecastStart);
    const forecastEnd = U.startOfDay(settings.forecastEnd);
    const lookStart = U.startOfDay(settings.lookbackStart);
    const lookEnd = U.startOfDay(settings.lookbackEnd);
    const horizon = U.diffDays(forecastStart, forecastEnd) + 1;
    const lookDays = U.diffDays(lookStart, lookEnd) + 1;

    // 1 ------------------------------------------------------------------
    const targets = resolveTargets(settings.targetSelection);
    note(
      "Target set resolved",
      `${U.inr(targets.length)} SKUs matched the campaign's filters out of ${U.inr(C.SKUS.length)} in the catalogue.`
    );

    if (!targets.length) {
      return {
        periods: [], rows: [], totals: null, stages,
        groupBy: settings.groupBy || "month",
        ranAt: Date.now(), ms: Math.round(performance.now() - t0),
      };
    }

    // 2 ------------------------------------------------------------------
    const mapping = settings.referenceMapping || {};
    const mappedCount = Object.keys(mapping).length;
    note(
      "Reference series chosen",
      mappedCount
        ? `${mappedCount} SKU(s) forecast from a mapped source; the rest from their own history.`
        : `Every SKU forecasts from its own ${lookDays}-day history (${U.fmtRange(lookStart, lookEnd)}).`
    );

    // 3 ------------------------------------------------------------------
    const unit = settings.weighting && settings.weighting.modelType === "day" ? "day" : "week";
    const buckets = buildBuckets(lookStart, lookEnd, unit);

    // 5 ------------------------------------------------------------------
    const base = (settings.weighting && settings.weighting.base) || "AVG";
    const usingAi = base === "USING_AI";
    let weights;
    const saved = settings.weighting && settings.weighting.weights;
    if (usingAi) weights = aiWeights(buckets.length);
    else if (saved && saved.length === buckets.length) weights = saved.map((w) => Number(w.weight) || 0);
    else weights = evenWeights(buckets.length);

    note(
      "Look-back bucketed",
      `${buckets.length} ${unit === "day" ? "days" : "weeks"} · base statistic ${
        { AVG: "Average", MIN: "Minimum", MAX: "Maximum", USING_AI: "Model-chosen" }[base] || base
      }${usingAi ? " (weights ramped toward the most recent weeks)" : ""}.`
    );

    // 6 ------------------------------------------------------------------
    const tickedPast = (settings.adjustments && settings.adjustments.events ? settings.adjustments.events : [])
      .filter((e) => e.selected && U.startOfDay(e.end) < forecastStart);

    /** How much of the look-back a ticked past event distorted. */
    function pastEventDamping() {
      if (!tickedPast.length) return 1;
      let lifted = 0;
      let total = 0;
      for (let d = 0; d < lookDays; d += 1) {
        const date = U.addDays(lookStart, d);
        total += 1;
        let f = 1;
        tickedPast.forEach((e) => {
          if (date >= U.startOfDay(e.start) && date <= U.startOfDay(e.end)) {
            f *= 1 + signed(e.direction || "increase", Number(e.impact) || 0) / 100;
          }
        });
        lifted += f;
      }
      return total ? lifted / total : 1;
    }

    const damping = pastEventDamping();
    if (tickedPast.length) {
      note(
        "Past events removed from the baseline",
        `${tickedPast.length} ticked past event(s) lifted the look-back by ${U.pct((damping - 1) * 100)}; the baseline is divided back down so the spike is not read as the new normal.`
      );
    }

    // 7/8 ----------------------------------------------------------------
    const adjustments = settings.adjustments || {};
    const groupBy = settings.groupBy === "week" ? "week" : "month";

    /*
     * Strategy knobs. A risk stance is two numbers: how much of the forecast
     * you believe, and how many days of cover you hold beyond the lead time.
     * Both default to neutral, so a plain campaign is unaffected.
     */
    const stance = settings.constraints || {};
    const demandMultiplier = Number(stance.demandMultiplier) > 0 ? Number(stance.demandMultiplier) : 1;
    const safetyDays = Number(stance.safetyDays) || 0;

    // Weekday shape, normalised so it redistributes demand without inventing it.
    const weekdayMean = C.WEEKDAY.reduce((a, b) => a + b, 0) / 7;

    const periodSet = [];
    const periodSeen = new Set();
    const rows = [];
    const totalsByPeriod = {};
    let grandQty = 0;
    let grandValue = 0;
    let grandCost = 0;
    let baselineQty = 0; // the same window with no adjustments, for the deltas

    targets.forEach((row) => {
      const sourceSku = mapping[row.sku] || row.sku;
      const source = C.BY_SKU.get(sourceSku) || row;

      // 4/5: bucket stats, then the weighted blend.
      let baselineDaily = 0;
      buckets.forEach((b, i) => {
        const slice = C.sliceBetween(source.sku, b.start, b.end);
        const stat = bucketStat(slice.map((x) => x.qty), base);
        baselineDaily += (weights[i] || 0) / 100 * stat;
      });

      // A mapped source of a different size is rescaled onto the target.
      if (sourceSku !== row.sku && source.baseRate) {
        baselineDaily *= row.baseRate / source.baseRate;
      }

      baselineDaily = baselineDaily / (damping || 1);

      // 7: trend across the look-back, damped so a short window cannot run away.
      const half = Math.floor(lookDays / 2);
      const firstHalf = C.soldBetween(source.sku, lookStart, U.addDays(lookStart, half - 1));
      const secondHalf = C.soldBetween(source.sku, U.addDays(lookStart, half), lookEnd);
      let trend = 1;
      if (firstHalf > 0) {
        const raw = secondHalf / firstHalf;
        // Half the observed swing, capped — the horizon is short.
        trend = U.clamp(1 + (raw - 1) * 0.5, 0.7, 1.45);
      }

      const cells = {};
      let skuQty = 0;
      let skuValue = 0;
      let skuCost = 0;
      let skuBaseline = 0;

      for (let d = 0; d < horizon; d += 1) {
        const date = U.addDays(forecastStart, d);
        const key = groupBy === "week" ? U.weekKey(date, forecastStart) : U.monthKey(date);
        if (!periodSeen.has(key)) {
          periodSeen.add(key);
          periodSet.push(key);
        }

        // Trend builds across the horizon rather than landing on day one.
        const ramp = 1 + (trend - 1) * ((d + 1) / horizon);
        const weekday = C.WEEKDAY[date.getDay()] / weekdayMean;
        // A strategy's stance on the forecast: lean under 1, bullish over it.
        const plain = baselineDaily * ramp * weekday * demandMultiplier;
        const qty = plain * adjustmentFactor(adjustments, row, date, null);
        const unitPrice = row.price * priceFactor(adjustments, row, date);

        cells[key] = (cells[key] || 0) + qty;
        totalsByPeriod[key] = (totalsByPeriod[key] || 0) + qty;
        skuQty += qty;
        skuBaseline += plain;
        skuValue += qty * unitPrice;
        skuCost += qty * row.cost;
      }

      Object.keys(cells).forEach((k) => {
        cells[k] = Math.round(cells[k]);
      });

      skuQty = Math.round(skuQty);
      grandQty += skuQty;
      baselineQty += skuBaseline;
      grandValue += skuValue;
      grandCost += skuCost;

      // 10 (per row): how much cover the plan buys, and what is still short.
      const onHand = row.currentQty + row.pendingQty;
      const dailyAvg = skuQty / horizon;
      const coverDays = dailyAvg > 0 ? onHand / dailyAvg : 999;

      rows.push({
        key: row.sku,
        sku: row.sku,
        name: row.name,
        channel: row.channel,
        category: row.category,
        price: row.price,
        cells,
        qty: skuQty,
        value: Math.round(skuValue),
        cost: Math.round(skuCost),
        onHand,
        coverDays: Math.round(coverDays),
        // What to buy: demand over the horizon, plus lead-time and safety
        // cover, less what is already on hand or inbound.
        restock: Math.max(
          0,
          Math.round(skuQty + dailyAvg * (row.leadTimeDays + safetyDays) - onHand)
        ),
        leadTimeDays: row.leadTimeDays,
      });
    });

    periodSet.sort();
    Object.keys(totalsByPeriod).forEach((k) => {
      totalsByPeriod[k] = Math.round(totalsByPeriod[k]);
    });

    note(
      "Daily projection built",
      `${U.inr(targets.length * horizon)} SKU-days projected across ${horizon} days, rolled into ${periodSet.length} ${groupBy === "week" ? "weeks" : "months"}.`
    );

    const adjCount =
      (adjustments.ads || []).length +
      (adjustments.price || []).length +
      (adjustments.custom || []).length +
      (adjustments.events || []).filter((e) => e.selected).length;
    const lift = baselineQty > 0 ? (grandQty / baselineQty - 1) * 100 : 0;
    if (adjCount) {
      note(
        "Adjustments applied",
        `${adjCount} active adjustment(s) moved the plan by ${lift >= 0 ? "+" : ""}${U.pct(lift)} against the unadjusted baseline.`
      );
    } else {
      note("Adjustments applied", "None configured — the plan is the raw baseline projection.");
    }

    // 10 -----------------------------------------------------------------
    const constraints = settings.constraints || {};
    const budget = Number(constraints.capital) > 0 ? Number(constraints.capital) * 1e7 : 0;
    let capitalScale = 1;
    const restockCost = rows.reduce((n, r) => n + r.restock * (C.BY_SKU.get(r.sku).cost || 0), 0);
    if (budget && restockCost > budget) {
      capitalScale = budget / restockCost;
      rows.forEach((r) => {
        r.restock = Math.round(r.restock * capitalScale);
      });
      note(
        "Capital constraint applied",
        `Restock of ${U.compactMoney(restockCost)} exceeds the ${U.compactMoney(budget)} budget — quantities scaled to ${U.pct(capitalScale * 100, 0)}.`
      );
    } else if (budget) {
      note(
        "Capital constraint checked",
        `Restock of ${U.compactMoney(restockCost)} sits inside the ${U.compactMoney(budget)} budget.`
      );
    }

    const plannedCost = rows.reduce((n, r) => n + r.restock * (C.BY_SKU.get(r.sku).cost || 0), 0);
    const cogsPerDay = grandCost / horizon;
    const dio = cogsPerDay > 0 ? (plannedCost + rows.reduce((n, r) => n + r.onHand * (C.BY_SKU.get(r.sku).cost || 0), 0)) / cogsPerDay : 0;
    const atRisk = rows.filter((r) => r.coverDays < (Number(constraints.leadTime) || 20));

    const totals = {
      count: rows.length,
      qty: grandQty,
      value: Math.round(grandValue),
      cost: Math.round(grandCost),
      byPeriod: totalsByPeriod,
      restockUnits: rows.reduce((n, r) => n + r.restock, 0),
      restockValue: Math.round(plannedCost),
      dio: Math.round(dio),
      atRisk: atRisk.length,
      riskPct: rows.length ? (atRisk.length / rows.length) * 100 : 0,
      lift,
      capitalScale,
      horizon,
      lookDays,
    };

    note(
      "Plan costed",
      `${U.inr(totals.restockUnits)} units to buy at ${U.compactMoney(totals.restockValue)}, covering ${U.compactMoney(totals.value)} of forecast revenue.`
    );

    return {
      periods: periodSet,
      rows,
      totals,
      stages,
      groupBy,
      weights,
      buckets: buckets.map((b) => ({ label: b.label, start: U.ymd(b.start), end: U.ymd(b.end) })),
      ranAt: Date.now(),
      ms: Math.round(performance.now() - t0),
    };
  }

  /** Units a selection moved over the look-back — the picker's totals row. */
  function selectionQty(rows, start, end) {
    return rows.reduce((n, r) => n + C.soldBetween(r.sku, start, end), 0);
  }

  FS.engine = {
    resolveTargets, runForecast, buildBuckets, evenWeights, aiWeights, selectionQty,
  };
})(window.FS);
