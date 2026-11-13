/*
 * The create-campaign wizard: Setup -> Reference Data -> Adjustments.
 *
 * Each step writes straight onto a draft campaign held in the store, so
 * stepping back and forward never loses what was entered and the final
 * "Generate Forecast" has everything it needs.
 */
(function (FS) {
  "use strict";

  const U = FS.util;
  const S = FS.store;
  const A = FS.adjustments;
  const { el, icon, toast, select, dateRange, clear } = FS.ui;

  const ORDER = ["setup", "reference", "adjustments"];
  const STEP_META = {
    setup: { label: "Setup", icon: "calendar" },
    reference: { label: "Reference Data", icon: "database" },
    adjustments: { label: "Adjustments", icon: "rise" },
  };

  let step = "setup";
  let draft = null;
  let nameTouched = false;
  let openAccordion = "ads";

  /** Start a fresh draft, or pick up the one already in flight. */
  function begin(existing) {
    step = "setup";
    nameTouched = false;
    openAccordion = "ads";
    draft = existing || S.createCampaign({ name: "" });
    A.ensureEvents(draft);
    S.save();
    return draft;
  }

  function persist() {
    S.updateCampaign(draft.id, draft);
  }

  // ---------------------------------------------------------------- stepper
  function stepper(onBack, onNext) {
    const index = ORDER.indexOf(step);
    const nav = (dir, disabled, title) =>
      el("button.nav-arrow", {
        title,
        disabled: disabled || null,
        onclick: dir === "back" ? onBack : onNext,
      }, [icon(dir === "back" ? "arrowLeft" : "arrowRight", 15)]);

    const chips = [];
    ORDER.forEach((key, i) => {
      const done = i < index;
      const active = i === index;
      chips.push(
        el(`div.step-chip${done ? " done" : active ? " active" : ""}`, {}, [
          icon(done ? "check" : STEP_META[key].icon, 15),
          el("span", { text: STEP_META[key].label }),
        ])
      );
      if (i < ORDER.length - 1) chips.push(el("span.step-sep", {}, [icon("chevronRight", 12)]));
    });

    return el("div.stepper", {}, [
      el("div.row-gap", {}, [
        nav("back", false, index === 0 ? "Back to campaigns" : "Previous step"),
        nav("next", false, "Next step"),
      ]),
      chips,
    ]);
  }

  function heading(iconName, text, sub) {
    return el("div.step-heading", {}, [
      el("div.sh-row", {}, [
        el("span.sh-icon", {}, [icon(iconName, 16, "#007FFF")]),
        el("h3", { text }),
      ]),
      sub ? el("p.sh-sub", { text: sub }) : null,
    ]);
  }

  // ------------------------------------------------------------ step: setup
  function setupStep() {
    const body = el("div.step-body");
    const targetCount = FS.engine.resolveTargets(draft.targetSelection).length;

    // Step 1 — name
    const nameInput = el("input.input.name-field", {
      type: "text",
      value: draft.name,
      placeholder: "Campaign name",
      oninput: (e) => {
        draft.name = e.target.value;
        persist();
        err.style.display = draft.name.trim() || !nameTouched ? "none" : "block";
        nameInput.classList.toggle("error", nameTouched && !draft.name.trim());
      },
    });
    const err = el("span.field-error", {
      text: "A campaign needs a name.",
      style: { display: nameTouched && !draft.name.trim() ? "block" : "none" },
    });

    body.appendChild(
      el("div.step-block", {}, [
        heading("calendar", "Step 1: Enter Campaign Name",
          "On creating the restock plan you can choose this forecast by selecting this name"),
        nameInput,
        err,
      ])
    );
    // Focus only on a fresh draft; stepping back should not steal the caret.
    if (!draft.name) setTimeout(() => nameInput.focus(), 0);

    // Step 2 — forecast period
    const periodOptions = S.FORECAST_PERIODS.map((d) => ({
      value: String(d),
      label: `${d} days`,
    })).concat([{ value: "custom", label: "Custom" }]);

    const fcRange = el("div.inline-row");
    function paintForecast() {
      clear(fcRange);
      fcRange.appendChild(
        select(periodOptions, draft.period, (v) => {
          if (v === "custom") {
            draft.period = "custom";
          } else {
            const from = U.startOfDay(draft.forecastStart);
            draft.period = v;
            draft.forecastStart = U.ymd(from);
            draft.forecastEnd = U.ymd(U.addDays(from, Number(v)));
          }
          persist();
          render(document.getElementById("content"));
        }, { className: "select-lg" })
      );
      fcRange.appendChild(
        dateRange(draft.forecastStart, draft.forecastEnd, (v) => {
          if (!v[0] || !v[1] || isNaN(v[0]) || isNaN(v[1])) return;
          draft.forecastStart = U.ymd(v[0]);
          draft.forecastEnd = U.ymd(v[1]);
          const days = U.diffDays(v[0], v[1]);
          draft.period = S.FORECAST_PERIODS.includes(days) ? String(days) : "custom";
          persist();
          render(document.getElementById("content"));
        })
      );
      fcRange.appendChild(
        el("span.muted", { text: `${U.diffDays(draft.forecastStart, draft.forecastEnd)} days ahead` })
      );
    }
    paintForecast();

    body.appendChild(
      el("div.step-block", {}, [
        heading("calendar", "Step 2: Forecast Period",
          "Select the time horizon for your demand forecast. This determines how far into the future you want to predict sales and inventory needs."),
        fcRange,
      ])
    );

    // Step 3 — look-back, base and the weights modal
    const lbRow = el("div.inline-row");
    const lbOptions = S.LOOKBACK_OPTIONS.concat(
      draft.lookbackPreset === "custom" ? [{ value: "custom", label: "Custom range" }] : []
    );
    lbRow.appendChild(
      select(lbOptions, draft.lookbackPreset, (v) => {
        draft.lookbackPreset = v;
        const [a, b] = S.resolveLookback(v);
        draft.lookbackStart = U.ymd(a);
        draft.lookbackEnd = U.ymd(b);
        // A different window re-buckets the weights, so the old ones are void.
        draft.weighting.weights = null;
        persist();
        render(document.getElementById("content"));
      }, { className: "select-lg" })
    );
    lbRow.appendChild(
      dateRange(draft.lookbackStart, draft.lookbackEnd, (v) => {
        if (!v[0] || !v[1] || isNaN(v[0]) || isNaN(v[1])) return;
        draft.lookbackStart = U.ymd(v[0]);
        draft.lookbackEnd = U.ymd(v[1]);
        draft.lookbackPreset = "custom";
        draft.weighting.weights = null;
        persist();
        render(document.getElementById("content"));
      })
    );
    lbRow.appendChild(el("span.label", { text: "Based on" }));
    lbRow.appendChild(
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
          persist();
          render(document.getElementById("content"));
        }
      )
    );
    lbRow.appendChild(el("span.grow"));
    lbRow.appendChild(
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
              persist();
              toast("Weights applied.", "success");
              render(document.getElementById("content"));
            },
          }),
      })
    );

    body.appendChild(
      el("div.step-block", {}, [
        heading("calendar", "Step 3: Look-back Period",
          "Select which historical time period to analyze. This data will be used to identify patterns and build your forecast model."),
        lbRow,
        el("p.hint", {
          text: `${U.diffDays(draft.lookbackStart, draft.lookbackEnd) + 1} days of history · ${
            draft.weighting.weights ? `${draft.weighting.weights.length} weighted buckets` : "even weights"
          }`,
        }),
      ])
    );

    // Step 4 — target selection
    const modeRow = el("div.radio-row", {}, [
      radio("Select Items Directly", draft.targetSelection.mode !== "po", () => {
        draft.targetSelection = { mode: "direct", filters: draft.targetSelection.filters || {}, search: "", count: 0 };
        persist();
        render(document.getElementById("content"));
      }),
      radio("Select from B2B PO", draft.targetSelection.mode === "po", () => {
        draft.targetSelection = { mode: "po", filters: {}, search: "", count: 0 };
        persist();
        render(document.getElementById("content"));
      }),
    ]);

    body.appendChild(
      el("div.step-block", {}, [
        heading("target", "Step 4: Target Selection",
          "These are the items that are going to get the forecast for the selected period."),
        modeRow,
        el("div.inline-row", {}, [
          el("span.label.blue", { text: "Total Selection" }),
          el("button.chip-btn", {
            onclick: () => openTargetPicker(),
          }, [
            el("span", {
              text: targetCount
                ? `${U.inr(targetCount)} Items Selected`
                : draft.targetSelection.mode === "po"
                  ? "Choose a B2B PO"
                  : "Select Items",
            }),
            icon("edit", 14, "#007FFF"),
          ]),
          el("span.muted", { text: FS.views.campaigns.describeSelection(draft.targetSelection) }),
        ]),
      ])
    );

    return body;
  }

  function radio(label, checked, onPick) {
    return el("label.radio", {}, [
      el("input", { type: "radio", name: "target-mode", checked: checked || null, onchange: onPick }),
      el("span", { text: label }),
    ]);
  }

  function openTargetPicker() {
    if (draft.targetSelection.mode === "po") {
      FS.modals.selectPoModal({
        selected: draft.targetSelection.poKey,
        onSave: (sel) => {
          draft.targetSelection = sel;
          persist();
          render(document.getElementById("content"));
        },
      });
      return;
    }
    FS.modals.targetItemsModal({
      selected: draft.targetSelection,
      lookback: [U.startOfDay(draft.lookbackStart), U.startOfDay(draft.lookbackEnd)],
      onSave: (sel) => {
        draft.targetSelection = sel;
        persist();
        toast(`${U.inr(sel.count)} items selected.`, "success");
        render(document.getElementById("content"));
      },
    });
  }

  // -------------------------------------------------------- step: reference
  function referenceStep() {
    const mapped = Object.keys(draft.referenceMapping || {}).length;
    const targetCount = FS.engine.resolveTargets(draft.targetSelection).length;

    const body = el("div.step-body");
    body.appendChild(
      el("div.step-block", {}, [
        heading("database", "Step 5: Do you want to change the source for reference data?",
          "Reference data is used to build your forecast baseline. By default we use the same items as your target. You can point an item at a different one — a new launch following the product it replaces."),
        el("div.inline-row", {}, [
          el("span.label", {
            text: "Currently we use the Target Items. Do you want to change the Reference Source:",
          }),
          toggle(draft.changeReference, (v) => {
            draft.changeReference = v;
            persist();
            render(document.getElementById("content"));
          }),
        ]),
        draft.changeReference
          ? el("div.inline-row", {}, [
              el("span.label.blue", { text: "Total Selection For The Reference" }),
              el("button.chip-btn", {
                onclick: () =>
                  FS.modals.referenceMappingModal({
                    lookback: [U.startOfDay(draft.lookbackStart), U.startOfDay(draft.lookbackEnd)],
                    targetSelection: draft.targetSelection,
                    mapping: draft.referenceMapping,
                    onSave: (m) => {
                      draft.referenceMapping = m;
                      persist();
                      toast(`${Object.keys(m).length} mapping(s) saved.`, "success");
                      render(document.getElementById("content"));
                    },
                  }),
              }, [
                el("span", {
                  text: mapped
                    ? `${U.inr(mapped)} Items Mapped`
                    : targetCount
                      ? `${U.inr(targetCount)} Items Selected`
                      : "Select Reference Source",
                }),
                icon("edit", 14, "#007FFF"),
              ]),
            ])
          : el("p.hint", {
              text: "Every targeted item will be forecast from its own sales history.",
            }),
      ])
    );
    return body;
  }

  function toggle(on, onChange) {
    const node = el(`button.toggle${on ? " on" : ""}`, {
      type: "button",
      onclick: () => onChange(!on),
    }, [el("span.knob")]);
    return node;
  }

  // ------------------------------------------------------ step: adjustments
  function adjustmentsStep() {
    const adj = draft.adjustments;
    A.ensureEvents(draft);
    const body = el("div.step-body");

    body.appendChild(
      el("div.step-block", {}, [
        heading("rise", "Configure Adjustments",
          "Fine-tune your forecast by adding adjustments for ad spend, events, pricing changes, and custom factors like seasonality or market trends."),
      ])
    );

    const onChange = () => {
      persist();
    };
    const rerender = () => {
      persist();
      render(document.getElementById("content"));
    };

    function accordion(key, iconName, title, sub, inner) {
      const open = openAccordion === key;
      return el("div.accordion", {}, [
        el("button.acc-head", {
          onclick: () => {
            openAccordion = open ? null : key;
            rerender();
          },
        }, [
          el("span.acc-icon", {}, [icon(iconName, 16, "#007FFF")]),
          el("span.acc-title", { text: title }),
          el("span.grow"),
          icon(open ? "chevronUp" : "chevronDown", 13),
        ]),
        open ? el("div.acc-body", {}, [el("p.hint", { text: sub }), inner()]) : null,
      ]);
    }

    function rowGroup(group, renderRow, emptyText) {
      const list = el("div.adj-list");
      (adj[group] || []).forEach((row) => {
        list.appendChild(
          renderRow(row, {
            onChange,
            onRemove: () => {
              adj[group] = adj[group].filter((r) => r.id !== row.id);
              rerender();
            },
            onScope: () =>
              FS.modals.adjustmentScopeModal({
                title: `${title(group)} scope`,
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
      if (!(adj[group] || []).length) list.appendChild(el("p.hint", { text: emptyText }));
      list.appendChild(
        el("button.add-row-btn", {
          text: "+ Add another",
          onclick: () => {
            adj[group] = (adj[group] || []).concat([A.newRow(group)]);
            rerender();
          },
        })
      );
      return list;
    }

    function title(group) {
      return { ads: "Ads adjustment", price: "Pricing adjustment", custom: "Custom adjustment" }[group];
    }

    body.appendChild(
      accordion("ads", "money", "Ads Adjustments",
        "Enter your planned advertising budget and the expected increase in sales. This is factored into the demand forecast.",
        () => rowGroup("ads", A.adsRow, "No ad spend adjustments."))
    );

    body.appendChild(
      accordion("events", "bolt", "Events & Seasonality",
        "Tick an event to apply it. Past events are divided out of the look-back baseline; future events lift the forecast on the days they run.",
        () => eventsPanel(adj, onChange, rerender))
    );

    body.appendChild(
      accordion("pricing", "tag", "Pricing",
        "Add pricing adjustments like discounts, price increases, or promotional offers that will impact demand.",
        () => rowGroup("price", A.priceRow, "No pricing adjustments."))
    );

    body.appendChild(
      accordion("custom", "edit", "Custom",
        "Add custom adjustments for seasonality, post-sale slumps, supply constraints, or other market factors.",
        () => rowGroup("custom", A.customRow, "No custom adjustments."))
    );

    return body;
  }

  /** Past and future events, side by side, the way the board lays them out. */
  function eventsPanel(adj, onChange, rerender) {
    const past = (adj.events || []).filter((e) => e.isPast);
    const future = (adj.events || []).filter((e) => !e.isPast);
    const col = (label, list) =>
      el("div.evt-col", {}, [
        el("h4", {
          text: `${label} (${list.filter((e) => e.selected).length}/${list.length}): Impact`,
        }),
        list.length
          ? list.map((e) => A.eventRow(e, () => { onChange(); updateHeads(); }))
          : el("p.hint", { text: `No ${label.toLowerCase()}.` }),
      ]);

    const wrap = el("div.evt-grid", {}, [col("Past Events", past), col("Future Events", future)]);

    function updateHeads() {
      const heads = wrap.querySelectorAll("h4");
      if (heads[0]) heads[0].textContent = `Past Events (${past.filter((e) => e.selected).length}/${past.length}): Impact`;
      if (heads[1]) heads[1].textContent = `Future Events (${future.filter((e) => e.selected).length}/${future.length}): Impact`;
      wrap.querySelectorAll(".evt-row").forEach((n, i) => {
        const all = past.concat(future);
        n.classList.toggle("on", !!(all[i] && all[i].selected));
      });
    }

    return wrap;
  }

  // ---------------------------------------------------------------- actions
  function goBack() {
    const i = ORDER.indexOf(step);
    if (i > 0) {
      step = ORDER[i - 1];
      render(document.getElementById("content"));
      return;
    }
    window.location.hash = "#/demand-forecasting";
  }

  function goNext() {
    if (step === "setup") {
      if (!draft.name.trim()) {
        nameTouched = true;
        toast("Give the campaign a name — Restock selects it by name.", "error");
        render(document.getElementById("content"));
        return;
      }
      if (!FS.engine.resolveTargets(draft.targetSelection).length) {
        toast("No items match the target selection.", "error");
        return;
      }
    }
    const i = ORDER.indexOf(step);
    if (i < ORDER.length - 1) {
      step = ORDER[i + 1];
      persist();
      render(document.getElementById("content"));
      return;
    }
    // Last step runs the forecast rather than handing over a Generate button.
    persist();
    window.location.hash = `#/demand-forecasting?campaign=${draft.id}&running=1`;
  }

  // ----------------------------------------------------------------- render
  function render(host) {
    if (!host) return;
    clear(host);
    if (!draft) begin();

    const card = el("div.card.wizard");
    card.appendChild(stepper(goBack, goNext));

    const stage = el("div.wizard-stage");
    if (step === "setup") stage.appendChild(setupStep());
    if (step === "reference") stage.appendChild(referenceStep());
    if (step === "adjustments") stage.appendChild(adjustmentsStep());
    card.appendChild(stage);

    const isLast = ORDER.indexOf(step) === ORDER.length - 1;
    card.appendChild(
      el("div.wizard-foot", {}, [
        el("button.link-btn.grey", {
          text: "Cancel",
          onclick: () => {
            // An unnamed draft was never a campaign; drop it rather than
            // leaving a nameless row behind.
            if (!draft.name.trim()) FS.store.deleteCampaign(draft.id);
            draft = null;
            window.location.hash = "#/demand-forecasting";
          },
        }),
        el("div.row-gap", {}, [
          step === "setup"
            ? el("button.link-btn", {
                text: "Back To The Campaigns Table",
                onclick: () => { window.location.hash = "#/demand-forecasting"; },
              })
            : null,
          ORDER.indexOf(step) > 0 ? el("button.btn", { text: "Back", onclick: goBack }) : null,
          el("button.btn.btn-primary", {
            onclick: goNext,
          }, isLast ? [el("span", { text: "Generate Forecast" })] : [el("span", { text: "Next" }), icon("arrowRight", 15)]),
        ]),
      ])
    );

    host.appendChild(card);
  }

  FS.views = FS.views || {};
  FS.views.wizard = { render, begin, get draft() { return draft; } };
})(window.FS);
