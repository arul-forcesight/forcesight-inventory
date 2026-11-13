/*
 * Adjustment rows.
 *
 * The wizard's Adjustments step and the result screen's Constrains modal both
 * render these, so an ad-spend row means the same thing in either place and
 * the engine reads one shape.
 */
(function (FS) {
  "use strict";

  const U = FS.util;
  const { el, icon } = FS.ui;

  const DIRECTIONS = [
    { value: "increase", label: "Increase" },
    { value: "decrease", label: "Decrease" },
  ];

  let seq = 0;
  function newRow(group) {
    seq += 1;
    const id = `r${seq}_${Date.now() % 100000}`;
    if (group === "ads") {
      return { id, spend: 200000, direction: "increase", impact: 2, scope: null };
    }
    if (group === "price") {
      return {
        id, direction: "decrease", change: 2,
        impactDirection: "increase", impact: 2, scope: null,
      };
    }
    return { id, name: "New Launch Week", direction: "increase", impact: 2, scope: null };
  }

  /** Scope chip + the two trailing buttons every row carries. */
  function rowTools(row, handlers) {
    const scope = row.scope;
    const chips = Object.keys((scope && scope.filters) || {})
      .map((k) => (scope.filters[k] || []).join(", "))
      .filter(Boolean);
    const dates =
      scope && scope.range
        ? `${U.fmtDate(scope.range[0])}–${U.fmtDate(scope.range[1])}`
        : null;
    const summary = [dates, chips.join(" · ")].filter(Boolean).join(" · ");

    return el("div.row-tools", {}, [
      summary ? el("span.scope-chip", { title: summary, text: summary }) : null,
      handlers.onScope
        ? el("button.icon-btn.soft", {
            title: "Dates and item filters for this adjustment",
            onclick: handlers.onScope,
          }, [icon("more", 15)])
        : null,
      el("button.icon-btn.soft.danger", {
        title: "Remove this adjustment",
        onclick: handlers.onRemove,
      }, [icon("close", 15)]),
    ]);
  }

  function numberInput(value, onChange, opts) {
    const o = opts || {};
    return el("input.num-input", {
      type: "number",
      value: value,
      step: o.step || 1,
      min: o.min === undefined ? 0 : o.min,
      oninput: (e) => onChange(Number(e.target.value)),
      class: o.className || "",
    });
  }

  function pctUnit() {
    return el("span.unit-box", { text: "%" });
  }

  function dirSelect(value, onChange) {
    return FS.ui.select(DIRECTIONS, value, onChange, { className: "select-sm" });
  }

  function adsRow(row, handlers) {
    return el("div.adj-row", {}, [
      el("span.adj-label", { text: "Spend Value" }),
      el("div.input-wrap.money-wrap", {}, [
        el("span.prefix", { text: "₹" }),
        numberInput(row.spend, (v) => { row.spend = v; handlers.onChange(); }, { step: 1000, className: "wide" }),
      ]),
      el("span.divider"),
      el("span.adj-label", { text: "Impact Factor" }),
      dirSelect(row.direction, (v) => { row.direction = v; handlers.onChange(); }),
      numberInput(row.impact, (v) => { row.impact = v; handlers.onChange(); }, { step: 0.5 }),
      pctUnit(),
      rowTools(row, handlers),
    ]);
  }

  function priceRow(row, handlers) {
    return el("div.adj-row", {}, [
      FS.ui.select(
        [
          { value: "decrease", label: "Price Decrease" },
          { value: "increase", label: "Price Increase" },
        ],
        row.direction,
        (v) => { row.direction = v; handlers.onChange(); },
        { className: "select-md" }
      ),
      el("span.adj-label", { text: "By" }),
      numberInput(row.change, (v) => { row.change = v; handlers.onChange(); }, { step: 0.5 }),
      pctUnit(),
      el("span.adj-label", { text: "Will Impact Sales By" }),
      numberInput(row.impact, (v) => { row.impact = v; handlers.onChange(); }, { step: 0.5 }),
      pctUnit(),
      dirSelect(row.impactDirection, (v) => { row.impactDirection = v; handlers.onChange(); }),
      rowTools(row, handlers),
    ]);
  }

  function customRow(row, handlers) {
    return el("div.adj-row", {}, [
      el("span.adj-label", { text: "Name" }),
      el("input.input.name-input", {
        type: "text",
        value: row.name,
        oninput: (e) => { row.name = e.target.value; handlers.onChange(); },
      }),
      el("span.adj-label", { text: "Impact Sales By" }),
      dirSelect(row.direction, (v) => { row.direction = v; handlers.onChange(); }),
      numberInput(row.impact, (v) => { row.impact = v; handlers.onChange(); }, { step: 0.5 }),
      pctUnit(),
      rowTools(row, handlers),
    ]);
  }

  /** Events are ticked, never added — they come from the event master. */
  function eventRow(evt, onChange) {
    return el(`div.evt-row${evt.selected ? " on" : ""}`, {}, [
      el("input", {
        type: "checkbox",
        checked: evt.selected || null,
        onchange: (e) => {
          evt.selected = e.target.checked;
          onChange();
        },
      }),
      el("div.evt-meta", {}, [
        el("span.evt-name", { text: evt.name }),
        el("span.evt-range", { text: evt.range }),
      ]),
      el("input.num-input", {
        type: "number",
        value: evt.impact,
        step: 1,
        disabled: !evt.selected || null,
        oninput: (e) => {
          evt.impact = Number(e.target.value);
          onChange();
        },
      }),
      el("span.unit-box", { text: "%" }),
      FS.ui.select(
        DIRECTIONS,
        evt.direction || "increase",
        (v) => {
          evt.direction = v;
          onChange();
        },
        { className: "select-sm", disabled: !evt.selected }
      ),
    ]);
  }

  /** Counts for the tab labels; events are split past | future. */
  function counts(adj) {
    const a = adj || {};
    const picked = (a.events || []).filter((e) => e.selected);
    return {
      ads: (a.ads || []).length,
      price: (a.price || []).length,
      custom: (a.custom || []).length,
      eventsPast: picked.filter((e) => e.isPast).length,
      eventsFuture: picked.filter((e) => !e.isPast).length,
    };
  }

  /**
   * The ticked-events list, refreshed against the master so a campaign saved
   * before an event existed still picks it up.
   */
  function ensureEvents(campaign) {
    const master = FS.store.eventRows();
    const saved = new Map((campaign.adjustments.events || []).map((e) => [e.key, e]));
    campaign.adjustments.events = master.map((e) => {
      const hit = saved.get(e.key);
      return hit ? Object.assign({}, e, { selected: hit.selected, impact: hit.impact, direction: hit.direction }) : e;
    });
    return campaign.adjustments.events;
  }

  FS.adjustments = {
    newRow, adsRow, priceRow, customRow, eventRow, counts, ensureEvents, rowTools,
    numberInput, dirSelect, DIRECTIONS,
  };
})(window.FS);
