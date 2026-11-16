/*
 * The campaigns list — the module's landing view.
 *
 * Sorting and paging are done here rather than by a service, but the shape is
 * the same: a page of rows plus a total, re-read whenever either changes.
 */
(function (FS) {
  "use strict";

  const U = FS.util;
  const { el, icon, pager, confirm, toast } = FS.ui;

  const STATUS_KIND = { Approved: "blue", Draft: "amber", Past: "green" };
  const RUN_KIND = { Processing: "blue", Success: "green", Failed: "red", Error: "red" };

  let page = 1;
  let pageSize = 25;
  let sort = { key: null, order: null };

  /** draft | approved, read against the forecast window's end date. */
  function statusOf(c) {
    if (c.status === "approved") {
      return U.startOfDay(c.forecastEnd) < U.today() ? "Past" : "Approved";
    }
    return "Draft";
  }

  function render(host) {
    const all = FS.store.listCampaigns({ sortBy: sort.key, sortOrder: sort.order });
    const total = all.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (page > pages) page = pages;
    const rows = all.slice((page - 1) * pageSize, page * pageSize);

    const card = el("div.card");

    card.appendChild(
      el("div.card-head", {}, [
        el("div", {}, [
          el("h2.card-title", { text: "Demand Forecasting Campaigns" }),
          el("p.card-sub", { text: "Create and manage your demand forecasting scenarios" }),
        ]),
        el("button.btn.btn-primary", {
          onclick: () => { window.location.hash = "#/demand-forecasting?view=wizard"; },
        }, [icon("plus", 16), el("span", { text: "Create New Campaign" })]),
      ])
    );

    const table = el("table.table.campaigns-table");
    const thead = el("thead");
    const headRow = el("tr");

    const SORTABLE = { name: "name", createdDate: "createdAt" };
    const cols = [
      { key: "name", label: "CAMPAIGN NAME" },
      { key: "createdDate", label: "CREATED DATE" },
      { key: "days", label: "FORECAST PERIOD" },
      { key: "skus", label: "TARGET" },
      { key: "status", label: "STATUS" },
      { key: "runStatus", label: "FORECAST STATUS" },
      { key: "actions", label: "ACTIONS", align: "center" },
    ];

    cols.forEach((c) => {
      const sortable = !!SORTABLE[c.key];
      const active = sort.key === SORTABLE[c.key];
      const th = el(`th${c.align === "center" ? ".center" : ""}${sortable ? ".sortable" : ""}`, {
        onclick: sortable
          ? () => {
              const field = SORTABLE[c.key];
              const order = active && sort.order === "asc" ? "desc" : "asc";
              sort = { key: field, order };
              page = 1;
              FS.shell.refresh();
            }
          : null,
      }, [
        el("span", { text: c.label }),
        sortable
          ? el(`span.sort-arrow${active ? " on" : ""}`, {}, [
              icon(active && sort.order === "desc" ? "chevronDown" : "chevronUp", 11),
            ])
          : null,
      ]);
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el("tbody");
    if (!rows.length) {
      tbody.appendChild(
        el("tr", {}, [
          el("td", { colspan: cols.length }, [
            FS.ui.empty("No campaigns yet", "Create one to run your first forecast."),
          ]),
        ])
      );
    }

    rows.forEach((c) => {
      const status = statusOf(c);
      const days = U.diffDays(c.forecastStart, c.forecastEnd);
      const scenarioCount = FS.store.scenariosOf(c.id).length - 1;
      const targetCount = FS.engine.resolveTargets(c.targetSelection).length;

      tbody.appendChild(
        el("tr", {}, [
          el("td", {}, [
            el("div.cell-strong", { text: c.name }),
            scenarioCount
              ? el("div.cell-sub", { text: `${scenarioCount} scenario${scenarioCount > 1 ? "s" : ""}` })
              : null,
          ]),
          el("td", {}, [el("span.cell-muted", { text: U.fmtLongDate(c.createdAt) })]),
          el("td", {}, [
            el("div.cell-strong", { text: `${days} days` }),
            el("div.cell-sub", { text: `${U.fmtDate(c.forecastStart)} – ${U.fmtDate(c.forecastEnd)}` }),
          ]),
          el("td", {}, [
            el("div.cell-strong", { text: `${U.inr(targetCount)} SKUs` }),
            el("div.cell-sub", { text: describeSelection(c.targetSelection) }),
          ]),
          el("td", {}, [FS.ui.pill(status, STATUS_KIND[status])]),
          el("td", {}, [
            c.runStatus
              ? FS.ui.pill(c.runStatus, RUN_KIND[c.runStatus] || "grey")
              : el("span.cell-muted", { text: "—" }),
          ]),
          el("td.center", {}, [
            el("div.actions", {}, [
              el("button.btn.btn-sm", {
                onclick: () => { window.location.hash = `#/demand-forecasting?campaign=${c.id}`; },
              }, [icon("eye", 14), el("span", { text: "View" })]),
              el("button.icon-btn.bordered", {
                title: "Edit this campaign's settings",
                onclick: () => { window.location.hash = `#/demand-forecasting?campaign=${c.id}&edit=1`; },
              }, [icon("edit", 14)]),
              el("button.icon-btn.bordered.danger", {
                title: "Delete campaign",
                onclick: () =>
                  confirm({
                    title: `Delete "${c.name}"?`,
                    message: "Its scenarios and forecast details go with it. This cannot be undone.",
                    okText: "Delete",
                    danger: true,
                    onOk: () => {
                      FS.store.deleteCampaign(c.id);
                      toast("Campaign deleted", "success");
                      FS.shell.refresh();
                    },
                  }),
              }, [icon("trash", 14)]),
            ]),
          ]),
        ])
      );
    });

    table.appendChild(tbody);
    card.appendChild(el("div.table-wrap", {}, [table]));
    card.appendChild(
      pager({
        page, pageSize, total, unit: "campaigns",
        onChange: (p, s) => {
          page = p;
          pageSize = s;
          FS.shell.refresh();
        },
      })
    );

    host.appendChild(card);
  }

  // Filter keys are SKU row properties; these are what they are called on screen.
  const FILTER_NOUN = {
    channel: "channels",
    category: "categories",
    brand: "brands",
    sku: "SKUs",
    productId: "product IDs",
    parentId: "parent IDs",
    season: "demand profiles",
  };

  /** A one-line read of what a target selection covers. */
  function describeSelection(sel) {
    const s = sel || {};
    if (s.mode === "po" && s.poKey) return `From ${s.poLabel || s.poKey}`;
    const parts = [];
    Object.keys(s.filters || {}).forEach((k) => {
      const vals = s.filters[k] || [];
      if (!vals.length) return;
      parts.push(vals.length > 2 ? `${vals.length} ${FILTER_NOUN[k] || k}` : vals.join(", "));
    });
    if (s.search) parts.push(`"${s.search}"`);
    return parts.length ? parts.join(" · ") : "All channels, all categories";
  }

  FS.views = FS.views || {};
  FS.views.campaigns = { render, statusOf, describeSelection };
})(window.FS);
