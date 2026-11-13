/*
 * The module's modals: target picker, reference mapping, weighted-average
 * modelling, PO picker and per-adjustment scope.
 *
 * All of them read and write the same campaign shape the wizard and the
 * result screen use, so an edit means the same thing wherever it is made.
 */
(function (FS) {
  "use strict";

  const U = FS.util;
  const C = FS.catalog;
  const { el, icon, modal, toast, multiSelect, select, dateRange, clear } = FS.ui;

  /*
   * Filter fields.
   *
   * The id is the SKU row property the engine filters on, so adding a field
   * here is all it takes for the picker and the forecast to agree about it.
   */
  const DEFAULT_FILTERS = [
    { id: "channel", label: "Channel" },
    { id: "sku", label: "SKUs" },
    { id: "productId", label: "Product ID" },
    { id: "parentId", label: "ParentId" },
    { id: "category", label: "MKT Category" },
  ];

  const CUSTOM_FILTERS = [
    { id: "brand", label: "Brand" },
    { id: "season", label: "Demand Profile" },
  ];

  function optionsFor(id) {
    const seen = new Set();
    C.SKUS.forEach((s) => seen.add(String(s[id])));
    return [...seen].sort();
  }

  /** The filter panel shared by the target picker and the scope modal. */
  function filterPanel(opts) {
    const o = opts || {};
    let value = JSON.parse(JSON.stringify(o.value || {}));

    const host = el("div.filter-panel");

    function group(title, defs) {
      const head = el("div.fp-head", {}, [
        el("h4", { text: title }),
        el("button.link-btn", {
          type: "button",
          text: "Clear filters",
          onclick: () => {
            defs.forEach((d) => delete value[d.id]);
            if (o.onChange) o.onChange(value);
            paint();
          },
        }),
      ]);
      const grid = el("div.fp-grid");
      defs.forEach((d) => {
        const picked = value[d.id] || [];
        grid.appendChild(
          el("div.fp-field", {}, [
            el("div.fp-label", {}, [
              el("span", { text: d.label }),
              picked.length ? el("span.fp-count", { text: `${picked.length} selected` }) : null,
            ]),
            multiSelect({
              options: optionsFor(d.id),
              value: picked,
              placeholder: "All",
              onChange: (v) => {
                if (v.length) value[d.id] = v;
                else delete value[d.id];
                if (o.onChange) o.onChange(value);
                // Repaint only the counts, not the open dropdown.
                host.querySelectorAll(".fp-count").forEach(() => {});
                paintCounts();
              },
            }),
          ])
        );
      });
      return el("div.fp-group", {}, [head, grid]);
    }

    function paintCounts() {
      // Cheap refresh of the "n selected" labels without closing dropdowns.
      const all = DEFAULT_FILTERS.concat(CUSTOM_FILTERS);
      host.querySelectorAll(".fp-field").forEach((node, i) => {
        const def = all[i];
        if (!def) return;
        const n = (value[def.id] || []).length;
        let badge = node.querySelector(".fp-count");
        if (n && !badge) {
          badge = el("span.fp-count");
          node.querySelector(".fp-label").appendChild(badge);
        }
        if (badge) badge.textContent = n ? `${n} selected` : "";
      });
    }

    function paint() {
      clear(host);
      if (o.header) host.appendChild(o.header());
      host.appendChild(group("Default Filters", DEFAULT_FILTERS));
      host.appendChild(group("Custom Filters", CUSTOM_FILTERS));
      if (o.footer) host.appendChild(o.footer());
    }

    paint();
    return { el: host, get value() { return value; }, repaint: paint };
  }

  // --------------------------------------------------- target items picker
  /**
   * Target picker.
   *
   * The filters ARE the selection: a set of thousands of SKUs is described,
   * not ticked one by one. Apply runs the filters against the catalogue and
   * previews what matched; Save stores the filters plus the matched count.
   */
  function targetItemsModal(opts) {
    const o = opts || {};
    const lookback = o.lookback || FS.store.resolveLookback("last90");
    const seed = o.selected || {};
    let search = seed.search || "";
    let applied = JSON.parse(JSON.stringify(seed.filters || {}));
    let taken = true;
    let matched = FS.engine.resolveTargets({ filters: applied, search, mode: seed.mode, poKey: seed.poKey });

    const preview = el("div.preview");

    function run() {
      matched = FS.engine.resolveTargets({
        filters: panel.value,
        search,
        mode: seed.mode,
        poKey: seed.poKey,
      });
      applied = JSON.parse(JSON.stringify(panel.value));
      taken = true;
      paintPreview();
      paintTotal();
    }

    const totalLabel = el("span.fp-total");
    function paintTotal() {
      totalLabel.textContent = `${U.inr(taken ? matched.length : 0)} items`;
    }

    const panel = filterPanel({
      value: applied,
      header: () =>
        el("div.fp-total-row", {}, [el("span.fp-total-key", { text: "SKUs" }), totalLabel]),
      footer: () =>
        el("button.btn.btn-primary.fp-apply", { text: "Apply", onclick: run }),
    });
    paintTotal();

    function paintPreview() {
      clear(preview);
      const qty = FS.engine.selectionQty(matched, lookback[0], lookback[1]);

      preview.appendChild(
        el("div.preview-head", {}, [
          el("h4", { text: "Preview" }),
          el("span.preview-count", {
            text: `showing ${U.inr(Math.min(matched.length, 200))} of ${U.inr(matched.length)}`,
          }),
          el("div.input-wrap.grow", {}, [
            icon("search", 14),
            el("input.input", {
              type: "text",
              value: search,
              placeholder: "Search SKUs… (comma separates terms)",
              oninput: (e) => {
                search = e.target.value;
                clearTimeout(paintPreview._t);
                paintPreview._t = setTimeout(run, 320);
              },
            }),
          ]),
        ])
      );

      preview.appendChild(
        el("label.preview-takeall", {}, [
          el("input", {
            type: "checkbox",
            checked: taken || null,
            onchange: (e) => {
              taken = e.target.checked;
              paintTotal();
              paintFoot();
            },
          }),
          el("span", {
            text: taken
              ? `All ${U.inr(matched.length)} matching items selected`
              : "Nothing selected — tick to take every matching item",
          }),
        ])
      );

      const grid = el("div.preview-grid");
      grid.appendChild(
        el("div.preview-row.preview-head-row", {}, [
          el("span", { text: "SKU" }),
          el("span", { text: "Channel" }),
          el("span.right", { text: "Look-back Qty" }),
          el("span.right", { text: "Current Qty" }),
        ])
      );

      const body = el("div.preview-body");
      if (!matched.length) {
        body.appendChild(FS.ui.empty("No items match these filters", "Widen the filters on the left, or clear the search."));
      } else {
        matched.slice(0, 200).forEach((r) => {
          body.appendChild(
            el("div.preview-row", {}, [
              el("span.truncate", { title: `${r.sku} · ${r.name}`, text: r.sku }),
              el("span.muted", { text: r.channel }),
              el("span.right", { text: U.inr(C.soldBetween(r.sku, lookback[0], lookback[1])) }),
              el("span.right.muted", { text: U.inr(r.currentQty) }),
            ])
          );
        });
        if (matched.length > 200) {
          body.appendChild(
            el("p.preview-more", { text: `…and ${U.inr(matched.length - 200)} more in this set` })
          );
        }
      }
      grid.appendChild(body);
      preview.appendChild(grid);

      preview.appendChild(footRow(qty));
    }

    let footNode = null;
    function footRow(qty) {
      footNode = el("div.preview-foot", {}, [
        el("span", { text: `Total: ${U.inr(taken ? matched.length : 0)} SKUs` }),
        el("span.muted", { text: `${U.inr(taken ? qty : 0)} units sold in the look-back` }),
      ]);
      return footNode;
    }
    function paintFoot() {
      if (!footNode) return;
      const qty = FS.engine.selectionQty(matched, lookback[0], lookback[1]);
      footNode.replaceWith(footRow(taken ? qty : 0));
    }

    paintPreview();

    return modal({
      width: 1180,
      title: "Select Target Items",
      subtitle: `Counted against the look-back ${U.fmtRange(lookback[0], lookback[1])}`,
      actions: (h) => [
        el("button.link-btn", {
          text: "Reset",
          onclick: () => {
            search = "";
            applied = {};
            panel.repaint();
            run();
          },
        }),
        el("button.btn", { text: "Cancel", onclick: () => h.close() }),
        el("button.btn.btn-primary", {
          text: "Save and Proceed",
          onclick: () => {
            if (!taken || !matched.length) {
              toast("Nothing is selected — tick the matched set first.", "error");
              return;
            }
            if (o.onSave) {
              o.onSave({
                mode: seed.mode || "direct",
                poKey: seed.poKey,
                filters: JSON.parse(JSON.stringify(panel.value)),
                search,
                count: matched.length,
              });
            }
            h.close();
          },
        }),
      ],
      body: () => [el("div.target-grid", {}, [panel.el, preview])],
    });
  }

  // ---------------------------------------------------------- PO selection
  function selectPoModal(opts) {
    const o = opts || {};
    let selected = o.selected || C.POS[0].key;

    function rows(h) {
      return C.POS.map((po) => {
        const active = selected === po.key;
        return el(`div.po-row${active ? " active" : ""}`, {
          onclick: () => {
            selected = po.key;
            // Repaint in place so the radio moves with the click.
            h.body.querySelectorAll(".po-row").forEach((n) => n.classList.remove("active"));
            h.body.querySelectorAll(".po-radio").forEach((n) => n.classList.remove("on"));
            const idx = C.POS.findIndex((p) => p.key === po.key);
            h.body.querySelectorAll(".po-row")[idx].classList.add("active");
            h.body.querySelectorAll(".po-radio")[idx].classList.add("on");
          },
        }, [
          el(`span.po-radio${active ? " on" : ""}`),
          el("span.po-badge", {}, [icon("rise", 12)]),
          el("span.po-num", { text: po.po }),
          el("span.muted", { text: po.manufacturer }),
          el("span.muted", { text: U.fmtDate(po.date) }),
          el("span.po-value", { text: U.compactMoney(po.value) }),
          el("span.muted", { text: `${po.fill}%` }),
          el("span.muted", { text: `${po.lines.length} SKUs` }),
        ]);
      });
    }

    return modal({
      width: 760,
      title: "Select PO For Plans",
      subtitle: "The PO's lines become the campaign's target items.",
      actions: (h) => [el("button.icon-btn", { onclick: () => h.close() }, [icon("close", 16)])],
      body: (h) => [
        el("div.po-list", {}, [
          el("div.po-row.po-head", {}, [
            el("span"), el("span"),
            el("span", { text: "PO Number" }),
            el("span", { text: "Manufacturer" }),
            el("span", { text: "PO Date" }),
            el("span", { text: "PO Value" }),
            el("span", { text: "Fill Rate" }),
            el("span", { text: "Lines" }),
          ]),
          rows(h),
        ]),
      ],
      footer: (h) => [
        el("span.muted", { text: "1 PO selected" }),
        el("div.row-gap", {}, [
          el("button.btn", { text: "Cancel", onclick: () => h.close() }),
          el("button.btn.btn-primary", {
            text: "Apply & Continue",
            onclick: () => {
              const po = C.POS.find((p) => p.key === selected);
              if (o.onSave) {
                o.onSave({
                  mode: "po",
                  poKey: po.key,
                  filters: {},
                  search: "",
                  count: po.lines.length,
                  poLabel: po.po,
                });
              }
              h.close();
            },
          }),
        ]),
      ],
    });
  }

  // ------------------------------------------------- weighted average model
  /**
   * Weighted average modelling.
   *
   * Buckets come from the look-back window itself, so the grid always matches
   * the period chosen. The weights must total 100 unless the base is "Using
   * AI", which picks its own ramp.
   */
  function weightedAverageModal(opts) {
    const o = opts || {};
    const lookback = o.lookback || FS.store.resolveLookback("last90");
    const lookDays = U.diffDays(lookback[0], lookback[1]) + 1;
    const daysAllowed = lookDays > 0 && lookDays <= 31;

    let unit = o.modelType === "day" && daysAllowed ? "day" : "week";
    const base = o.base || "AVG";
    const usingAi = base === "USING_AI";

    let buckets = FS.engine.buildBuckets(lookback[0], lookback[1], unit);
    let values = seedValues();

    function seedValues() {
      if (usingAi) return FS.engine.aiWeights(buckets.length);
      if (o.weights && o.weights.length === buckets.length) {
        return o.weights.map((w) => Number(w.weight) || 0);
      }
      return FS.engine.evenWeights(buckets.length);
    }

    const grid = el("div.weight-grid");
    const totalRow = el("div.weight-total");

    /**
     * Weight cells do arithmetic: typing 11+2 and leaving the box settles on
     * 13, which is how people actually adjust a weight by a delta.
     */
    function evalWeight(text) {
      const t = String(text).replace(/\s+/g, "");
      if (!t) return null;
      if (!/^[+-]?\d*\.?\d+([+-]\d*\.?\d+)*$/.test(t)) return null;
      const parts = t.match(/[+-]?\d*\.?\d+/g) || [];
      return Math.round(parts.reduce((n, p) => n + Number(p), 0) * 100) / 100;
    }

    function paint() {
      clear(grid);
      const max = Math.max(1, ...values);

      const labelCol = el("div.wg-col.wg-label-col", {}, [
        el("div.wg-cell.wg-head", { text: "Period" }),
        el("div.wg-cell", { text: "Weight (%)" }),
        el("div.wg-cell.wg-vis", { text: "Visual" }),
      ]);
      grid.appendChild(labelCol);

      const scroller = el("div.wg-scroll");
      buckets.forEach((b, i) => {
        const bar = el("div.wg-bar-fill", {
          style: { height: `${Math.round(((values[i] || 0) / max) * 62)}px` },
        });
        scroller.appendChild(
          el("div.wg-col", {}, [
            el("div.wg-cell.wg-head", {
              text: b.label,
              title: `${U.fmtDate(b.start)} – ${U.fmtDate(b.end)}`,
            }),
            el("div.wg-cell", {}, [
              el("input.wg-input", {
                type: "text",
                value: String(values[i]),
                disabled: usingAi || null,
                onblur: (e) => {
                  const next = evalWeight(e.target.value);
                  if (next === null) e.target.value = String(values[i]);
                  else {
                    values[i] = U.clamp(next, 0, 100);
                    paint();
                  }
                },
                onkeydown: (e) => {
                  if (e.key === "Enter") e.target.blur();
                },
              }),
            ]),
            el("div.wg-cell.wg-vis", {}, [el("div.wg-bar", {}, [bar])]),
          ])
        );
      });
      grid.appendChild(scroller);
      paintTotal();
    }

    function total() {
      return +values.reduce((n, v) => n + (Number(v) || 0), 0).toFixed(2);
    }
    function isValid() {
      return usingAi || Math.abs(total() - 100) < 0.01;
    }

    function paintTotal() {
      clear(totalRow);
      const t = total();
      const balance = Math.round((100 - t) * 100) / 100;
      totalRow.appendChild(el("span.wt-label", { text: "Total Weight" }));
      totalRow.appendChild(
        el(`span.wt-value${isValid() ? " ok" : " bad"}`, {}, [
          el("span", { text: usingAi ? "Set by the model" : `${t.toFixed(2)}%` }),
          !usingAi && !isValid()
            ? el("span.wt-gap", {
                text: balance > 0 ? `${balance.toFixed(2)}% left to place` : `${Math.abs(balance).toFixed(2)}% over`,
              })
            : null,
          usingAi ? null : icon(isValid() ? "check" : "alert", 15),
        ])
      );
    }

    paint();

    return modal({
      width: 820,
      title: "Weighted Average Modeling",
      subtitle: `Look-back ${U.fmtRange(lookback[0], lookback[1])} · ${buckets.length} ${unit === "week" ? "weeks" : "days"}`,
      actions: (h) => [el("button.icon-btn", { onclick: () => h.close() }, [icon("close", 16)])],
      body: () => [
        el("div.wg-controls", {}, [
          el("span.label", { text: "View by" }),
          select(
            [
              { value: "week", label: "Weeks" },
              { value: "day", label: "Days", disabled: !daysAllowed },
            ],
            unit,
            (v) => {
              unit = v;
              buckets = FS.engine.buildBuckets(lookback[0], lookback[1], unit);
              values = seedValues();
              paint();
            },
            { disabled: usingAi }
          ),
          el("span.muted", {
            text: daysAllowed ? "" : "Look-back is longer than a month — weigh it by week.",
          }),
          el("span.grow"),
          usingAi
            ? null
            : el("button.link-btn", {
                text: "Distribute evenly",
                onclick: () => {
                  values = FS.engine.evenWeights(buckets.length);
                  paint();
                },
              }),
        ]),
        el("div.note-box", {
          text: usingAi
            ? "The model derives the weights from your look-back sales, ramping toward the most recent weeks. The grid below is read-only."
            : `Adjust the weight for each ${unit}. The total must equal 100%. Cells accept arithmetic — type 11+2 to add two.`,
        }),
        grid,
        totalRow,
      ],
      footer: (h) => [
        el("span.muted", { text: `Based on: ${({ AVG: "Average", MIN: "Minimum", MAX: "Maximum", USING_AI: "Using AI" })[base] || base}` }),
        el("div.row-gap", {}, [
          el("button.btn", { text: "Cancel", onclick: () => h.close() }),
          el("button.btn.btn-primary", {
            text: "Apply Weights",
            onclick: () => {
              if (!isValid()) {
                toast("The weights have to total 100%.", "error");
                return;
              }
              if (o.onSave) {
                o.onSave({
                  modelType: unit,
                  base,
                  weights: buckets.map((b, i) => ({
                    start_date: U.ymd(b.start),
                    end_date: U.ymd(b.end),
                    weight: String(values[i] ?? 0),
                  })),
                });
              }
              h.close();
            },
          }),
        ]),
      ],
    });
  }

  // ------------------------------------------------------ reference mapping
  /**
   * Maps a target SKU onto the reference SKU its forecast should follow —
   * a new launch borrowing the history of the product it replaces.
   */
  function referenceMappingModal(opts) {
    const o = opts || {};
    const lookback = o.lookback || FS.store.resolveLookback("last90");
    const targets = FS.engine.resolveTargets(o.targetSelection || {});
    let rows = Object.keys(o.mapping || {}).map((t) => ({ target: t, source: o.mapping[t] }));

    const list = el("div.map-list");

    function skuPicker(value, onChange, pool, placeholder) {
      const wrap = el("div.sku-picker");
      const input = el("input.input", {
        type: "text",
        value: value || "",
        placeholder,
        autocomplete: "off",
      });
      const menu = el("div.sku-menu");

      function search() {
        const q = input.value.trim().toLowerCase();
        clear(menu);
        if (!q) {
          menu.classList.remove("open");
          return;
        }
        const hits = pool
          .filter((r) => `${r.sku} ${r.name}`.toLowerCase().includes(q))
          .slice(0, 40);
        if (!hits.length) {
          menu.appendChild(el("div.sku-empty", { text: "No SKU matches that" }));
        }
        hits.forEach((r) => {
          menu.appendChild(
            el("button.sku-opt", {
              type: "button",
              onclick: () => {
                input.value = r.sku;
                menu.classList.remove("open");
                onChange(r.sku);
              },
            }, [
              el("span", { text: r.sku }),
              el("span.muted", { text: `${r.name} · ${U.inr(C.soldBetween(r.sku, lookback[0], lookback[1]))}` }),
            ])
          );
        });
        menu.classList.add("open");
      }

      input.addEventListener("input", search);
      input.addEventListener("focus", search);
      input.addEventListener("blur", () => setTimeout(() => menu.classList.remove("open"), 180));
      wrap.appendChild(input);
      wrap.appendChild(menu);
      return wrap;
    }

    function paint() {
      clear(list);
      list.appendChild(
        el("div.map-row.map-head", {}, [
          el("span", { text: "Target" }),
          el("span", { text: "Source it follows" }),
          el("span"),
        ])
      );
      if (!rows.length) {
        list.appendChild(FS.ui.empty("No mappings yet", "Search above to add your first one."));
        return;
      }
      rows.forEach((row) => {
        list.appendChild(
          el("div.map-row", {}, [
            el("span.truncate", { title: row.target, text: row.target }),
            skuPicker(row.source, (v) => {
              row.source = v;
              paintCount();
            }, C.SKUS, "Search a source SKU…"),
            el("button.icon-btn.danger", {
              title: "Remove this mapping",
              onclick: () => {
                rows = rows.filter((r) => r.target !== row.target);
                paint();
                paintCount();
              },
            }, [icon("trash", 15)]),
          ])
        );
      });
    }

    const countLabel = el("span.muted");
    function paintCount() {
      const mapped = rows.filter((r) => r.source).length;
      countLabel.textContent = rows.length ? `${mapped} of ${rows.length} mapped` : "No mappings yet";
    }

    paint();
    paintCount();

    return modal({
      width: 900,
      title: "Select Reference Source",
      subtitle: "Anything not listed here is forecast from its own history.",
      actions: (h) => [
        el("button.link-btn", { text: "Reset", onclick: () => { rows = []; paint(); paintCount(); } }),
        el("button.btn", { text: "Cancel", onclick: () => h.close() }),
        el("button.btn.btn-primary", {
          text: "Save and Proceed",
          onclick: () => {
            const map = {};
            rows.forEach((r) => {
              if (r.source && r.source !== r.target) map[r.target] = r.source;
            });
            if (o.onSave) o.onSave(map);
            h.close();
          },
        }),
      ],
      body: () => [
        el("div.map-add", {}, [
          skuPicker("", (sku) => {
            if (!sku || rows.some((r) => r.target === sku)) return;
            rows.push({ target: sku, source: "" });
            paint();
            paintCount();
          }, targets.length ? targets : C.SKUS, "Search a target SKU to add…"),
          countLabel,
        ]),
        list,
      ],
    });
  }

  // ------------------------------------------------------- adjustment scope
  /** When an adjustment applies, and to which items. */
  function adjustmentScopeModal(opts) {
    const o = opts || {};
    const scope = o.scope || {};
    let range = scope.range
      ? [U.startOfDay(scope.range[0]), U.startOfDay(scope.range[1])]
      : [U.startOfDay(o.forecast[0]), U.startOfDay(o.forecast[1])];

    const countLabel = el("span.scope-count");
    const panel = filterPanel({
      value: scope.filters || {},
      onChange: () => paintCount(),
    });

    function paintCount() {
      const n = FS.engine.resolveTargets({ filters: panel.value }).length;
      countLabel.textContent = `${U.inr(n)} items`;
    }
    paintCount();

    return modal({
      width: 900,
      title: o.title || "Adjustment scope",
      subtitle: "Applies to every forecast item unless you narrow it below.",
      actions: (h) => [
        el("button.btn", { text: "Cancel", onclick: () => h.close() }),
        el("button.btn.btn-primary", {
          text: "Apply scope",
          onclick: () => {
            if (o.onSave) {
              o.onSave({
                filters: JSON.parse(JSON.stringify(panel.value)),
                range: [U.ymd(range[0]), U.ymd(range[1])],
              });
            }
            h.close();
          },
        }),
      ],
      body: () => [
        el("div.scope-row", {}, [
          el("span.label", { text: "Active between" }),
          dateRange(range[0], range[1], (v) => {
            range = v;
          }),
          el("span.muted", { text: "Defaults to the whole forecast period." }),
        ]),
        el("div.scope-row", {}, [
          el("span.label", { text: "Applies to" }),
          countLabel,
        ]),
        panel.el,
      ],
    });
  }

  FS.modals = {
    targetItemsModal, selectPoModal, weightedAverageModal,
    referenceMappingModal, adjustmentScopeModal, filterPanel,
    DEFAULT_FILTERS, CUSTOM_FILTERS,
  };
})(window.FS);
