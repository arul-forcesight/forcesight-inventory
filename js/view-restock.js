/*
 * The Restock screens: the plan list, the two-step wizard, and the plan
 * detail with its three tables.
 *
 * Everything on the detail screen is derived from the forecast campaigns the
 * plan selected — see js/restock.js for the arithmetic.
 */
(function (FS) {
  "use strict";

  const U = FS.util;
  const S = FS.store;
  const { el, icon, clear, toast, confirm, select, pager } = FS.ui;

  const STATUS_KIND = {
    Approved: "blue", Purchased: "blue", Draft: "amber", Completed: "green",
  };
  const label = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  let page = 1;
  let pageSize = 25;

  // ------------------------------------------------------------------- list
  function renderList(host) {
    const all = S.listPlans();
    const rows = all.slice((page - 1) * pageSize, page * pageSize);
    const card = el("div.card");

    card.appendChild(
      el("div.card-head", {}, [
        el("div", {}, [
          el("h2.card-title", { text: "Restock Plan" }),
          el("p.card-sub", { text: "Manage and track your purchase orders" }),
        ]),
        el("button.btn.btn-primary", {
          onclick: () => { window.location.hash = "#/restock?view=wizard"; },
        }, [icon("plus", 16), el("span", { text: "Create New Restock Plan" })]),
      ])
    );

    const table = el("table.table.restock-plans-table");
    table.appendChild(
      el("thead", {}, [
        el("tr", {}, [
          el("th", { text: "PO NAME" }),
          el("th", { text: "CREATED DATE" }),
          el("th", { html: "VENDOR<br>/IN HOUSE PLANT" }),
          el("th", { text: "STATUS" }),
          el("th", { text: "SELECTED FORECAST" }),
          el("th.right", { text: "VALUE" }),
          el("th.center", { text: "ACTIONS" }),
        ]),
      ])
    );

    const tbody = el("tbody");
    if (!rows.length) {
      tbody.appendChild(
        el("tr", {}, [
          el("td", { colspan: 7 }, [
            FS.ui.empty("No restock plans yet", "Create one from an approved forecast."),
          ]),
        ])
      );
    }

    rows.forEach((plan) => {
      const built = FS.restock.buildPlan(plan);
      const names = built.campaigns.map((c) => c.name);
      const first = names[0] || "No forecast selected";
      const more = names.length > 1 ? ` · ${names.length - 1} more` : "";

      tbody.appendChild(
        el("tr", {}, [
          el("td", {}, [el("div.cell-strong", { text: plan.name })]),
          el("td", {}, [el("span.cell-muted", { text: U.fmtLongDate(plan.createdAt) })]),
          el("td", {}, [el("div.cell-strong", { text: plan.vendor })]),
          el("td", {}, [FS.ui.pill(label(plan.status), STATUS_KIND[label(plan.status)])]),
          el("td", {}, [
            el("div.cell-plain", { title: names.join(", "), text: first }),
            more ? el("div.cell-sub", { text: more.replace(" · ", "") }) : null,
          ]),
          el("td.right", {}, [
            el("span.value-green", { text: U.compactMoney(built.totals.value) }),
          ]),
          el("td.center", {}, [
            el("div.actions", {}, [
              el("button.btn.btn-sm", {
                onclick: () => { window.location.hash = `#/restock?plan=${plan.id}`; },
              }, [icon("eye", 14), el("span", { text: "View" })]),
              el("button.icon-btn.bordered.danger", {
                title: "Delete plan",
                onclick: () =>
                  confirm({
                    title: `Delete "${plan.name}"?`,
                    message: "The purchase order and its lines go with it. This cannot be undone.",
                    okText: "Delete",
                    danger: true,
                    onOk: () => {
                      S.deletePlan(plan.id);
                      toast("Restock plan deleted", "success");
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
        page, pageSize, total: all.length, unit: "plans",
        onChange: (p, sz) => { page = p; pageSize = sz; FS.shell.refresh(); },
      })
    );
    host.appendChild(card);
  }

  // ----------------------------------------------------------------- wizard
  const STEPS = [
    { key: "setup", label: "Setup", icon: "calendar" },
    { key: "inventory", label: "Inventory", icon: "settings" },
  ];
  let step = "setup";
  let draft = null;
  let openAcc = "moq";

  function beginWizard() {
    step = "setup";
    openAcc = "moq";
    draft = S.createPlan({});
    return draft;
  }

  function stepper() {
    const i = STEPS.findIndex((s) => s.key === step);
    const chips = [];
    STEPS.forEach((s, n) => {
      const done = n < i;
      const active = n === i;
      chips.push(
        el(`div.step-chip${done ? " done" : active ? " active" : ""}`, {}, [
          icon(done ? "check" : s.icon, 15),
          el("span", { text: s.label }),
        ])
      );
      if (n < STEPS.length - 1) chips.push(el("span.step-sep", {}, [icon("chevronRight", 12)]));
    });
    return el("div.stepper", {}, chips);
  }

  function heading(iconName, title, sub) {
    return el("div.step-heading", {}, [
      el("div.sh-row", {}, [
        el("span.sh-icon", {}, [icon(iconName, 16, "#007FFF")]),
        el("h3", { text: title }),
      ]),
      sub ? el("p.sh-sub", { text: sub }) : null,
    ]);
  }

  /** Step 1 and 2 of the board: the plan's name and the forecasts it covers. */
  function setupStep() {
    const body = el("div.step-body");

    body.appendChild(
      el("div.step-block", {}, [
        heading("calendar", "Step 1: Enter Restock Plan Name",
          "On creating the purchase orders you can choose this restock plan by selecting this name"),
        el("div.inline-row", {}, [
          el("input.input.name-field", {
            type: "text",
            value: draft.name,
            placeholder: "PO-xxx",
            oninput: (e) => { draft.name = e.target.value; S.save(); },
          }),
          el("span.label", { text: "Vendor / In-House Plant" }),
          select(
            S.VENDORS.map((v) => ({ value: v, label: v })),
            draft.vendor,
            (v) => { draft.vendor = v; S.save(); },
            { className: "select-md" }
          ),
        ]),
      ])
    );

    const chips = el("div.fc-chips");
    function paintChips() {
      clear(chips);
      const picked = (draft.campaignIds || []).map((id) => S.getCampaign(id)).filter(Boolean);
      if (!picked.length) {
        chips.appendChild(el("p.hint", { text: "No forecast selected yet." }));
        return;
      }
      picked.forEach((c) => {
        chips.appendChild(
          el("span.fc-chip", {}, [
            el("span", { text: c.name }),
            el("button.fc-x", {
              title: "Remove",
              onclick: () => {
                draft.campaignIds = draft.campaignIds.filter((id) => id !== c.id);
                S.save();
                paintChips();
              },
            }, [icon("close", 12)]),
          ])
        );
      });
    }
    paintChips();

    body.appendChild(
      el("div.step-block", {}, [
        heading("calendar", "Step 2: Select Existing Forecasts Or Create One",
          "Pick the demand-forecasting campaigns this purchase order should cover. Only campaigns that have been run can be selected."),
        el("div.inline-row", {}, [
          el("button.btn.btn-soft", {
            onclick: () => selectForecastsModal(),
          }, [el("span", { text: "Select From Forecasts" }), icon("edit", 14, "#007FFF")]),
          el("span.muted", { text: "or" }),
          el("button.link-btn.underline", {
            text: "Create New Demand Forecasting",
            onclick: () => { window.location.hash = "#/demand-forecasting?view=wizard"; },
          }),
        ]),
        chips,
      ])
    );

    /** Tick the campaigns this plan covers. */
    function selectForecastsModal() {
      const runnable = S.listCampaigns().filter((c) => c.result && c.result.rows.length);
      let picked = new Set(draft.campaignIds || []);
      const list = el("div.fc-list");

      runnable.forEach((c) => {
        const on = picked.has(c.id);
        list.appendChild(
          el(`label.fc-row${on ? " on" : ""}`, {}, [
            el("input", {
              type: "checkbox",
              checked: on || null,
              onchange: (e) => {
                if (e.target.checked) picked.add(c.id);
                else picked.delete(c.id);
                e.target.closest(".fc-row").classList.toggle("on", e.target.checked);
              },
            }),
            el("div.fc-meta", {}, [
              el("span.fc-name", { text: c.name }),
              el("span.fc-sub", {
                text: `${U.inr(c.result.totals.count)} SKUs · ${U.compactMoney(c.result.totals.value)} · ${U.fmtRange(c.forecastStart, c.forecastEnd)}`,
              }),
            ]),
            FS.ui.pill(c.status === "approved" ? "Approved" : "Draft",
              c.status === "approved" ? "blue" : "amber"),
          ])
        );
      });

      if (!runnable.length) {
        list.appendChild(
          FS.ui.empty("No forecasts have been run yet", "Run a demand-forecasting campaign first.")
        );
      }

      FS.ui.modal({
        width: 680,
        title: "Select Forecast Plans",
        subtitle: "A plan can cover more than one campaign — they are summed into one order.",
        actions: (h) => [
          el("button.btn", { text: "Cancel", onclick: () => h.close() }),
          el("button.btn.btn-primary", {
            text: "Apply & Continue",
            onclick: () => {
              draft.campaignIds = [...picked];
              S.save();
              paintChips();
              h.close();
            },
          }),
        ],
        body: () => [list],
      });
    }

    return body;
  }

  /** Step 3: the levers that turn a forecast into an order. */
  function inventoryStep() {
    const body = el("div.step-body");
    const count = FS.restock.buildPlan(draft).lines.length;

    body.appendChild(
      heading("settings", "Step 3: Select Items for Inventory Planning",
        `These changes are applied on top of the selected forecasts: ${U.inr(count)} items`)
    );

    const rerender = () => { S.save(); render(document.getElementById("content")); };

    function accordion(key, title, inner) {
      const open = openAcc === key;
      return el("div.accordion", {}, [
        el("button.acc-head", {
          onclick: () => { openAcc = open ? null : key; rerender(); },
        }, [
          el("span.acc-icon", {}, [icon("calendar", 16, "#007FFF")]),
          el("span.acc-title", { text: title }),
          el("span.grow"),
          icon(open ? "chevronUp" : "chevronDown", 13),
        ]),
        open ? el("div.acc-body", {}, [inner()]) : null,
      ]);
    }

    body.appendChild(
      accordion("doi", "Days Inventory Outstanding (DOI)", () =>
        el("div", {}, [
          el("p.hint", {
            text: "Days of cover to hold beyond the forecast window. Raising it buys more and locks more cash.",
          }),
          el("div.inline-row", { style: { marginTop: "12px" } }, [
            el("span.label", { text: "Target DOI" }),
            el("input.num-input", {
              type: "number",
              value: draft.doi,
              min: 0,
              oninput: (e) => { draft.doi = Number(e.target.value); S.save(); },
            }),
            el("span.muted", { text: "days" }),
          ]),
        ])
      )
    );

    body.appendChild(
      accordion("moq", "MOQ & Lead Time", () => {
        const wrap = el("div");
        wrap.appendChild(
          el("p.hint", {
            text: `These adjustments will be applied to get the order for the selected forecasts: ${U.inr(count)} items`,
          })
        );

        const chips = el("div.fc-chips", { style: { marginTop: "14px" } });
        (draft.leadRules || []).forEach((r) => {
          chips.appendChild(
            el("span.fc-chip", {}, [
              el("span", { text: `Lead Time — ${r.days} days` }),
              el("button.fc-x", {
                onclick: () => {
                  draft.leadRules = draft.leadRules.filter((x) => x.id !== r.id);
                  rerender();
                },
              }, [icon("close", 12)]),
            ])
          );
        });
        (draft.moqRules || []).forEach((r) => {
          chips.appendChild(
            el("span.fc-chip", {}, [
              el("span", { text: `MOQ — ${r.moq}` }),
              el("button.fc-x", {
                onclick: () => {
                  draft.moqRules = draft.moqRules.filter((x) => x.id !== r.id);
                  rerender();
                },
              }, [icon("close", 12)]),
            ])
          );
        });
        if (!(draft.leadRules || []).length && !(draft.moqRules || []).length) {
          chips.appendChild(el("p.hint", { text: "No adjustments — supplier defaults apply." }));
        }
        wrap.appendChild(chips);

        wrap.appendChild(
          el("div.inline-row", { style: { marginTop: "14px" } }, [
            el("button.btn.btn-soft", {
              onclick: () => addAdjustmentModal(rerender),
            }, [el("span", { text: "+ Add Adjustment" }), icon("edit", 14, "#007FFF")]),
          ])
        );
        return wrap;
      })
    );

    return body;
  }

  function addAdjustmentModal(done) {
    let kind = "moq";
    let value = 200;
    const field = el("div.inline-row");

    function paintField() {
      clear(field);
      field.appendChild(el("span.label", { text: kind === "moq" ? "Minimum order qty" : "Lead time" }));
      field.appendChild(
        el("input.num-input", {
          type: "number",
          value,
          min: 0,
          oninput: (e) => { value = Number(e.target.value); },
        })
      );
      field.appendChild(el("span.muted", { text: kind === "moq" ? "units" : "days" }));
    }
    paintField();

    FS.ui.modal({
      width: 480,
      title: "Add Adjustment",
      actions: (h) => [el("button.icon-btn", { onclick: () => h.close() }, [icon("close", 16)])],
      body: () => [
        el("div.inline-row", { style: { marginBottom: "14px" } }, [
          el("span.label", { text: "Type" }),
          select(
            [
              { value: "moq", label: "MOQ — round orders up" },
              { value: "lead", label: "Lead time — override supplier days" },
            ],
            kind,
            (v) => { kind = v; value = v === "moq" ? 200 : 32; paintField(); },
            { className: "select-md" }
          ),
        ]),
        field,
      ],
      footer: (h) => [
        el("span.muted", {
          text: kind === "moq"
            ? "Every line is rounded up to a whole multiple."
            : "Replaces each SKU's own supplier lead time.",
        }),
        el("button.btn.btn-primary", {
          text: "Add",
          onclick: () => {
            const id = U.uid("adj");
            if (kind === "moq") draft.moqRules = (draft.moqRules || []).concat([{ id, moq: value }]);
            else draft.leadRules = (draft.leadRules || []).concat([{ id, days: value }]);
            S.save();
            h.close();
            done();
          },
        }),
      ],
    });
  }

  function renderWizard(host) {
    if (!draft) beginWizard();
    const card = el("div.card.wizard");
    card.appendChild(stepper());

    const stage = el("div.wizard-stage");
    stage.appendChild(step === "setup" ? setupStep() : inventoryStep());
    card.appendChild(stage);

    const isLast = step === "inventory";
    card.appendChild(
      el("div.wizard-foot", {}, [
        el("button.link-btn.grey", {
          text: "Cancel",
          onclick: () => {
            S.deletePlan(draft.id);
            draft = null;
            window.location.hash = "#/restock";
          },
        }),
        el("div.row-gap", {}, [
          el("button.link-btn", {
            text: "Back To The Plans Table",
            onclick: () => { window.location.hash = "#/restock"; },
          }),
          step === "inventory"
            ? el("button.btn", { text: "Back", onclick: () => { step = "setup"; FS.shell.refresh(); } })
            : null,
          el("button.btn.btn-primary", {
            onclick: () => {
              if (step === "setup") {
                if (!draft.name.trim()) return toast("Give the restock plan a name.", "error");
                if (!(draft.campaignIds || []).length) {
                  return toast("Select at least one forecast to restock against.", "error");
                }
                step = "inventory";
                S.save();
                FS.shell.refresh();
                return;
              }
              S.save();
              const id = draft.id;
              draft = null;
              window.location.hash = `#/restock?plan=${id}&created=1`;
            },
          }, isLast
            ? [el("span", { text: "Create Restock Plan" })]
            : [el("span", { text: "Next" }), icon("arrowRight", 15)]),
        ]),
      ])
    );

    host.appendChild(card);
  }

  // ----------------------------------------------------------------- detail
  let justCreated = false;

  function renderDetail(host, plan) {
    const built = FS.restock.buildPlan(plan);
    const t = built.totals;

    if (justCreated) {
      host.appendChild(
        el("div.created-bar", {}, [
          el("span.created-text", { text: "Restock Plan Created!" }),
          el("span.grow"),
          el("button.link-btn", {
            text: "Save As Draft",
            onclick: () => {
              S.updatePlan(plan.id, { status: "draft" });
              toast("Saved as draft.", "success");
              FS.shell.refresh();
            },
          }),
          el("button.btn", {
            text: "Edit Restock Plan",
            onclick: () => { window.location.hash = "#/restock?view=wizard"; },
          }),
          el("button.btn.btn-primary", {
            text: "Go To Restock Plan Dashboard",
            onclick: () => {
              justCreated = false;
              window.location.hash = "#/restock";
            },
          }),
        ])
      );
    }

    const card = el("div.card.plan-detail");

    card.appendChild(
      el("div.plan-head", {}, [
        el("div.plan-head-left", {}, [
          el("div.plan-name-row", {}, [
            el("span.plan-label", { text: "Restock Plan Name:" }),
            el("h2.plan-name", { text: plan.name }),
          ]),
          el("div.plan-name-row", {}, [
            el("span.plan-label", { text: "Selected Forecast:" }),
            el("span.plan-forecast", {
              text: built.campaigns.map((c) => c.name).join(", ") || "None",
            }),
          ]),
        ]),
        el("div.row-gap", {}, [
          el("button.btn", {
            onclick: () => exportPlan(plan, built),
          }, [icon("download", 14), el("span", { text: "Export Full Plan" })]),
          plan.status === "approved"
            ? el("button.btn", {
                text: "Withdraw Approval",
                onclick: () => {
                  S.updatePlan(plan.id, { status: "draft" });
                  toast("Approval withdrawn.", "success");
                  FS.shell.refresh();
                },
              })
            : el("button.btn.btn-primary", {
                text: "Approve Plan",
                onclick: () => {
                  S.updatePlan(plan.id, { status: "approved" });
                  toast("Restock plan approved.", "success");
                  FS.shell.refresh();
                },
              }),
        ]),
      ])
    );

    // The one insight the board shows: when the order has to be placed.
    if (t.maxLead) {
      const by = U.addDays(U.today(), t.maxLead);
      card.appendChild(
        el("div.ai-insight", {}, [
          icon("spark", 15, "#007FFF"),
          el("span", {
            text: `AI Insight: the longest supplier lead time on this plan is ${t.maxLead} days — to land in time, raise the PO by ${U.fmtDate(by)}.`,
          }),
        ])
      );
    }

    card.appendChild(
      el("div.tiles", {}, [
        tile("Inventory ₹", U.compactMoney(t.inventoryValue), `${U.inr(t.inHand + t.toPurchase)} units on hand + on order`),
        tile("Cash locked", U.compactMoney(t.value), `${U.inr(t.toPurchase)} units to ${plan.vendor}`),
        tile("DIO", `${t.dio} days`, `target ${plan.doi} days`),
        tile("Stockout risk", U.pct(t.riskPct), `${t.skus} SKUs in plan`),
        tile("Revenue Cover", U.compactMoney(t.revenue), "forecast value"),
      ])
    );

    host.appendChild(card);

    // --- the three tables
    host.appendChild(
      dataCard("Restock Table: Manufacturer/Supplier View", "manufacturer", built, [
        { key: "sku", label: "Inventory Master SKU" },
        { key: "forecastQty", label: "Forecast Qty", num: true },
        { key: "inHand", label: "In Hand Qty", num: true },
        { key: "required", label: "Required Qty", num: true },
        { key: "toPurchase", label: "To Purchase Qty", num: true, accent: true },
        { key: "price", label: "Price", money: true },
      ], built.lines)
    );

    host.appendChild(
      dataCard("Restock Table: Restock View", "restock", built, [
        { key: "channel", label: "Channel" },
        { key: "sku", label: "Inventory Master SKU" },
        { key: "warehouse", label: "Warehouse" },
        { key: "forecastQty", label: "Forecast Qty", num: true },
        { key: "inHand", label: "In Hand Qty", num: true },
        { key: "required", label: "Required Qty", num: true },
      ], built.warehouseLines)
    );

    host.appendChild(
      dataCard("Transfer Table", "transfer", built, [
        { key: "channel", label: "Channel" },
        { key: "sku", label: "Inventory Master SKU" },
        { key: "from", label: "From Warehouse" },
        { key: "to", label: "To Warehouse" },
        { key: "qty", label: "In Stock Qty (from WH)", num: true, accent: true },
      ], built.transfers)
    );
  }

  function tile(label, value, sub) {
    return el("div.tile", {}, [
      el("span.tile-label", { text: label }),
      el("span.tile-value", { text: value }),
      sub ? el("span.tile-sub", { text: sub }) : null,
    ]);
  }

  // Search text per table, so one box does not filter all three.
  const searches = {};

  function dataCard(title, key, built, cols, rows) {
    searches[key] = searches[key] || "";
    const card = el("div.card");
    const bodyHost = el("div");

    card.appendChild(
      el("div.card-head.compact", {}, [
        el("h3.card-title.sm", { text: title }),
        el("span.grow"),
        el("div.input-wrap", {}, [
          icon("search", 14),
          el("input.input", {
            type: "text",
            value: searches[key],
            placeholder: "Search SKU...",
            oninput: (e) => {
              searches[key] = e.target.value;
              paint();
              const f = card.querySelector(".input-wrap input");
              if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
            },
          }),
        ]),
        el("button.icon-btn.bordered", {
          title: "Download as CSV",
          onclick: () => exportTable(title, cols, filtered()),
        }, [icon("download", 15)]),
      ])
    );
    card.appendChild(bodyHost);

    function filtered() {
      const q = searches[key].trim().toLowerCase();
      return q ? rows.filter((r) => String(r.sku).toLowerCase().includes(q)) : rows;
    }

    function paint() {
      clear(bodyHost);
      const shown = filtered();
      if (!shown.length) {
        bodyHost.appendChild(
          FS.ui.empty(
            searches[key] ? "No SKU matches that search" : "Nothing to show",
            searches[key] ? "" : "This table fills in once the plan covers a forecast."
          )
        );
        return;
      }

      const table = el("table.table.restock-table");
      table.appendChild(
        el("thead", {}, [
          el("tr", {}, cols.map((c) =>
            el(`th${c.num || c.money ? ".right" : ""}`, { text: c.label })
          )),
        ])
      );

      const tbody = el("tbody");
      shown.slice(0, 200).forEach((r) => {
        tbody.appendChild(
          el("tr", {}, cols.map((c) => {
            const v = r[c.key];
            if (c.money) return el("td.right", { text: U.money(v) });
            if (c.num) {
              return el(`td.right${c.accent ? ".blue" : ""}`, { text: U.inr(v) });
            }
            return el("td", { text: String(v) });
          }))
        );
      });
      table.appendChild(tbody);

      // Totals across the whole table, not just the page shown.
      const foot = el("tr");
      cols.forEach((c, i) => {
        if (i === 0) return foot.appendChild(el("td", { text: "Total" }));
        if (c.money) return foot.appendChild(el("td"));
        if (c.num) {
          const sum = shown.reduce((n, r) => n + (Number(r[c.key]) || 0), 0);
          return foot.appendChild(el(`td.right${c.accent ? ".blue" : ""}`, { text: U.inr(sum) }));
        }
        foot.appendChild(el("td"));
      });
      table.appendChild(el("tfoot", {}, [foot]));

      bodyHost.appendChild(el("div.table-wrap.scroll", {}, [table]));
      if (shown.length > 200) {
        bodyHost.appendChild(
          el("p.preview-more", { text: `…and ${U.inr(shown.length - 200)} more rows` })
        );
      }
    }

    paint();
    return card;
  }

  function exportTable(title, cols, rows) {
    const head = cols.map((c) => c.label).join(",");
    const lines = [head].concat(
      rows.map((r) => cols.map((c) => `"${r[c.key]}"`).join(","))
    );
    download(`${title.replace(/[^\w]+/g, "_")}.csv`, lines.join("\n"));
  }

  function exportPlan(plan, built) {
    const lines = [
      `Restock Plan,${plan.name}`,
      `Vendor,${plan.vendor}`,
      `Forecasts,"${built.campaigns.map((c) => c.name).join(", ")}"`,
      `Target DOI,${plan.doi} days`,
      "",
      "SKU,Product,Channel,Forecast Qty,In Hand,Required,To Purchase,Price,Value",
    ].concat(
      built.lines.map((r) =>
        [`"${r.sku}"`, `"${r.name}"`, r.channel, r.forecastQty, r.inHand, r.required, r.toPurchase, r.price, r.value].join(",")
      )
    );
    download(`${plan.name}_restock_plan.csv`, lines.join("\n"));
    toast("Plan exported.", "success");
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ----------------------------------------------------------------- router
  function render(host) {
    if (!host) return;
    clear(host);
    const params = FS.app.params();

    if (params.view === "wizard") return renderWizard(host);

    if (params.plan) {
      const plan = S.getPlan(Number(params.plan));
      if (!plan) {
        host.appendChild(FS.ui.empty("That plan no longer exists", "Pick another from the list."));
        return;
      }
      host.appendChild(
        el("button.back-link", {
          onclick: () => { justCreated = false; window.location.hash = "#/restock"; },
        }, [icon("arrowLeft", 14), el("span", { text: "Back to restock plans" })])
      );
      return renderDetail(host, plan);
    }

    renderList(host);
  }

  function open(params) {
    justCreated = params.created === "1";
    if (params.view === "wizard") {
      if (!draft) beginWizard();
      return;
    }
    cleanup();
  }

  /*
   * Drop an abandoned draft.
   *
   * The plan row is created up front so each step can save onto it, so
   * leaving the wizard by any route — Cancel, the plans table, or straight
   * out to another module — has to clear it or the list keeps an empty one.
   */
  function cleanup() {
    if (draft && !(draft.campaignIds || []).length) S.deletePlan(draft.id);
    draft = null;
  }

  FS.views = FS.views || {};
  FS.views.restock = { render, open, cleanup };
})(window.FS);
