/*
 * The forecast result screen.
 *
 * Scenario tabs across the top, the campaign's own constraints beneath them,
 * the headline tiles, and the per-SKU table. Generate re-runs the engine for
 * the open tab; the run is staged so the pipeline is visible rather than a
 * number appearing out of nowhere.
 */
(function (FS) {
  "use strict";

  const U = FS.util;
  const S = FS.store;
  const A = FS.adjustments;
  const { el, icon, toast, confirm, select, pager, clear, modal, dateRange } = FS.ui;

  let campaignId = null;
  let activeId = null;
  let page = 1;
  let pageSize = 25;
  let search = "";
  let expanded = false;
  let running = null; // { id, stage, total }
  // The open full-screen table, if any.
  let fullscreen = null;

  /** Drop the current full-screen modal without it reporting a user close. */
  function replaceFullscreen() {
    const stale = fullscreen;
    fullscreen = null;
    if (!stale) return;
    if (stale.slot) stale.slot.replacing = true;
    stale.close();
  }
  let showPipeline = false;

  function open(id, opts) {
    const o = opts || {};
    campaignId = Number(id);
    activeId = o.scenario ? Number(o.scenario) : campaignId;
    page = 1;
    search = "";
    running = null;
    if (o.running) {
      // The wizard just asked for this one; start it as soon as we paint.
      setTimeout(() => startRun(activeId), 60);
    } else {
      const c = S.getCampaign(activeId);
      // A seeded campaign carries a status but no stored result — compute it
      // once, quietly, so the screen is never blank on first open.
      if (c && c.runStatus === "Success" && !c.result) S.runCampaign(c.id);
    }
  }

  // ------------------------------------------------------------------- run
  const STAGE_LABELS = [
    "Resolving the target set…",
    "Reading look-back sales…",
    "Bucketing and weighting…",
    "Removing past-event distortion…",
    "Projecting daily demand…",
    "Applying adjustments…",
    "Costing the plan…",
  ];

  /**
   * Run the engine behind a staged progress bar.
   *
   * The computation itself takes milliseconds. The stages are paced so the
   * pipeline reads as a sequence — which is the point of the demo — and the
   * engine runs on the last tick so the numbers are genuinely fresh.
   */
  function startRun(id) {
    const campaign = S.getCampaign(id);
    if (!campaign) return;
    campaign.runStatus = "Processing";
    S.save();
    running = { id, stage: 0, total: STAGE_LABELS.length };
    repaint();

    const tick = () => {
      running.stage += 1;
      if (running.stage >= running.total) {
        try {
          S.runCampaign(id);
          running = null;
          repaint();
          toast("Forecast run finished.", "success");
        } catch (e) {
          campaign.runStatus = "Failed";
          S.save();
          running = null;
          repaint();
          toast("The run failed: " + e.message, "error");
        }
        return;
      }
      repaint();
      setTimeout(tick, 230);
    };
    setTimeout(tick, 260);
  }

  function repaint() {
    FS.shell.refresh();
  }

  // ---------------------------------------------------------------- pieces
  function scenarioTabs(base) {
    const list = S.scenariosOf(base.id);
    const wrap = el("div.scenario-tabs");

    list.forEach((s) => {
      const isActive = s.id === activeId;
      const isBase = s.id === base.id;
      const tab = el(`div.scenario-tab${isActive ? " active" : ""}`, {
        onclick: () => {
          activeId = s.id;
          page = 1;
          const c = S.getCampaign(s.id);
          if (c && c.runStatus === "Success" && !c.result) S.runCampaign(c.id);
          repaint();
        },
      }, [
        el(`span.tab-dot${isActive ? " on" : ""}`),
        el("span.tab-name", { title: s.name, text: s.name }),
        isBase ? el("span.tab-tag", { text: "BASE" }) : null,
        s.status === "approved" ? el("span.tab-approved", {}, [icon("check", 10), el("span", { text: "APPROVED" })]) : null,
        el("button.tab-menu", {
          title: "Scenario actions",
          onclick: (e) => {
            e.stopPropagation();
            scenarioMenu(e.currentTarget, s, base, isBase);
          },
        }, [icon("more", 14)]),
      ]);
      wrap.appendChild(tab);
    });

    wrap.appendChild(
      el("button.scenario-add", {
        title: "Duplicate the selected scenario into a new tab",
        onclick: () => {
          const copy = S.duplicateScenario(activeId, base.id);
          if (copy) {
            activeId = copy.id;
            toast("Scenario duplicated.", "success");
            repaint();
          }
        },
      }, [icon("plus", 14), el("span", { text: "Duplicate" })])
    );

    return wrap;
  }

  function scenarioMenu(anchor, scenario, base, isBase) {
    document.querySelectorAll(".popmenu").forEach((n) => n.remove());
    const rect = anchor.getBoundingClientRect();
    const menu = el("div.popmenu", {
      style: { top: `${rect.bottom + 6}px`, left: `${Math.max(8, rect.right - 170)}px` },
    }, [
      el("button.popmenu-item", {
        onclick: () => {
          menu.remove();
          const copy = S.duplicateScenario(scenario.id, base.id);
          if (copy) {
            activeId = copy.id;
            toast("Scenario duplicated.", "success");
            repaint();
          }
        },
      }, [icon("copy", 14), el("span", { text: "Duplicate" })]),
      el("button.popmenu-item", {
        onclick: () => {
          menu.remove();
          const c = S.getCampaign(scenario.id);
          c.adjustments = S.emptyAdjustments();
          A.ensureEvents(c);
          S.save();
          toast("Adjustments cleared on this scenario.", "success");
          repaint();
        },
      }, [icon("undo", 14), el("span", { text: "Clear adjustments" })]),
      isBase
        ? null
        : el("button.popmenu-item.danger", {
            onclick: () => {
              menu.remove();
              confirm({
                title: `Delete "${scenario.name}"?`,
                message: "Its forecast goes with it. This cannot be undone.",
                okText: "Delete",
                danger: true,
                onOk: () => {
                  S.deleteCampaign(scenario.id);
                  if (activeId === scenario.id) activeId = base.id;
                  toast("Scenario deleted.", "success");
                  repaint();
                },
              });
            },
          }, [icon("trash", 14), el("span", { text: "Delete" })]),
    ]);
    document.body.appendChild(menu);
    setTimeout(() => {
      document.addEventListener("click", function close() {
        menu.remove();
        document.removeEventListener("click", close);
      });
    }, 0);
  }

  function summaryCard(campaign) {
    const result = campaign.result;
    const targetCount = FS.engine.resolveTargets(campaign.targetSelection).length;
    const isProcessing = !!(running && running.id === campaign.id);

    return el("div.card.summary-card", {}, [
      el("div.summary-top", {}, [
        el("div.summary-facts", {}, [
          fact("SKUs", `${U.inr(targetCount)} Items`),
          fact("Forecast Period", `${U.diffDays(campaign.forecastStart, campaign.forecastEnd)} days`),
          fact("Forecast Window", U.fmtRange(campaign.forecastStart, campaign.forecastEnd)),
          fact("Look back", U.fmtRange(campaign.lookbackStart, campaign.lookbackEnd)),
          fact("Base", ({ AVG: "Average", MIN: "Minimum", MAX: "Maximum", USING_AI: "Using AI" })[campaign.weighting.base]),
          fact("Last run", campaign.lastRunAt ? new Date(campaign.lastRunAt).toLocaleString("en-IN") : "—"),
        ]),
        el("button.btn.btn-sm", {
          onclick: () => constrainsModal(campaign),
        }, [el("span", { text: "Edit Constrains" }), icon("edit", 14)]),
      ]),
      el("div.summary-actions", {}, [
        el(`button.btn.btn-primary${isProcessing ? " loading" : ""}`, {
          disabled: isProcessing || null,
          onclick: () => startRun(campaign.id),
        }, [el("span", { text: isProcessing ? "Generating…" : "Generate" }), isProcessing ? null : icon("refresh", 14)]),
        el("button.link-btn.grey", {
          text: "Back to campaigns",
          onclick: () => { window.location.hash = "#/demand-forecasting"; },
        }),
        el("button.link-btn.grey", {
          text: "Reset adjustments",
          onclick: () =>
            confirm({
              title: "Reset this scenario's adjustments?",
              message: "Ads, pricing, custom rows and ticked events are cleared. The forecast window stays.",
              okText: "Reset",
              danger: true,
              onOk: () => {
                campaign.adjustments = S.emptyAdjustments();
                A.ensureEvents(campaign);
                S.save();
                toast("Adjustments reset.", "success");
                repaint();
              },
            }),
        }),
        el("span.grow"),
        result
          ? el("button.link-btn", {
              text: showPipeline ? "Hide how this was computed" : "How this was computed",
              onclick: () => {
                showPipeline = !showPipeline;
                repaint();
              },
            })
          : null,
      ]),
    ]);
  }

  function fact(label, value) {
    return el("div.fact", {}, [
      el("span.fact-label", { text: label }),
      el("span.fact-value", { text: value }),
    ]);
  }

  function tiles(result, campaign) {
    const t = (result && result.totals) || null;
    const target = (campaign && campaign.constraints) || S.defaultConstraints();
    const items = [
      { label: "SKUs", value: t ? U.inr(t.count) : "—" },
      { label: "Forecast Qty", value: t ? U.inr(t.qty) : "—", sub: t ? `${U.compactQty(t.qty / t.horizon)} / day` : "" },
      { label: "Forecast Value", value: t ? U.compactMoney(t.value) : "—", sub: t ? U.money(t.value) : "" },
      { label: "Units To Buy", value: t ? U.inr(t.restockUnits) : "—", sub: t ? `${U.compactMoney(t.restockValue)} at cost` : "" },
      { label: "Projected DIO", value: t ? `${t.dio} days` : "—", sub: t ? `target ${target.dio} days` : "" },
      {
        label: "Stockout Risk",
        value: t ? `${t.atRisk} SKUs` : "—",
        // "At risk" means cover runs out inside the supplier's lead time.
        sub: t ? `${U.pct(t.riskPct)} under ${target.leadTime}d lead time` : "",
      },
    ];
    return el("div.tiles", {}, items.map((m) =>
      el("div.tile", {}, [
        el("span.tile-label", { text: m.label }),
        el("span.tile-value", { text: m.value }),
        m.sub ? el("span.tile-sub", { text: m.sub }) : null,
      ])
    ));
  }

  function pipelinePanel(result) {
    return el("div.card.pipeline", {}, [
      el("div.pipeline-head", {}, [
        el("h3", { text: "How this forecast was computed" }),
        el("span.muted", { text: `${result.ms} ms · ${U.inr(result.rows.length)} SKUs` }),
      ]),
      el("ol.pipeline-list", {}, result.stages.map((s, i) =>
        el("li.pipeline-step", {}, [
          el("span.pipeline-no", { text: String(i + 1) }),
          el("div", {}, [
            el("span.pipeline-title", { text: s.title }),
            el("span.pipeline-detail", { text: s.detail }),
          ]),
        ])
      )),
    ]);
  }

  function progressPanel() {
    const pctDone = Math.round((running.stage / running.total) * 100);
    return el("div.card.progress-card", {}, [
      el("div.progress-head", {}, [
        el("div.spinner"),
        el("div", {}, [
          el("h3", { text: "Generating forecast…" }),
          el("p.muted", { text: STAGE_LABELS[Math.min(running.stage, STAGE_LABELS.length - 1)] }),
        ]),
        el("span.progress-pct", { text: `${pctDone}%` }),
      ]),
      el("div.progress-bar", {}, [el("div.progress-fill", { style: { width: `${pctDone}%` } })]),
    ]);
  }

  // ------------------------------------------------------------ the table
  function forecastTable(campaign) {
    const result = campaign.result;
    const card = el("div.card.forecast-card");

    card.appendChild(
      el("div.card-head.compact", {}, [
        el("h3.card-title.sm", { text: "Forecast Table" }),
        el("span.grow"),
        el("div.input-wrap", {}, [
          icon("search", 14),
          el("input.input", {
            type: "text",
            value: search,
            placeholder: "Search SKU or product…",
            oninput: (e) => {
              search = e.target.value;
              page = 1;
              // Repaint only the table body, so the caret stays in the box.
              paintBody();
              const focus = card.querySelector(".input-wrap input");
              if (focus) focus.focus();
            },
          }),
        ]),
        select(
          [
            { value: "month", label: "Month" },
            { value: "week", label: "Week" },
          ],
          campaign.groupBy,
          (v) => {
            campaign.groupBy = v;
            S.save();
            if (campaign.result) S.runCampaign(campaign.id);
            repaint();
          },
          { className: "select-sm" }
        ),
        el("button.icon-btn.bordered", {
          title: "Download this page as CSV",
          onclick: () => exportCsv(campaign),
        }, [icon("download", 15)]),
        el("button.icon-btn.bordered", {
          title: expanded ? "Close full screen" : "Open full screen",
          onclick: () => {
            expanded = !expanded;
            repaint();
          },
        }, [icon(expanded ? "compress" : "expand", 15)]),
      ])
    );

    const bodyHost = el("div.forecast-body");
    card.appendChild(bodyHost);

    function paintBody() {
      clear(bodyHost);

      if (!result) {
        bodyHost.appendChild(
          FS.ui.empty("No forecast rows yet", "Press Generate to run this scenario.")
        );
        return;
      }

      const q = search.trim().toLowerCase();
      const all = q
        ? result.rows.filter((r) => `${r.sku} ${r.name}`.toLowerCase().includes(q))
        : result.rows;
      const total = all.length;
      const pages = Math.max(1, Math.ceil(total / pageSize));
      const p = U.clamp(page, 1, pages);
      const rows = all.slice((p - 1) * pageSize, p * pageSize);

      const table = el("table.table.forecast-table");
      const head = el("tr", {}, [
        el("th.sticky-col", { text: "SKU" }),
        el("th", { text: "Channel" }),
      ]);
      result.periods.forEach((k) => {
        head.appendChild(el("th.right", { text: result.groupBy === "week" ? k : U.monthLabel(k) }));
      });
      head.appendChild(el("th.right", { text: "Total Qty" }));
      head.appendChild(el("th.right", { text: "Total Value" }));
      head.appendChild(el("th.right", { text: "Cover" }));
      head.appendChild(el("th.right", { text: "To Buy" }));
      table.appendChild(el("thead", {}, [head]));

      const tbody = el("tbody");
      rows.forEach((r) => {
        const tr = el("tr", {}, [
          el("td.sticky-col", {}, [
            el("div.cell-strong", { title: r.name, text: r.sku }),
            el("div.cell-sub", { text: r.name }),
          ]),
          el("td", {}, [el("span.cell-muted", { text: r.channel })]),
        ]);
        result.periods.forEach((k) => {
          tr.appendChild(el("td.right", { text: U.inr(r.cells[k] || 0) }));
        });
        tr.appendChild(el("td.right.blue", { text: U.inr(r.qty) }));
        tr.appendChild(el("td.right", { text: U.money(r.value) }));
        tr.appendChild(
          el("td.right", {}, [
            el(`span.cover${r.coverDays < r.leadTimeDays ? " risk" : ""}`, {
              title: `${r.coverDays} days of cover against a ${r.leadTimeDays}-day lead time`,
              text: `${r.coverDays}d`,
            }),
          ])
        );
        tr.appendChild(el("td.right.strong", { text: U.inr(r.restock) }));
        tbody.appendChild(tr);
      });

      if (!rows.length) {
        tbody.appendChild(
          el("tr", {}, [
            el("td", { colspan: result.periods.length + 6 }, [
              FS.ui.empty(q ? "No SKU matches that search" : "No forecast rows", ""),
            ]),
          ])
        );
      }
      table.appendChild(tbody);

      // Campaign-wide totals, so they stay right on every page.
      const foot = el("tr", {}, [
        el("td.sticky-col", { text: "Total" }),
        el("td"),
      ]);
      result.periods.forEach((k) => {
        foot.appendChild(el("td.right", { text: U.inr(result.totals.byPeriod[k] || 0) }));
      });
      foot.appendChild(el("td.right.blue", { text: U.inr(result.totals.qty) }));
      foot.appendChild(el("td.right", { text: U.money(result.totals.value) }));
      foot.appendChild(el("td"));
      foot.appendChild(el("td.right.strong", { text: U.inr(result.totals.restockUnits) }));
      table.appendChild(el("tfoot", {}, [foot]));

      bodyHost.appendChild(el("div.table-wrap.scroll", {}, [table]));
      bodyHost.appendChild(
        pager({
          page: p, pageSize, total, unit: "SKUs",
          onChange: (np, ns) => {
            page = np;
            pageSize = ns;
            paintBody();
          },
        })
      );
    }

    paintBody();
    return card;
  }

  function exportCsv(campaign) {
    const result = campaign.result;
    if (!result) {
      toast("Run the forecast first.", "error");
      return;
    }
    const head = ["SKU", "Product", "Channel"]
      .concat(result.periods.map((k) => (result.groupBy === "week" ? k : U.monthLabel(k))))
      .concat(["Total Qty", "Total Value", "Cover Days", "To Buy"]);
    const lines = [head.join(",")];
    result.rows.forEach((r) => {
      const cells = result.periods.map((k) => r.cells[k] || 0);
      lines.push(
        [`"${r.sku}"`, `"${r.name}"`, r.channel]
          .concat(cells)
          .concat([r.qty, r.value, r.coverDays, r.restock])
          .join(",")
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${campaign.name.replace(/[^\w-]+/g, "_")}_forecast.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("CSV downloaded.", "success");
  }

  // ------------------------------------------------------- constrains modal
  /**
   * Edit Constrains: the wizard's steps, re-opened against the scenario that
   * is on screen. Apply re-runs this tab; Generate As New Scenario forks it
   * and runs the fork, leaving the source exactly as it was.
   */
  function constrainsModal(campaign) {
    // Work on a copy so Cancel really cancels.
    const draft = JSON.parse(JSON.stringify({
      name: campaign.name,
      forecastStart: campaign.forecastStart,
      forecastEnd: campaign.forecastEnd,
      lookbackStart: campaign.lookbackStart,
      lookbackEnd: campaign.lookbackEnd,
      lookbackPreset: campaign.lookbackPreset,
      targetSelection: campaign.targetSelection,
      changeReference: campaign.changeReference,
      referenceMapping: campaign.referenceMapping,
      weighting: campaign.weighting,
      adjustments: campaign.adjustments,
      constraints: campaign.constraints,
    }));
    A.ensureEvents({ adjustments: draft.adjustments });

    let tab = "target";
    let adjTab = "ads";

    const bodyHost = el("div.constrains-body");

    function apply(target) {
      Object.assign(target, {
        name: draft.name,
        forecastStart: draft.forecastStart,
        forecastEnd: draft.forecastEnd,
        lookbackStart: draft.lookbackStart,
        lookbackEnd: draft.lookbackEnd,
        lookbackPreset: draft.lookbackPreset,
        targetSelection: draft.targetSelection,
        changeReference: draft.changeReference,
        referenceMapping: draft.referenceMapping,
        weighting: draft.weighting,
        adjustments: draft.adjustments,
        constraints: draft.constraints,
      });
      S.save();
    }

    const handle = modal({
      width: 1040,
      title: "Constrains",
      subtitle: "Edit the scenario on screen, or fork it into a new one.",
      actions: (h) => [
        el("button.link-btn.grey", { text: "Cancel", onclick: () => h.close() }),
        el("button.btn", {
          onclick: () => {
            const copy = S.duplicateScenario(campaign.id, campaignId);
            apply(copy);
            copy.name = `${draft.name}_${S.scenariosOf(campaignId).length - 1}`;
            S.save();
            activeId = copy.id;
            h.close();
            startRun(copy.id);
            toast("New scenario generated.", "success");
          },
        }, [icon("plus", 14), el("span", { text: "Generate As New Scenario" })]),
        el("button.btn.btn-primary", {
          onclick: () => {
            apply(campaign);
            h.close();
            startRun(campaign.id);
          },
        }, [icon("refresh", 14), el("span", { text: "Apply To Current Scenario" })]),
      ],
      body: () => [bodyHost],
    });

    function paint() {
      clear(bodyHost);

      // Name and the two windows, exactly the fields the wizard asked for.
      bodyHost.appendChild(
        el("div.constrains-fields", {}, [
          el("div.cf-row", {}, [
            el("span.cf-label", { text: "Campaign Name" }),
            el("input.input", {
              type: "text",
              value: draft.name,
              oninput: (e) => { draft.name = e.target.value; },
            }),
          ]),
          el("div.cf-row", {}, [
            el("span.cf-label", { text: "Forecast Period" }),
            select(
              S.FORECAST_PERIODS.map((d) => ({ value: String(d), label: `${d} days` })).concat([
                { value: "custom", label: "Custom" },
              ]),
              String(U.diffDays(draft.forecastStart, draft.forecastEnd)),
              (v) => {
                if (v === "custom") return;
                draft.forecastEnd = U.ymd(U.addDays(draft.forecastStart, Number(v)));
                paint();
              },
              { className: "select-sm" }
            ),
            dateRange(draft.forecastStart, draft.forecastEnd, (v) => {
              if (!v[0] || !v[1] || isNaN(v[0]) || isNaN(v[1])) return;
              draft.forecastStart = U.ymd(v[0]);
              draft.forecastEnd = U.ymd(v[1]);
            }),
          ]),
          el("div.cf-row", {}, [
            el("span.cf-label", { text: "Look Back" }),
            select(S.LOOKBACK_OPTIONS, draft.lookbackPreset, (v) => {
              draft.lookbackPreset = v;
              const [a, b] = S.resolveLookback(v);
              draft.lookbackStart = U.ymd(a);
              draft.lookbackEnd = U.ymd(b);
              draft.weighting.weights = null;
              paint();
            }, { className: "select-md" }),
            dateRange(draft.lookbackStart, draft.lookbackEnd, (v) => {
              if (!v[0] || !v[1] || isNaN(v[0]) || isNaN(v[1])) return;
              draft.lookbackStart = U.ymd(v[0]);
              draft.lookbackEnd = U.ymd(v[1]);
              draft.lookbackPreset = "custom";
              draft.weighting.weights = null;
            }),
          ]),
          el("div.cf-row", {}, [
            el("span.cf-label", { text: "Based on" }),
            select(
              [
                { value: "AVG", label: "Average" },
                { value: "MIN", label: "Minimum" },
                { value: "MAX", label: "Maximum" },
                { value: "USING_AI", label: "Using AI" },
              ],
              draft.weighting.base,
              (v) => {
                draft.weighting.base = v;
                draft.weighting.weights = null;
                paint();
              },
              { className: "select-sm" }
            ),
            el("button.link-btn.underline", {
              text: "Weighted Average Modeling",
              onclick: () =>
                FS.modals.weightedAverageModal({
                  lookback: [U.startOfDay(draft.lookbackStart), U.startOfDay(draft.lookbackEnd)],
                  modelType: draft.weighting.modelType,
                  base: draft.weighting.base,
                  weights: draft.weighting.weights,
                  onSave: (w) => {
                    draft.weighting = w;
                    toast("Weights applied.", "success");
                  },
                }),
            }),
          ]),
        ])
      );

      // Three accordion-style tabs, matching the board.
      const TABS = [
        { key: "target", label: "Select Target" },
        { key: "reference", label: "Select Reference Source" },
        { key: "adjustments", label: "Add Adjustments" },
      ];
      bodyHost.appendChild(
        el("div.ctabs", {}, TABS.map((t) =>
          el(`button.ctab${tab === t.key ? " active" : ""}`, {
            text: t.label,
            onclick: () => { tab = t.key; paint(); },
          })
        ))
      );

      const panel = el("div.ctab-panel");

      if (tab === "target") {
        const count = FS.engine.resolveTargets(draft.targetSelection).length;
        panel.appendChild(el("p.hint", { text: "These are the items that are going to get the forecast for the selected period." }));
        panel.appendChild(
          el("div.inline-row", {}, [
            el("span.label.blue", { text: "Total Selection" }),
            el("button.chip-btn", {
              onclick: () =>
                FS.modals.targetItemsModal({
                  selected: draft.targetSelection,
                  lookback: [U.startOfDay(draft.lookbackStart), U.startOfDay(draft.lookbackEnd)],
                  onSave: (sel) => {
                    draft.targetSelection = sel;
                    paint();
                  },
                }),
            }, [el("span", { text: `${U.inr(count)} Items Selected` }), icon("edit", 14, "#007FFF")]),
            el("span.muted", { text: FS.views.campaigns.describeSelection(draft.targetSelection) }),
          ])
        );
      }

      if (tab === "reference") {
        panel.appendChild(el("p.hint", { text: "These are the items that are going to be referred to get the forecast for the selected period." }));
        panel.appendChild(
          el("div.inline-row", {}, [
            el("span.label", { text: "Currently we use the Target Items. Change the Reference Source:" }),
            el(`button.toggle${draft.changeReference ? " on" : ""}`, {
              onclick: () => {
                draft.changeReference = !draft.changeReference;
                paint();
              },
            }, [el("span.knob")]),
          ])
        );
        if (draft.changeReference) {
          panel.appendChild(
            el("div.inline-row", {}, [
              el("span.label.blue", { text: "Total Selection" }),
              el("button.chip-btn", {
                onclick: () =>
                  FS.modals.referenceMappingModal({
                    lookback: [U.startOfDay(draft.lookbackStart), U.startOfDay(draft.lookbackEnd)],
                    targetSelection: draft.targetSelection,
                    mapping: draft.referenceMapping,
                    onSave: (m) => {
                      draft.referenceMapping = m;
                      paint();
                    },
                  }),
              }, [
                el("span", { text: `${Object.keys(draft.referenceMapping || {}).length} mapped` }),
                icon("edit", 14, "#007FFF"),
              ]),
            ])
          );
        }
      }

      if (tab === "adjustments") {
        const c = A.counts(draft.adjustments);
        const sub = [
          { key: "ads", label: `Ads Adjustments: ${c.ads}` },
          { key: "events", label: `Events Adjustments: ${c.eventsPast} | ${c.eventsFuture}` },
          { key: "price", label: `Price Adjustments: ${c.price}` },
          { key: "custom", label: `Custom Adjustments: ${c.custom}` },
          { key: "constraints", label: "Constraints" },
        ];
        panel.appendChild(
          el("div.subtabs", {}, sub.map((t) =>
            el(`button.subtab${adjTab === t.key ? " active" : ""}${t.key === "constraints" ? " push" : ""}`, {
              text: t.label,
              onclick: () => { adjTab = t.key; paint(); },
            })
          ))
        );

        const rerender = () => paint();
        const group = (key, renderRow, emptyText) => {
          const list = el("div.adj-list");
          (draft.adjustments[key] || []).forEach((row) => {
            list.appendChild(
              renderRow(row, {
                onChange: () => {},
                onRemove: () => {
                  draft.adjustments[key] = draft.adjustments[key].filter((r) => r.id !== row.id);
                  rerender();
                },
                onScope: () =>
                  FS.modals.adjustmentScopeModal({
                    scope: row.scope,
                    forecast: [U.startOfDay(draft.forecastStart), U.startOfDay(draft.forecastEnd)],
                    onSave: (s) => {
                      row.scope = s;
                      rerender();
                    },
                  }),
              })
            );
          });
          if (!(draft.adjustments[key] || []).length) list.appendChild(el("p.hint", { text: emptyText }));
          list.appendChild(
            el("button.add-row-btn", {
              text: "+ Add another",
              onclick: () => {
                draft.adjustments[key] = (draft.adjustments[key] || []).concat([A.newRow(key)]);
                rerender();
              },
            })
          );
          return list;
        };

        if (adjTab === "ads") panel.appendChild(group("ads", A.adsRow, "No ad spend adjustments."));
        if (adjTab === "price") panel.appendChild(group("price", A.priceRow, "No pricing adjustments."));
        if (adjTab === "custom") panel.appendChild(group("custom", A.customRow, "No custom adjustments."));
        if (adjTab === "events") {
          const past = draft.adjustments.events.filter((e) => e.isPast);
          const future = draft.adjustments.events.filter((e) => !e.isPast);
          panel.appendChild(
            el("div.evt-grid", {}, [
              el("div.evt-col", {}, [
                el("h4", { text: `Past Events (${past.filter((e) => e.selected).length}/${past.length}): Impact` }),
                past.map((e) => A.eventRow(e, () => {})),
              ]),
              el("div.evt-col", {}, [
                el("h4", { text: `Future Events (${future.filter((e) => e.selected).length}/${future.length}): Impact` }),
                future.map((e) => A.eventRow(e, () => {})),
              ]),
            ])
          );
        }
        if (adjTab === "constraints") panel.appendChild(constraintsPanel(draft));
      }

      bodyHost.appendChild(panel);
    }

    paint();
    return handle;
  }

  /**
   * Capital guardrails, with a live impact preview.
   *
   * The preview is computed, not decorative: moving a slider re-runs the
   * engine against the draft and reports what actually changed.
   */
  function constraintsPanel(draft) {
    const host = el("div.constraints-panel");
    const previewHost = el("div.impact-preview");

    const DEFS = [
      { key: "capital", label: "Inventory Capital Budget", unit: "₹Cr", min: 0, max: 120, step: 0.5, sub: "Maximum capital the plan can deploy" },
      { key: "dio", label: "Target DIO", unit: "days", min: 0, max: 120, step: 1, sub: "Days of inventory to maintain" },
      { key: "leadTime", label: "Lead Time", unit: "days", min: 1, max: 90, step: 1, sub: "Supplier lead time the cover is judged against" },
    ];

    let timer = null;
    function schedulePreview() {
      clearTimeout(timer);
      timer = setTimeout(paintPreview, 160);
    }

    function paintPreview() {
      clear(previewHost);
      const res = FS.engine.runForecast({
        forecastStart: draft.forecastStart,
        forecastEnd: draft.forecastEnd,
        lookbackStart: draft.lookbackStart,
        lookbackEnd: draft.lookbackEnd,
        targetSelection: draft.targetSelection,
        referenceMapping: draft.changeReference ? draft.referenceMapping : {},
        weighting: draft.weighting,
        adjustments: draft.adjustments,
        constraints: draft.constraints,
        groupBy: "month",
      });
      const t = res.totals;
      previewHost.appendChild(
        el("div.ip-head", {}, [
          el("h4", { text: "Impact Preview" }),
          el("p.muted", { text: "Recomputed as you move the controls" }),
        ])
      );
      const metrics = t
        ? [
            { label: "Cash Used", value: U.compactMoney(t.restockValue) },
            { label: "Revenue Covered", value: U.compactMoney(t.value) },
            { label: "Projected DIO", value: `${t.dio} days` },
            { label: "Stockout Risk", value: U.pct(t.riskPct) },
            { label: "Units To Buy", value: U.inr(t.restockUnits) },
            { label: "Budget Fit", value: t.capitalScale < 1 ? U.pct(t.capitalScale * 100, 0) + " of need" : "Within budget" },
          ]
        : [];
      previewHost.appendChild(
        el("div.ip-grid", {}, metrics.map((m) =>
          el("div.ip-cell", {}, [
            el("span.ip-label", { text: m.label }),
            el("span.ip-value", { text: m.value }),
          ])
        ))
      );
    }

    const controls = el("div.constraint-controls");
    DEFS.forEach((d) => {
      const valueInput = el("input.num-input", {
        type: "number",
        value: draft.constraints[d.key],
        step: d.step,
        oninput: (e) => {
          draft.constraints[d.key] = Number(e.target.value);
          slider.value = e.target.value;
          schedulePreview();
        },
      });
      const slider = el("input.slider", {
        type: "range",
        min: d.min,
        max: d.max,
        step: d.step,
        value: draft.constraints[d.key],
        oninput: (e) => {
          draft.constraints[d.key] = Number(e.target.value);
          valueInput.value = e.target.value;
          schedulePreview();
        },
      });

      controls.appendChild(
        el("div.constraint", {}, [
          el("div.inline-row", {}, [
            el("span.label", { text: d.label }),
            valueInput,
            el("span.muted", { text: d.unit }),
          ]),
          el("span.hint", { text: d.sub }),
          slider,
          el("div.slider-scale", {}, [
            el("span", { text: `${d.min}${d.unit === "₹Cr" ? "Cr" : ""}` }),
            el("span", { text: `${d.max}${d.unit === "₹Cr" ? "Cr" : " days"}` }),
          ]),
        ])
      );
    });

    host.appendChild(controls);
    host.appendChild(previewHost);
    paintPreview();
    return host;
  }

  // ----------------------------------------------------------------- render
  function render(host) {
    const base = S.getCampaign(campaignId);
    if (!base) {
      host.appendChild(FS.ui.empty("That campaign no longer exists", "Pick another from the list."));
      host.appendChild(
        el("button.btn.btn-primary", {
          text: "Back to campaigns",
          onclick: () => { window.location.hash = "#/demand-forecasting"; },
        })
      );
      return;
    }
    const campaign = S.getCampaign(activeId) || base;

    host.appendChild(
      el("button.back-link", {
        onclick: () => { window.location.hash = "#/demand-forecasting"; },
      }, [icon("arrowLeft", 14), el("span", { text: "Back to campaigns" })])
    );

    host.appendChild(
      el("div.forecast-top", {}, [
        el("input.input.campaign-name", {
          type: "text",
          value: campaign.name,
          oninput: (e) => {
            campaign.name = e.target.value;
            S.save();
          },
        }),
        el("span.grow"),
        campaign.status === "approved"
          ? el("span.approved-note", {}, [icon("check", 14), el("span", { text: "Approved plan" })])
          : null,
        el("button.btn.btn-primary", {
          onclick: () => {
            if (!campaign.result) {
              toast("Run the forecast before approving it.", "error");
              return;
            }
            campaign.status = campaign.status === "approved" ? "draft" : "approved";
            S.save();
            toast(campaign.status === "approved" ? "Plan approved." : "Approval withdrawn.", "success");
            repaint();
          },
          text: campaign.status === "approved" ? "Withdraw Approval" : "Approve Plan",
        }),
      ])
    );

    host.appendChild(scenarioTabs(base));
    host.appendChild(summaryCard(campaign));

    if (running && running.id === campaign.id) host.appendChild(progressPanel());

    host.appendChild(tiles(campaign.result, campaign));

    if (showPipeline && campaign.result) host.appendChild(pipelinePanel(campaign.result));

    const table = forecastTable(campaign);
    if (expanded) {
      /*
       * One full-screen modal at a time. Anything that repaints the screen
       * while it is open — changing the grouping, a run finishing — would
       * otherwise stack a second copy on top of the first.
       */
      if (fullscreen) replaceFullscreen();
      /*
       * `slot.replacing` tells the close handler which kind of close this is.
       * Swapping one copy for a fresh one still fires onClose, and without the
       * flag that read as the user shutting it — the modal opened and closed
       * itself in the same breath.
       */
      const slot = { replacing: false };
      fullscreen = modal({
        width: Math.min(window.innerWidth - 40, 1600),
        title: `${campaign.name} — Forecast Table`,
        actions: (handle) => [
          el("button.icon-btn", {
            title: "Close full screen",
            onclick: () => {
              expanded = false;
              handle.close();
            },
          }, [icon("compress", 16)]),
        ],
        onClose: () => {
          if (slot.replacing) return;
          fullscreen = null;
          // Escape and the backdrop close it too; the page has to follow.
          if (expanded) {
            expanded = false;
            repaint();
          } else {
            repaint();
          }
        },
        body: () => [table],
      });
      fullscreen.slot = slot;
    } else {
      if (fullscreen) replaceFullscreen();
      host.appendChild(table);
    }
  }

  FS.views = FS.views || {};
  FS.views.forecast = { render, open };
})(window.FS);
