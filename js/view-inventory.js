/*
 * Three read-only inventory screens: B2B PO View, Slow Moving Inventory and
 * Inventory View.
 *
 * All three are the same shape — a filter bar, a card, a table, a totals row —
 * so they share one renderer and differ only in their columns and in how they
 * derive rows from the catalogue.
 */
(function (FS) {
  "use strict";

  const U = FS.util;
  const C = FS.catalog;
  const S = FS.store;
  const { el, icon, clear, select, toast } = FS.ui;

  const GST = 0.18;
  // The window every rate in these screens is measured over.
  const SALES_WINDOW = 90;

  // Per-screen filter state, kept between visits.
  const filters = {
    b2b: { channel: "All" },
    slow: { channel: "All", costOfCapital: 12 },
    inv: { viewBy: "sku", combo: false },
  };

  // ------------------------------------------------------------- shared bits
  /** Average units a SKU sold per day over the sales window. */
  function dailyRate(sku) {
    const end = U.addDays(U.today(), -1);
    const start = U.addDays(end, -(SALES_WINDOW - 1));
    return C.soldBetween(sku, start, end) / SALES_WINDOW;
  }

  /** The most recent day the SKU actually sold anything. */
  function lastSold(sku) {
    const series = C.seriesFor(sku);
    if (!series) return null;
    for (let i = series.length - 1; i >= 0; i -= 1) {
      if (series[i] > 0) return U.addDays(C.DAY0, i);
    }
    return null;
  }

  /** Stock is held across three sites; the rotation varies which is largest. */
  const SPLITS = [
    [0.5, 0.3, 0.2],
    [0.25, 0.5, 0.25],
    [0.2, 0.3, 0.5],
  ];
  const splitFor = (i) => SPLITS[i % SPLITS.length];

  /** A stable warehouse row id, so the same SKU keeps the same one. */
  const rowId = (sku, w) => `WH-${(U.hash(sku + w) % 900) + 100}`;

  /**
   * The filter bar that sits above the card on all three screens.
   * Controls are passed in; the Filter button on the right is decorative on
   * these read-only screens and says so.
   */
  function filterBar(controls) {
    return el("div.filter-bar", {}, [
      el("div.fb-left", {}, controls),
      el("button.fb-filter", {
        onclick: () => toast("Column filters are not part of this demo.", "info"),
      }, [el("span", { text: "Filter" }), icon("chevronDown", 13)]),
    ]);
  }

  /** A labelled pill select, matching the board's "Channel: All" control. */
  function pillSelect(label, options, value, onChange) {
    return el("div.fb-pill", {}, [
      el("span.fb-pill-label", { text: label }),
      select(options, value, onChange, { className: "fb-pill-select" }),
    ]);
  }

  /**
   * The card every screen shares: title, export, table, pinned totals.
   *
   * `cols` entries carry how to read and format a cell; `total` says whether
   * the column is summed into the footer and how.
   */
  function tableCard(opts) {
    const { title, note, cols, rows, tools } = opts;
    const card = el("div.card");
    let search = "";

    const head = el("div.card-head.compact", {}, [
      el("div.inv-title", {}, [
        el("h3.card-title.sm", { text: title }),
        note ? el("span.inv-info", { title: note }, [icon("info", 14)]) : null,
      ]),
      el("span.grow"),
      ...(tools || []),
      el("div.input-wrap", {}, [
        icon("search", 14),
        el("input.input", {
          type: "text",
          placeholder: "Search...",
          oninput: (e) => {
            search = e.target.value;
            paint();
            const f = card.querySelector(".input-wrap input");
            if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
          },
        }),
      ]),
      el("button.btn.btn-dark", {
        onclick: () => exportCsv(title, cols, shown()),
      }, [el("span", { text: "Export" }), icon("chevronDown", 12)]),
    ]);
    card.appendChild(head);

    const body = el("div");
    card.appendChild(body);

    function shown() {
      const q = search.trim().toLowerCase();
      if (!q) return rows;
      return rows.filter((r) =>
        cols.some((c) => String(c.get(r)).toLowerCase().includes(q))
      );
    }

    function paint() {
      clear(body);
      const list = shown();
      if (!list.length) {
        body.appendChild(FS.ui.empty("Nothing to show", "Try widening the filters above."));
        return;
      }

      const table = el("table.table.inv-table");
      table.appendChild(
        el("thead", {}, [
          el("tr", {}, cols.map((c) =>
            el(`th${c.align === "right" ? ".right" : ""}`, { text: c.label })
          )),
        ])
      );

      const tbody = el("tbody");
      list.slice(0, 300).forEach((r) => {
        tbody.appendChild(
          el("tr", {}, cols.map((c) => {
            const node = el(`td${c.align === "right" ? ".right" : ""}${c.accent ? ".blue" : ""}`);
            if (c.render) node.appendChild(c.render(r));
            else node.textContent = c.fmt ? c.fmt(c.get(r)) : String(c.get(r));
            return node;
          }))
        );
      });
      table.appendChild(tbody);

      // Totals across everything the filters left in, not just the page.
      const foot = el("tr");
      cols.forEach((c, i) => {
        if (i === 0) return foot.appendChild(el("td", { text: "Total" }));
        if (!c.total) return foot.appendChild(el("td"));
        const sum = list.reduce((n, r) => n + (Number(c.get(r)) || 0), 0);
        foot.appendChild(
          el(`td.right${c.accent ? ".blue" : ""}`, { text: c.fmt ? c.fmt(sum) : U.inr(sum) })
        );
      });
      table.appendChild(el("tfoot", {}, [foot]));

      body.appendChild(el("div.table-wrap.scroll.inv-scroll", {}, [table]));
      if (list.length > 300) {
        body.appendChild(el("p.preview-more", { text: `…and ${U.inr(list.length - 300)} more rows` }));
      }
    }

    paint();
    return card;
  }

  function exportCsv(title, cols, rows) {
    const lines = [cols.map((c) => c.label).join(",")].concat(
      rows.map((r) => cols.map((c) => `"${c.get(r)}"`).join(","))
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^\w]+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("CSV downloaded.", "success");
  }

  const money = (n) => U.money(n);
  const qty = (n) => U.inr(n);

  // ------------------------------------------------------------ B2B PO View
  /** Every purchase-order line, one row per PO × SKU. */
  function b2bRows() {
    const out = [];
    C.POS.forEach((po) => {
      po.lines.forEach((line) => {
        const sku = C.BY_SKU.get(line.sku);
        if (!sku) return;
        const fill = line.ordered ? Math.round((line.received / line.ordered) * 100) : 0;
        out.push({
          po: po.po,
          channel: sku.channel,
          sku: sku.sku,
          date: po.date,
          // A line is closed once it is fully received, open while it is not.
          status: fill >= 100 ? "Full filled" : fill === 0 ? "Cancelled" : "Open",
          value: line.ordered * sku.cost,
          ordered: line.ordered,
          received: line.received,
          fill,
          gap: Math.max(0, line.ordered - line.received),
          inHand: sku.currentQty,
        });
      });
    });
    return out;
  }

  function renderB2b(host) {
    const f = filters.b2b;
    host.appendChild(
      filterBar([
        pillSelect(
          "Channel:",
          [{ value: "All", label: "All" }].concat(C.CHANNELS.map((c) => ({ value: c, label: c }))),
          f.channel,
          (v) => { f.channel = v; FS.shell.refresh(); }
        ),
      ])
    );

    let rows = b2bRows();
    if (f.channel !== "All") rows = rows.filter((r) => r.channel === f.channel);

    host.appendChild(
      tableCard({
        title: "B2B PO View",
        note: "Every purchase-order line raised against the catalogue, with how much has landed.",
        rows,
        cols: [
          { label: "PO Number", get: (r) => r.po },
          { label: "Channel", get: (r) => r.channel },
          { label: "SKU", get: (r) => r.sku },
          { label: "PO Date", get: (r) => r.date, fmt: (v) => U.fmtDate(v) },
          {
            label: "PO status",
            get: (r) => r.status,
            render: (r) =>
              FS.ui.pill(
                r.status,
                r.status === "Full filled" ? "green" : r.status === "Open" ? "amber" : "grey"
              ),
          },
          { label: "PO Value", get: (r) => r.value, align: "right", fmt: money, total: true },
          { label: "Ordered Qty", get: (r) => r.ordered, align: "right", fmt: qty, total: true },
          { label: "Received Qty", get: (r) => r.received, align: "right", fmt: qty, total: true },
          { label: "Fill Rate", get: (r) => r.fill, align: "right", fmt: (v) => `${Math.round(v)}%` },
          { label: "Gap To GO", get: (r) => r.gap, align: "right", fmt: qty, total: true },
          { label: "Inventory In Hand", get: (r) => r.inHand, align: "right", fmt: qty, total: true },
        ],
      })
    );
  }

  // --------------------------------------------------- Slow Moving Inventory
  /**
   * SKU × warehouse rows, kept to the stock that is turning too slowly.
   *
   * DOI is how many days the stock on hand would last at the current rate.
   * Anything past the ideal is capital sitting still, which is what the cost
   * of capital above the table prices.
   */
  function slowRows(costOfCapital) {
    const out = [];
    C.SKUS.forEach((s, i) => {
      const rate = dailyRate(s.sku);
      const split = splitFor(i);
      const sold = lastSold(s.sku);
      S.WAREHOUSES.forEach((wh, w) => {
        const stock = Math.round(s.currentQty * split[w]);
        if (!stock) return;
        const whRate = rate * split[w];
        const doi = whRate > 0 ? Math.round(stock / whRate) : 999;
        const idealDoi = 30;
        if (doi <= idealDoi) return;
        const value = stock * s.cost;
        out.push({
          sku: s.sku,
          channel: s.channel,
          warehouse: wh,
          stock,
          rate: Math.round(whRate * 10) / 10,
          idealDoi,
          doi,
          lastSold: sold,
          value,
          asp: s.price,
          // What holding one unit this long costs at the given rate.
          budget: Math.round((s.cost * (costOfCapital / 100) * doi) / 365),
        });
      });
    });
    return out.sort((a, b) => b.doi - a.doi);
  }

  function renderSlow(host) {
    const f = filters.slow;
    host.appendChild(
      filterBar([
        pillSelect(
          "Marketplaces:",
          [{ value: "All", label: "All" }].concat(C.CHANNELS.map((c) => ({ value: c, label: c }))),
          f.channel,
          (v) => { f.channel = v; FS.shell.refresh(); }
        ),
        el("div.fb-pill", {}, [
          el("span.fb-pill-label", { text: "Cost Of Capital" }),
          el("input.fb-pill-input", {
            type: "number",
            value: f.costOfCapital,
            min: 0,
            max: 100,
            onchange: (e) => { f.costOfCapital = Number(e.target.value); FS.shell.refresh(); },
          }),
          el("span.fb-pill-label", { text: "%" }),
        ]),
      ])
    );

    let rows = slowRows(f.costOfCapital);
    if (f.channel !== "All") rows = rows.filter((r) => r.channel === f.channel);

    host.appendChild(
      tableCard({
        title: "Slow Moving Inventory",
        note: "Stock whose days-on-hand exceed the ideal, priced at the cost of capital above.",
        rows,
        cols: [
          { label: "SKU", get: (r) => r.sku },
          { label: "Warehouse", get: (r) => r.warehouse },
          { label: "Current Stock", get: (r) => r.stock, align: "right", fmt: qty, total: true },
          { label: "Avg Daily Sales", get: (r) => r.rate, align: "right", fmt: (v) => v.toFixed(1) },
          { label: "Ideal DOI (days)", get: (r) => r.idealDoi, align: "right" },
          { label: "DOI (days)", get: (r) => r.doi, align: "right", accent: true },
          { label: "Last Sold", get: (r) => r.lastSold, fmt: (v) => U.fmtDate(v) },
          { label: "Inventory Value", get: (r) => r.value, align: "right", fmt: money, total: true },
          { label: "Current ASP", get: (r) => r.asp, align: "right", fmt: money },
          { label: "Budget per unit", get: (r) => r.budget, align: "right", fmt: money },
        ],
      })
    );
  }

  // --------------------------------------------------------- Inventory View
  /** Stock position per SKU × warehouse: on hand, inbound, and in production. */
  function inventoryRows() {
    const out = [];
    C.SKUS.forEach((s, i) => {
      const split = splitFor(i);
      const rate = dailyRate(s.sku);
      S.WAREHOUSES.forEach((wh, w) => {
        const inHand = Math.round(s.currentQty * split[w]);
        const inTransit = Math.round(s.pendingQty * split[w]);
        const inProduction = Math.round(s.orderedQty * split[w]);
        const total = inHand + inTransit + inProduction;
        if (!total) return;
        const whRate = rate * split[w];
        out.push({
          id: rowId(s.sku, wh),
          sku: s.sku,
          warehouse: wh,
          product: s.name,
          channel: s.channel,
          inHand,
          inTransit,
          inProduction,
          total,
          asp: s.price,
          dio: whRate > 0 ? Math.round(inHand / whRate) : 0,
          valueWithGst: Math.round(total * s.price * (1 + GST)),
          valueWithoutGst: total * s.price,
        });
      });
    });
    return out;
  }

  /**
   * Combo view rolls the warehouse rows back up to one line per SKU, which is
   * what "View By: Inventory Master SKU" means once sites are collapsed.
   */
  function comboRows(rows) {
    const by = new Map();
    rows.forEach((r) => {
      const hit = by.get(r.sku) || Object.assign({}, r, {
        id: r.sku, warehouse: "All warehouses",
        inHand: 0, inTransit: 0, inProduction: 0, total: 0,
        valueWithGst: 0, valueWithoutGst: 0,
      });
      hit.inHand += r.inHand;
      hit.inTransit += r.inTransit;
      hit.inProduction += r.inProduction;
      hit.total += r.total;
      hit.valueWithGst += r.valueWithGst;
      hit.valueWithoutGst += r.valueWithoutGst;
      hit.dio = Math.max(hit.dio, r.dio);
      by.set(r.sku, hit);
    });
    return [...by.values()];
  }

  function renderInventory(host) {
    const f = filters.inv;
    host.appendChild(
      filterBar([
        pillSelect(
          "View By:",
          [
            { value: "sku", label: "Inventory Master SKU" },
            { value: "warehouse", label: "Warehouse" },
          ],
          f.viewBy,
          (v) => { f.viewBy = v; FS.shell.refresh(); }
        ),
      ])
    );

    let rows = inventoryRows();
    if (f.combo) rows = comboRows(rows);
    if (f.viewBy === "warehouse") {
      rows = rows.slice().sort((a, b) => a.warehouse.localeCompare(b.warehouse) || a.sku.localeCompare(b.sku));
    }

    const skus = new Set(rows.map((r) => r.sku)).size;
    host.appendChild(
      el("div.tiles", {}, [
        statTile("SKUs", U.inr(skus)),
        statTile("Quantity", U.inr(rows.reduce((n, r) => n + r.total, 0))),
        statTile("Stock Value (with GST)", U.money(rows.reduce((n, r) => n + r.valueWithGst, 0))),
        statTile("Stock Value (without GST)", U.money(rows.reduce((n, r) => n + r.valueWithoutGst, 0))),
      ])
    );

    host.appendChild(
      tableCard({
        title: "Inventory View",
        note: "Stock on hand, inbound and in production across every warehouse.",
        rows,
        tools: [
          el("label.combo-toggle", {}, [
            el("span", { text: "Combo View" }),
            el(`button.toggle${f.combo ? " on" : ""}`, {
              type: "button",
              title: "Roll the warehouse rows up to one line per SKU",
              onclick: () => { f.combo = !f.combo; FS.shell.refresh(); },
            }, [el("span.knob")]),
          ]),
        ],
        cols: [
          { label: "IDs", get: (r) => r.id },
          { label: "Warehouse", get: (r) => r.warehouse },
          { label: "Product Name", get: (r) => r.product },
          { label: "Quantity In Hand", get: (r) => r.inHand, align: "right", fmt: qty, total: true },
          { label: "In-Transit", get: (r) => r.inTransit, align: "right", fmt: qty, total: true },
          { label: "In Production", get: (r) => r.inProduction, align: "right", fmt: qty, total: true },
          { label: "Total", get: (r) => r.total, align: "right", fmt: qty, total: true },
          { label: "ASP", get: (r) => r.asp, align: "right", fmt: money },
          { label: "DIO (days)", get: (r) => r.dio, align: "right" },
          { label: "Stock Value With GST", get: (r) => r.valueWithGst, align: "right", fmt: money, total: true },
          { label: "Stock Value Without GST", get: (r) => r.valueWithoutGst, align: "right", fmt: money, total: true, accent: true },
        ],
      })
    );
  }

  function statTile(label, value) {
    return el("div.tile.stat-tile", {}, [
      el("span.stat-label", { text: label }),
      el("span.stat-value", { text: value }),
    ]);
  }

  FS.views = FS.views || {};
  FS.views.b2bPo = { render: renderB2b };
  FS.views.slowMoving = { render: renderSlow };
  FS.views.inventoryView = { render: renderInventory };
})(window.FS);
