/*
 * Campaign storage.
 *
 * There is no backend, so localStorage plays the part of one: campaigns,
 * their scenarios and their computed results all live under a single key and
 * survive a reload. Clearing it reseeds the demo set.
 */
(function (FS) {
  "use strict";

  const U = FS.util;
  const KEY = "fs_demand_forecasting_v1";

  const LOOKBACK_OPTIONS = [
    { value: "last90", label: "Last 90 Days" },
    { value: "last60", label: "Last 60 Days" },
    { value: "last30", label: "Last 30 Days of Last Year" },
    { value: "current30", label: "Current 30 days of last year" },
  ];

  const FORECAST_PERIODS = [60, 90, 120];
  const DEFAULT_FORECAST_DAYS = 60;

  /** A preset look-back window, resolved against today. */
  function resolveLookback(preset) {
    const today = U.today();
    const yesterday = U.addDays(today, -1);
    switch (preset) {
      case "last60":
        return [U.addDays(yesterday, -59), yesterday];
      case "last30":
        // The 30 days ending a year ago yesterday.
        return [U.addDays(yesterday, -394), U.addDays(yesterday, -365)];
      case "current30":
        // The same 30 days as now, one year back.
        return [U.addDays(today, -365), U.addDays(today, -335)];
      case "last90":
      default:
        return [U.addDays(yesterday, -89), yesterday];
    }
  }

  function emptyAdjustments() {
    return { ads: [], price: [], custom: [], events: [] };
  }

  function defaultConstraints() {
    return { capital: 42.5, dio: 42, leadTime: 20 };
  }

  /** The event list the adjustments step ticks, split either side of today. */
  function eventRows() {
    const today = U.today();
    // Only the occurrences near the demo's window are worth offering.
    const from = U.addDays(today, -400);
    const to = U.addDays(today, 400);
    /* Past events read most-recent-first and future ones soonest-first, so the
       occurrence that actually matters sits at the top of either column. */
    const inRange = FS.catalog.EVENTS.filter((e) => e.start >= from && e.start <= to);
    const past = inRange.filter((e) => e.end < today).sort((a, b) => b.start - a.start);
    const future = inRange.filter((e) => e.end >= today).sort((a, b) => a.start - b.start);
    return past.concat(future).map((e) => ({
      key: e.key,
      name: e.name,
      start: U.ymd(e.start),
      end: U.ymd(e.end),
      range: `${U.fmtDate(e.start)} – ${U.fmtDate(e.end)}`,
      impact: e.uplift,
      direction: "increase",
      selected: false,
      isPast: e.end < today,
    }));
  }

  // ------------------------------------------------------------------ state
  let state = null;

  function blankCampaign(overrides) {
    const start = U.today();
    const end = U.addDays(start, DEFAULT_FORECAST_DAYS);
    const [ls, le] = resolveLookback("last90");
    return Object.assign(
      {
        id: nextId(),
        name: "",
        createdAt: Date.now(),
        status: "draft",
        parentId: null,
        forecastStart: U.ymd(start),
        forecastEnd: U.ymd(end),
        lookbackStart: U.ymd(ls),
        lookbackEnd: U.ymd(le),
        lookbackPreset: "last90",
        period: String(DEFAULT_FORECAST_DAYS),
        targetSelection: { mode: "direct", filters: {}, search: "", count: 0 },
        changeReference: false,
        referenceMapping: {},
        weighting: { modelType: "week", base: "AVG", weights: null },
        adjustments: emptyAdjustments(),
        constraints: defaultConstraints(),
        groupBy: "month",
        runStatus: "",
        result: null,
      },
      overrides || {}
    );
  }

  function nextId() {
    const s = state || { seq: 0 };
    s.seq = (s.seq || 0) + 1;
    return s.seq;
  }

  /** Four campaigns so the list is not empty on a first visit. */
  // Who a purchase order is raised against.
  const VENDORS = ["Acme Corp", "Global Supplies Ltd", "Premium Distributors", "Eastern Imports"];
  const WAREHOUSES = ["Warehouse 1", "Warehouse 2", "Warehouse 3"];

  function seed() {
    state = { seq: 0, campaigns: [], plans: [] };

    const mk = (over) => {
      const c = blankCampaign(over);
      state.campaigns.push(c);
      return c;
    };

    const today = U.today();

    mk({
      name: "Diwali Push Campaign",
      createdAt: U.addDays(today, -58).getTime(),
      status: "approved",
      forecastStart: U.ymd(U.addDays(today, -120)),
      forecastEnd: U.ymd(U.addDays(today, -30)),
      period: "90",
      targetSelection: { mode: "direct", filters: { channel: ["Amazon", "Flipkart"] }, search: "", count: 0 },
      runStatus: "Success",
    });

    mk({
      name: "Q1 Electronics Forecast",
      createdAt: U.addDays(today, -31).getTime(),
      status: "approved",
      period: "60",
      targetSelection: {
        mode: "direct",
        filters: { category: ["Audio", "Wearables", "Mobile Accessories"] },
        search: "",
        count: 0,
      },
      runStatus: "Success",
    });

    mk({
      name: "Summer Apparel Planning",
      createdAt: U.addDays(today, -12).getTime(),
      forecastEnd: U.ymd(U.addDays(today, 120)),
      period: "120",
      targetSelection: { mode: "direct", filters: { category: ["Apparel", "Footwear"] }, search: "", count: 0 },
      runStatus: "",
    });

    mk({
      name: "All Channel Base Plan",
      createdAt: U.addDays(today, -4).getTime(),
      period: "90",
      forecastEnd: U.ymd(U.addDays(today, 90)),
      targetSelection: { mode: "direct", filters: {}, search: "", count: 0 },
      runStatus: "",
    });

    seedPlans();
    save();
  }

  /** Two plans drawn from the seeded campaigns. */
  function seedPlans() {
    const today = U.today();
    const approved = state.campaigns.filter((c) => c.status === "approved");
    state.plans = [
      {
        id: nextId(),
        name: "PO-2026-001",
        createdAt: U.addDays(today, -22).getTime(),
        vendor: "Acme Corp",
        status: "approved",
        campaignIds: approved.slice(0, 1).map((c) => c.id),
        doi: 30,
        moqRules: [{ id: "m1", moq: 200 }],
        leadRules: [{ id: "l1", days: 32 }],
      },
      {
        id: nextId(),
        name: "PO-2026-002",
        createdAt: U.addDays(today, -9).getTime(),
        vendor: "Global Supplies Ltd",
        status: "draft",
        campaignIds: approved.slice(1, 2).map((c) => c.id),
        doi: 21,
        moqRules: [],
        leadRules: [],
      },
    ];
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.campaigns)) {
          state = parsed;
          if (!Array.isArray(state.plans)) {
            state.plans = [];
            seedPlans();
            save();
          }
          return;
        }
      }
    } catch (e) {
      // Corrupt or unavailable storage falls through to a fresh seed.
    }
    seed();
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      // Private-mode storage can refuse writes; the session still works.
    }
  }

  function ensure() {
    if (!state) load();
    return state;
  }

  // ------------------------------------------------------------------- API
  function listCampaigns(opts) {
    const o = opts || {};
    // Only base plans are listed; scenarios appear as tabs inside one.
    let rows = ensure().campaigns.filter((c) => !c.parentId && c.name);
    if (o.sortBy) {
      const dir = o.sortOrder === "desc" ? -1 : 1;
      rows = rows.slice().sort((a, b) => {
        const x = o.sortBy === "name" ? a.name.toLowerCase() : a.createdAt;
        const y = o.sortBy === "name" ? b.name.toLowerCase() : b.createdAt;
        if (x < y) return -1 * dir;
        if (x > y) return 1 * dir;
        return 0;
      });
    } else {
      rows = rows.slice().sort((a, b) => b.createdAt - a.createdAt);
    }
    return rows;
  }

  function getCampaign(id) {
    return ensure().campaigns.find((c) => c.id === Number(id)) || null;
  }

  /** A base plan and every scenario forked from it, in creation order. */
  function scenariosOf(id) {
    const base = getCampaign(id);
    if (!base) return [];
    const kids = ensure().campaigns.filter((c) => c.parentId === base.id);
    return [base].concat(kids.sort((a, b) => a.createdAt - b.createdAt));
  }

  function createCampaign(fields) {
    const c = blankCampaign(fields);
    ensure().campaigns.push(c);
    save();
    return c;
  }

  function updateCampaign(id, fields) {
    const c = getCampaign(id);
    if (!c) return null;
    Object.assign(c, fields);
    save();
    return c;
  }

  function deleteCampaign(id) {
    const s = ensure();
    s.campaigns = s.campaigns.filter((c) => c.id !== Number(id) && c.parentId !== Number(id));
    save();
  }

  /** Copy a scenario into a sibling of the base plan, the way the app does. */
  function duplicateScenario(sourceId, baseId) {
    const src = getCampaign(sourceId);
    const base = getCampaign(baseId) || src;
    if (!src) return null;
    const taken = new Set(scenariosOf(base.id).map((s) => s.name));
    const root = String(src.name || "Scenario").replace(/_\d+$/, "");
    let name = `${root}_1`;
    for (let i = 1; i < 100 && taken.has(name); i += 1) name = `${root}_${i + 1}`;

    const copy = blankCampaign(
      JSON.parse(
        JSON.stringify({
          name,
          status: "draft",
          parentId: base.id,
          forecastStart: src.forecastStart,
          forecastEnd: src.forecastEnd,
          lookbackStart: src.lookbackStart,
          lookbackEnd: src.lookbackEnd,
          lookbackPreset: src.lookbackPreset,
          period: src.period,
          targetSelection: src.targetSelection,
          changeReference: src.changeReference,
          referenceMapping: src.referenceMapping,
          weighting: src.weighting,
          adjustments: src.adjustments,
          constraints: src.constraints,
          groupBy: src.groupBy,
          runStatus: src.runStatus,
          result: src.result,
        })
      )
    );
    // blankCampaign stamped a fresh id and createdAt; keep those.
    ensure().campaigns.push(copy);
    save();
    return copy;
  }

  /** Run the engine for one campaign and store what it produced. */
  function runCampaign(id) {
    const c = getCampaign(id);
    if (!c) return null;
    const result = FS.engine.runForecast({
      forecastStart: c.forecastStart,
      forecastEnd: c.forecastEnd,
      lookbackStart: c.lookbackStart,
      lookbackEnd: c.lookbackEnd,
      targetSelection: c.targetSelection,
      referenceMapping: c.changeReference ? c.referenceMapping : {},
      weighting: c.weighting,
      adjustments: c.adjustments,
      constraints: c.constraints,
      groupBy: c.groupBy,
    });
    c.result = result;
    c.runStatus = result.rows.length ? "Success" : "Failed";
    c.lastRunAt = Date.now();
    save();
    return result;
  }

  // ------------------------------------------------------------ restock plans
  function listPlans() {
    return ensure().plans.slice().sort((a, b) => b.createdAt - a.createdAt);
  }

  function getPlan(id) {
    return ensure().plans.find((p) => p.id === Number(id)) || null;
  }

  function blankPlan() {
    const n = ensure().plans.length + 3;
    return {
      id: nextId(),
      name: `PO-2026-${String(n).padStart(3, "0")}`,
      createdAt: Date.now(),
      vendor: VENDORS[0],
      status: "draft",
      campaignIds: [],
      doi: 30,
      moqRules: [],
      leadRules: [],
    };
  }

  function createPlan(fields) {
    const p = Object.assign(blankPlan(), fields || {});
    ensure().plans.push(p);
    save();
    return p;
  }

  function updatePlan(id, fields) {
    const p = getPlan(id);
    if (!p) return null;
    Object.assign(p, fields);
    save();
    return p;
  }

  function deletePlan(id) {
    const st = ensure();
    st.plans = st.plans.filter((p) => p.id !== Number(id));
    save();
  }

  function resetAll() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      /* nothing to clear */
    }
    state = null;
    ensure();
  }

  FS.store = {
    LOOKBACK_OPTIONS, FORECAST_PERIODS, DEFAULT_FORECAST_DAYS,
    resolveLookback, emptyAdjustments, defaultConstraints, eventRows,
    listCampaigns, getCampaign, scenariosOf, createCampaign, updateCampaign,
    deleteCampaign, duplicateScenario, runCampaign, blankCampaign, resetAll, save,
    VENDORS, WAREHOUSES,
    listPlans, getPlan, createPlan, updatePlan, deletePlan, blankPlan,
  };
})(window.FS);
