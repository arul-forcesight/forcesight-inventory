/*
 * Helix AI — the right-hand assistant panel.
 *
 * It is not a scripted demo reel: every figure it quotes is read off the
 * campaign that is open, and the strategies it offers are three real engine
 * runs at different risk stances. Applying one forks a scenario, the same way
 * the Constrains modal does.
 *
 * Opening the panel collapses the left nav to icons so the three columns —
 * nav, work, assistant — fit without the page scrolling sideways.
 */
(function (FS) {
  "use strict";

  const U = FS.util;
  const S = FS.store;
  const { el, icon, clear, toast } = FS.ui;

  const OPEN_KEY = "fs_helix_open";
  const MODE_KEY = "fs_helix_mode";

  let open = localStorage.getItem(OPEN_KEY) === "1";
  let mode = localStorage.getItem(MODE_KEY) || "copilot"; // copilot | manual
  let tab = "chat"; // chat | assumptions | actions
  // The transcript, keyed per campaign so switching campaigns keeps its thread.
  const threads = new Map();
  // Things the user actually did through the panel.
  const actionLog = [];
  let draftText = "";

  // -------------------------------------------------------------- strategies
  /*
   * Three stances on the same campaign.
   *
   * Conservative believes less of the forecast and holds no extra cover;
   * aggressive believes more and holds three weeks of it. Balanced sits
   * between the two, which is why it is the one recommended.
   */
  const STRATEGIES = [
    { key: "conservative", label: "Conservative", demandMultiplier: 0.9, safetyDays: 0 },
    { key: "balanced", label: "Balanced", demandMultiplier: 1, safetyDays: 7, recommended: true },
    { key: "aggressive", label: "Aggressive", demandMultiplier: 1.15, safetyDays: 21 },
  ];

  /** Run one stance against a campaign without disturbing what is saved. */
  function runStance(campaign, stance) {
    return FS.engine.runForecast({
      forecastStart: campaign.forecastStart,
      forecastEnd: campaign.forecastEnd,
      lookbackStart: campaign.lookbackStart,
      lookbackEnd: campaign.lookbackEnd,
      targetSelection: campaign.targetSelection,
      referenceMapping: campaign.changeReference ? campaign.referenceMapping : {},
      weighting: campaign.weighting,
      adjustments: campaign.adjustments,
      constraints: Object.assign({}, campaign.constraints, {
        demandMultiplier: stance.demandMultiplier,
        safetyDays: stance.safetyDays,
      }),
      groupBy: campaign.groupBy,
    });
  }

  /** The four figures each strategy card reports, against the current plan. */
  function strategyMetrics(campaign) {
    const base = campaign.result;
    return STRATEGIES.map((st) => {
      const res = runStance(campaign, st);
      const t = res.totals || {};
      const b = (base && base.totals) || {};
      return {
        key: st.key,
        label: st.label,
        recommended: st.recommended,
        stance: st,
        result: res,
        metrics: [
          { label: "Inventory ₹", value: U.compactMoney(t.restockValue || 0) },
          {
            label: "Cash Impact",
            value:
              (b.restockValue ? (t.restockValue - b.restockValue >= 0 ? "+" : "-") : "") +
              U.compactMoney(Math.abs((t.restockValue || 0) - (b.restockValue || 0))),
          },
          {
            label: "DIO Change",
            value: `${(t.dio || 0) - (b.dio || 0) >= 0 ? "+" : ""}${(t.dio || 0) - (b.dio || 0)} days`,
          },
          { label: "Revenue Protected", value: U.compactMoney(t.value || 0) },
        ],
        /*
         * The trailing clause states the stance itself rather than a risk
         * count. Post-buy risk is zero by construction — the restock is sized
         * to cover the horizon — so quoting it told the reader nothing about
         * what separates these three.
         */
        summary: `${U.compactMoney(t.restockValue || 0)} inventory → ${
          (t.dio || 0) - (b.dio || 0) >= 0 ? "+" : ""
        }${(t.dio || 0) - (b.dio || 0)} days DIO → ${U.compactMoney(
          t.value || 0
        )} revenue coverage · plans at ${Math.round(st.demandMultiplier * 100)}% of forecast${
          st.safetyDays
            ? `, holding ${st.safetyDays} days of cover beyond lead time`
            : ", with no buffer beyond lead time"
        }`,
      };
    });
  }

  // ------------------------------------------------------------- what-ifs
  /*
   * Each what-if is a real second run with one input changed, reported as the
   * delta against the plan on screen.
   */
  const WHAT_IFS = [
    {
      key: "ads",
      label: "What if we add 20% more ad spend?",
      run: (c) => {
        const copy = JSON.parse(JSON.stringify(c));
        copy.adjustments.ads = (copy.adjustments.ads || []).concat([
          { id: "whatif", spend: 500000, direction: "increase", impact: 20, scope: null },
        ]);
        return { label: "a 20% ad-driven lift", result: runPlain(copy) };
      },
    },
    {
      key: "price",
      label: "What if we cut price by 5%?",
      run: (c) => {
        const copy = JSON.parse(JSON.stringify(c));
        copy.adjustments.price = (copy.adjustments.price || []).concat([
          { id: "whatif", direction: "decrease", change: 5, impactDirection: "increase", impact: 9, scope: null },
        ]);
        return { label: "a 5% price cut (≈9% volume lift)", result: runPlain(copy) };
      },
    },
    {
      key: "events",
      label: "What if we skip every event uplift?",
      run: (c) => {
        const copy = JSON.parse(JSON.stringify(c));
        (copy.adjustments.events || []).forEach((e) => {
          e.selected = false;
        });
        return { label: "no event adjustments at all", result: runPlain(copy) };
      },
    },
    {
      key: "lookback",
      label: "What if we forecast off the last 60 days instead?",
      run: (c) => {
        const copy = JSON.parse(JSON.stringify(c));
        const [a, b] = S.resolveLookback("last60");
        copy.lookbackStart = U.ymd(a);
        copy.lookbackEnd = U.ymd(b);
        copy.weighting.weights = null;
        return { label: "a 60-day look-back", result: runPlain(copy) };
      },
    },
    {
      key: "ai",
      label: "What if the model picks the weights?",
      run: (c) => {
        const copy = JSON.parse(JSON.stringify(c));
        copy.weighting.base = "USING_AI";
        copy.weighting.weights = null;
        return { label: "model-chosen weights", result: runPlain(copy) };
      },
    },
  ];

  function runPlain(c) {
    return FS.engine.runForecast({
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
  }

  // ----------------------------------------------------------------- thread
  function threadFor(campaignId) {
    const key = campaignId || "list";
    if (!threads.has(key)) threads.set(key, [greeting(campaignId)]);
    return threads.get(key);
  }

  function stamp() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function greeting(campaignId) {
    const c = campaignId ? S.getCampaign(campaignId) : null;
    if (!c) {
      return {
        from: "ai",
        at: stamp(),
        text: "Hello! I'm your ForceSight AI assistant. How can I help you with demand forecasting today?",
        chips: ["Summarise my campaigns", "Which plan needs attention?"],
      };
    }
    return insightFor(c);
  }

  /** The opening read on a campaign — the "Helix AI Insight" line. */
  function insightFor(c) {
    const t = c.result && c.result.totals;
    if (!t) {
      return {
        from: "ai",
        at: stamp(),
        lead: `${c.name}:`,
        text: "this campaign has not been run yet. Press Generate and I'll read the result for you.",
        chips: ["Run it now"],
      };
    }
    return {
      from: "ai",
      at: stamp(),
      lead: `${c.name}:`,
      text: `across ${U.inr(t.count)} SKUs this plan forecasts ${U.compactMoney(
        t.value
      )} of revenue over ${t.horizon} days, needs ${U.inr(t.restockUnits)} units at ${U.compactMoney(
        t.restockValue
      )}, and leaves ${t.atRisk} SKUs short of their lead time.`,
      chips: ["Try Strategy", "Add Adjustments", "Ask What If ?"],
    };
  }

  function push(campaignId, msg) {
    threadFor(campaignId).push(msg);
  }

  // ---------------------------------------------------------------- intents
  /*
   * A typed question is matched on keywords rather than parsed. The point is
   * that the answer is computed from the open campaign, not that the matching
   * is clever.
   */
  function answer(text, campaign) {
    const q = text.toLowerCase();
    const t = campaign && campaign.result && campaign.result.totals;

    if (!campaign) {
      const all = S.listCampaigns();
      const ran = all.filter((c) => c.result);
      if (/attention|risk|worst|problem/.test(q)) {
        const worst = ran.slice().sort((a, b) => b.result.totals.riskPct - a.result.totals.riskPct)[0];
        if (!worst) return { text: "None of your campaigns have been run yet, so there is nothing to compare." };
        return {
          text: `${worst.name} carries the most exposure — ${worst.result.totals.atRisk} of ${U.inr(
            worst.result.totals.count
          )} SKUs (${U.pct(worst.result.totals.riskPct)}) run out inside their lead time.`,
        };
      }
      return {
        text: `You have ${all.length} campaigns, ${ran.length} of them run. Together they forecast ${U.compactMoney(
          ran.reduce((n, c) => n + c.result.totals.value, 0)
        )} of revenue and ${U.compactMoney(
          ran.reduce((n, c) => n + c.result.totals.restockValue, 0)
        )} of inventory to buy. Open one and I can go deeper.`,
      };
    }

    if (!t) {
      return { text: `${campaign.name} has not been run yet. Press Generate and ask me again.`, chips: ["Run it now"] };
    }

    if (/strateg|option|compare|scenario/.test(q)) {
      return { strategies: true, text: "Here are three stances on the same plan. Balanced is the one I'd take." };
    }
    if (/what if|whatif/.test(q)) {
      return { whatifs: true, text: "Pick one and I'll run it against the current plan." };
    }
    if (/cash|capital|budget|money|spend/.test(q)) {
      return {
        text: `This plan locks ${U.compactMoney(t.restockValue)} of cash buying ${U.inr(
          t.restockUnits
        )} units, against a budget of ₹${campaign.constraints.capital}Cr.${
          t.capitalScale < 1
            ? ` The budget binds — quantities are already scaled to ${U.pct(t.capitalScale * 100, 0)} of what demand asks for.`
            : " You are inside the budget with room to spare."
        }`,
      };
    }
    if (/dio|turn|days of inventory/.test(q)) {
      return {
        text: `Projected DIO is ${t.dio} days against your ${campaign.constraints.dio}-day target — ${
          t.dio > campaign.constraints.dio
            ? `${t.dio - campaign.constraints.dio} days over. Trimming safety cover is the quickest way down.`
            : "inside target."
        }`,
      };
    }
    if (/risk|stockout|short|out of stock/.test(q)) {
      const worst = campaign.result.rows
        .slice()
        .sort((a, b) => a.coverDays - b.coverDays)
        .slice(0, 3);
      return {
        text: `${t.atRisk} of ${U.inr(t.count)} SKUs (${U.pct(
          t.riskPct
        )}) run out inside their lead time. The tightest are ${worst
          .map((r) => `${r.sku} (${r.coverDays}d)`)
          .join(", ")}.`,
        chips: ["Try Strategy"],
      };
    }
    if (/top|best|biggest|highest/.test(q)) {
      const top = campaign.result.rows.slice().sort((a, b) => b.value - a.value).slice(0, 5);
      return {
        text: `Top five by forecast value: ${top
          .map((r) => `${r.sku} ${U.compactMoney(r.value)}`)
          .join(", ")}.`,
      };
    }
    if (/event|diwali|festive|sale/.test(q)) {
      const picked = (campaign.adjustments.events || []).filter((e) => e.selected);
      return {
        text: picked.length
          ? `${picked.length} event(s) are applied: ${picked
              .map((e) => `${e.name} (${e.direction === "decrease" ? "−" : "+"}${e.impact}%)`)
              .join(", ")}. Past ones are divided out of the baseline; future ones lift the forecast on the days they run.`
          : "No events are ticked on this plan. Open Adjustments → Events & Seasonality to apply one.",
        chips: ["Add Adjustments"],
      };
    }
    if (/assumption|how|method|model|comput|work/.test(q)) {
      return { assumptions: true, text: "Here is what this forecast assumed." };
    }
    if (/summar|overview|how is|status/.test(q)) {
      return insightFor(campaign);
    }

    return {
      text: `I can read this plan for cash, DIO, stockout risk, top SKUs, events and assumptions — or run a what-if against it. ${U.inr(
        t.count
      )} SKUs, ${U.compactMoney(t.value)} forecast revenue, ${U.compactMoney(t.restockValue)} to buy.`,
      chips: ["Try Strategy", "Ask What If ?"],
    };
  }

  // ----------------------------------------------------------------- render
  /** Which campaign the panel is talking about, if any. */
  function currentCampaign() {
    const m = /campaign=(\d+)/.exec(window.location.hash);
    if (!m) return null;
    const scenario = /scenario=(\d+)/.exec(window.location.hash);
    return S.getCampaign(Number(scenario ? scenario[1] : m[1])) || S.getCampaign(Number(m[1]));
  }

  function avatar() {
    return el("span.hx-avatar", {}, [icon("spark", 13, "#fff")]);
  }

  function chip(label, onClick, withCaret) {
    return el("button.hx-chip", { onclick: onClick }, [
      label === "Ask What If ?" ? icon("spark", 12, "#007FFF") : null,
      el("span", { text: label }),
      withCaret ? icon("chevronDown", 11) : null,
    ]);
  }

  function messageNode(msg, campaign) {
    if (msg.from === "user") {
      return el("div.hx-msg.hx-user", {}, [
        el("div.hx-bubble.hx-bubble-user", { text: msg.text }),
        el("span.hx-time", { text: msg.at }),
      ]);
    }

    const body = el("div.hx-msg-body");

    if (msg.lead || msg.text) {
      body.appendChild(
        el("p.hx-text", {}, [
          msg.lead ? el("strong", { text: msg.lead + " " }) : null,
          msg.text || "",
        ])
      );
    }

    if (msg.chips && msg.chips.length) {
      body.appendChild(
        el("div.hx-chips", {}, msg.chips.map((label) =>
          label === "Ask What If ?"
            ? chip(label, () => openWhatIfs(campaign), true)
            : chip(label, () => runChip(label, campaign))
        ))
      );
    }

    if (msg.strategies) body.appendChild(strategyCards(campaign));
    if (msg.whatifs) body.appendChild(whatIfList(campaign));
    if (msg.assumptions) body.appendChild(assumptionsCard(campaign));
    if (msg.note) body.appendChild(el("div.hx-note", { text: msg.note }));

    body.appendChild(el("span.hx-time", { text: msg.at }));

    return el("div.hx-msg", {}, [avatar(), body]);
  }

  /** A chip is a shortcut for a thing the user could type. */
  function runChip(label, campaign) {
    const id = campaign ? campaign.id : null;
    push(id, { from: "user", at: stamp(), text: label });

    if (label === "Try Strategy") {
      push(id, {
        from: "ai",
        at: stamp(),
        text: "Three stances on the same plan, each a full re-run. Balanced is the one I'd take.",
        strategies: true,
      });
    } else if (label === "Add Adjustments") {
      push(id, {
        from: "ai",
        at: stamp(),
        text: "Opening the adjustment editor for this scenario — ads, events, pricing and custom levers.",
      });
      paint();
      setTimeout(() => {
        const btn = document.querySelector(".summary-card .btn-sm");
        if (btn) btn.click();
        else toast("Open a campaign first.", "info");
      }, 320);
      logAction("Opened the adjustment editor");
      return;
    } else if (label === "Run it now") {
      paint();
      setTimeout(() => {
        const btn = document.querySelector(".summary-actions .btn-primary");
        if (btn) btn.click();
        else toast("Open a campaign first.", "info");
      }, 200);
      logAction("Started a forecast run");
      return;
    } else {
      const a = answer(label, campaign);
      push(id, Object.assign({ from: "ai", at: stamp() }, a));
    }
    paint();
  }

  function openWhatIfs(campaign) {
    const id = campaign ? campaign.id : null;
    push(id, { from: "user", at: stamp(), text: "Ask What If ?" });
    push(id, {
      from: "ai",
      at: stamp(),
      text: "Pick one and I'll run it against the plan on screen.",
      whatifs: true,
    });
    paint();
  }

  function strategyCards(campaign) {
    if (!campaign || !campaign.result) {
      return el("p.hx-text", { text: "Run the forecast first and I'll build the strategies from it." });
    }
    const list = strategyMetrics(campaign);
    return el("div.hx-cards", {}, list.map((s) =>
      el(`div.hx-card${s.recommended ? " recommended" : ""}`, {}, [
        el("div.hx-card-head", {}, [
          el("span.hx-card-title", { text: s.label + ":" }),
          s.recommended ? el("span.hx-badge", { text: "Recommended" }) : null,
          el("span.grow"),
          el("button.hx-card-apply", {
            text: "Apply",
            title: "Fork this campaign into a new scenario at this stance",
            onclick: () => applyStrategy(campaign, s),
          }),
        ]),
        el("div.hx-card-grid", {}, s.metrics.map((m) =>
          el("div.hx-metric", {}, [
            el("span.hx-metric-label", { text: m.label }),
            el("span.hx-metric-value", { text: m.value }),
          ])
        )),
        el("p.hx-card-sum", { text: s.summary }),
      ])
    ));
  }

  /** Forking at a stance writes it onto a new scenario and runs it. */
  function applyStrategy(campaign, strategy) {
    const baseId = Number((/campaign=(\d+)/.exec(window.location.hash) || [])[1]) || campaign.id;
    const copy = S.duplicateScenario(campaign.id, baseId);
    if (!copy) {
      toast("Could not create the scenario.", "error");
      return;
    }
    copy.name = `${String(campaign.name).replace(/_\d+$/, "")} · ${strategy.label}`;
    copy.constraints = Object.assign({}, copy.constraints, {
      demandMultiplier: strategy.stance.demandMultiplier,
      safetyDays: strategy.stance.safetyDays,
    });
    S.save();
    S.runCampaign(copy.id);

    push(campaign.id, {
      from: "ai",
      at: stamp(),
      lead: `${strategy.label} applied.`,
      text: `I forked "${copy.name}" and ran it: ${U.inr(
        copy.result.totals.restockUnits
      )} units at ${U.compactMoney(copy.result.totals.restockValue)}, DIO ${
        copy.result.totals.dio
      } days, ${copy.result.totals.atRisk} SKUs still short.`,
    });
    logAction(`Applied the ${strategy.label} strategy as "${copy.name}"`);

    // Move the page onto the new tab so the numbers on screen match the answer.
    window.location.hash = `#/demand-forecasting?campaign=${baseId}&scenario=${copy.id}`;
    toast(`${strategy.label} scenario created.`, "success");
  }

  function whatIfList(campaign) {
    if (!campaign || !campaign.result) {
      return el("p.hx-text", { text: "Run the forecast first and I'll have something to compare against." });
    }
    return el("div.hx-whatifs", {}, WHAT_IFS.map((w) =>
      el("button.hx-whatif", {
        onclick: () => {
          const { label, result } = w.run(campaign);
          const b = campaign.result.totals;
          const t = result.totals;
          const dq = t.qty - b.qty;
          const dv = t.value - b.value;
          const dc = t.restockValue - b.restockValue;
          push(campaign.id, { from: "user", at: stamp(), text: w.label });
          push(campaign.id, {
            from: "ai",
            at: stamp(),
            lead: "Ran it.",
            text: `With ${label}, forecast quantity moves ${dq >= 0 ? "+" : ""}${U.inr(
              dq
            )} units (${dq >= 0 ? "+" : ""}${U.pct((dq / b.qty) * 100)}), revenue ${
              dv >= 0 ? "+" : "−"
            }${U.compactMoney(Math.abs(dv))}, and the buy ${
              dc >= 0 ? "rises" : "falls"
            } by ${U.compactMoney(Math.abs(dc))}. Stockout risk goes ${U.pct(b.riskPct)} → ${U.pct(
              t.riskPct
            )}.`,
            note: "Nothing was saved — this was a comparison run only.",
          });
          logAction(`Ran what-if: ${w.label}`);
          paint();
        },
      }, [icon("spark", 12, "#007FFF"), el("span", { text: w.label })])
    ));
  }

  function assumptionsCard(campaign) {
    if (!campaign) return el("p.hx-text", { text: "Open a campaign to see its assumptions." });
    const rows = assumptionRows(campaign);
    return el("div.hx-assume", {}, rows.map((r) =>
      el("div.hx-assume-row", {}, [
        el("span.hx-assume-key", { text: r.k }),
        el("span.hx-assume-val", { text: r.v }),
      ])
    ));
  }

  /** Every input the engine was handed, in the order it used them. */
  function assumptionRows(c) {
    const base = { AVG: "Average", MIN: "Minimum", MAX: "Maximum", USING_AI: "Model-chosen" }[
      c.weighting.base
    ];
    const picked = (c.adjustments.events || []).filter((e) => e.selected);
    const count = FS.engine.resolveTargets(c.targetSelection).length;
    return [
      { k: "Target set", v: `${U.inr(count)} SKUs — ${FS.views.campaigns.describeSelection(c.targetSelection)}` },
      { k: "Forecast window", v: `${U.fmtRange(c.forecastStart, c.forecastEnd)} (${U.diffDays(c.forecastStart, c.forecastEnd)} days)` },
      { k: "Look-back", v: `${U.fmtRange(c.lookbackStart, c.lookbackEnd)} (${U.diffDays(c.lookbackStart, c.lookbackEnd) + 1} days)` },
      { k: "Base statistic", v: base },
      { k: "Weighting", v: c.weighting.weights ? `${c.weighting.weights.length} hand-set buckets` : "Even across buckets" },
      { k: "Reference source", v: Object.keys(c.referenceMapping || {}).length && c.changeReference ? `${Object.keys(c.referenceMapping).length} SKUs mapped to another item` : "Each SKU uses its own history" },
      { k: "Ad adjustments", v: (c.adjustments.ads || []).length ? `${c.adjustments.ads.length} row(s)` : "None" },
      { k: "Pricing adjustments", v: (c.adjustments.price || []).length ? `${c.adjustments.price.length} row(s)` : "None" },
      { k: "Custom adjustments", v: (c.adjustments.custom || []).length ? `${c.adjustments.custom.length} row(s)` : "None" },
      { k: "Events applied", v: picked.length ? picked.map((e) => e.name).join(", ") : "None" },
      { k: "Capital budget", v: `₹${c.constraints.capital}Cr` },
      { k: "Target DIO", v: `${c.constraints.dio} days` },
      { k: "Lead time", v: `${c.constraints.leadTime} days (cover is judged against this)` },
      { k: "Trend handling", v: "Measured across the look-back halves, damped to half the observed swing and capped at ±45%" },
      { k: "Weekday shape", v: "Demand redistributed across the week, normalised so the total is unchanged" },
    ];
  }

  function logAction(text) {
    actionLog.unshift({ at: stamp(), text });
  }

  // ------------------------------------------------------------------ panel
  function panel() {
    const campaign = currentCampaign();
    const id = campaign ? campaign.id : null;
    const host = el("aside.helix", { class: open ? "open" : "" });

    // ---- header
    host.appendChild(
      el("div.hx-head", {}, [
        el("h3.hx-title", { text: "Helix AI" }),
        el("div.hx-seg", {}, ["copilot", "manual"].map((m) =>
          el(`button.hx-seg-btn${mode === m ? " on" : ""}`, {
            text: m === "copilot" ? "Co-Pilot" : "Manual",
            onclick: () => {
              mode = m;
              localStorage.setItem(MODE_KEY, m);
              paint();
            },
          })
        )),
        el("button.icon-btn.hx-close", { title: "Close Helix AI", onclick: () => setOpen(false) }, [
          icon("close", 16),
        ]),
      ])
    );

    // ---- tabs
    const TABS = [
      { key: "chat", label: "AI Chat" },
      { key: "assumptions", label: "Assumptions" },
      { key: "actions", label: "Your Actions" },
    ];
    host.appendChild(
      el("div.hx-tabs", {}, TABS.map((t) =>
        el(`button.hx-tab${tab === t.key ? " active" : ""}`, {
          text: t.label,
          onclick: () => {
            tab = t.key;
            paint();
          },
        })
      ))
    );

    const body = el("div.hx-body");
    host.appendChild(body);

    if (tab === "chat") {
      if (mode === "manual") {
        body.appendChild(
          el("div.hx-manual", {}, [
            el("p.hx-text", {
              text: "Manual mode: Helix stays quiet and will not suggest or apply anything. Switch to Co-Pilot for strategies and what-ifs.",
            }),
            campaign ? assumptionsCard(campaign) : null,
          ])
        );
      } else {
        threadFor(id).forEach((m) => body.appendChild(messageNode(m, campaign)));
      }
      // Pinned composer — the panel always has somewhere to type.
      host.appendChild(composer(campaign));
    }

    if (tab === "assumptions") {
      body.appendChild(
        el("div.hx-pad", {}, [
          el("p.hx-text", {
            text: campaign
              ? "Every input this forecast was handed, in the order the engine used them."
              : "Open a campaign to see its assumptions.",
          }),
          assumptionsCard(campaign),
        ])
      );
    }

    if (tab === "actions") {
      body.appendChild(
        el("div.hx-pad", {}, [
          el("p.hx-text", { text: "What you have done through this panel." }),
          actionLog.length
            ? el("div.hx-actions", {}, actionLog.map((a) =>
                el("div.hx-action", {}, [
                  el("span.hx-action-dot"),
                  el("div", {}, [
                    el("span.hx-action-text", { text: a.text }),
                    el("span.hx-time", { text: a.at }),
                  ]),
                ])
              ))
            : el("p.hx-empty", { text: "Nothing yet — apply a strategy or run a what-if." }),
        ])
      );
    }

    return host;
  }

  function composer(campaign) {
    const input = el("input.hx-input", {
      type: "text",
      value: draftText,
      placeholder: mode === "manual" ? "Co-Pilot is off" : "Ask about this plan…",
      disabled: mode === "manual" || null,
      oninput: (e) => {
        draftText = e.target.value;
      },
      onkeydown: (e) => {
        if (e.key === "Enter") send();
      },
    });

    function send() {
      const text = draftText.trim();
      if (!text) return;
      const id = campaign ? campaign.id : null;
      push(id, { from: "user", at: stamp(), text });
      const a = answer(text, campaign);
      push(id, Object.assign({ from: "ai", at: stamp() }, a));
      draftText = "";
      paint();
    }

    return el("div.hx-composer", {}, [
      el("div.hx-input-wrap", {}, [
        input,
        el("button.hx-send", {
          title: "Send",
          disabled: mode === "manual" || null,
          onclick: send,
        }, [icon("arrowRight", 16, "#fff")]),
      ]),
      el("span.hx-hint", {
        text:
          mode === "manual"
            ? "Switch to Co-Pilot to ask questions."
            : "Try: cash, DIO, risk, top SKUs, events, assumptions.",
      }),
    ]);
  }

  // ------------------------------------------------------------------- API
  function setOpen(next) {
    open = next;
    localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    // Opening the assistant squeezes the page, so the nav gives up its labels.
    FS.shell.setNavCollapsed(next, true);
    FS.shell.mountShell();
    if (next) {
      // Keep the thread current with whatever campaign is on screen.
      const c = currentCampaign();
      const t = threadFor(c ? c.id : null);
      if (t.length === 1) t[0] = greeting(c ? c.id : null);
      paint();
    }
  }

  function toggle() {
    setOpen(!open);
  }

  function isOpen() {
    return open;
  }

  /** Repaint just the panel, keeping the page under it untouched. */
  function paint() {
    const existing = document.querySelector(".helix");
    if (!existing) return;
    const scroller = existing.querySelector(".hx-body");
    const atBottom = scroller
      ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 60
      : true;
    // Was the composer focused before the repaint? If so it stays focused
    // after it, so a follow-up question can just be typed.
    const wasTyping =
      document.activeElement && document.activeElement.classList.contains("hx-input");

    const next = panel();
    existing.replaceWith(next);

    const body = next.querySelector(".hx-body");
    if (body && atBottom) body.scrollTop = body.scrollHeight;
    const input = next.querySelector(".hx-input");
    if (input && !input.disabled && tab === "chat" && (wasTyping || draftText)) {
      input.focus();
      input.setSelectionRange(draftText.length, draftText.length);
    }
  }

  /** Re-read the thread when the page moves to a different campaign. */
  function onRouteChange() {
    if (!open) return;
    const c = currentCampaign();
    const t = threadFor(c ? c.id : null);
    if (t.length === 1) t[0] = greeting(c ? c.id : null);
    paint();
  }

  /** Re-apply the open panel's side effects after a reload. */
  function restore() {
    if (open) FS.shell.setNavCollapsed(true, true);
  }

  FS.helix = { panel, setOpen, toggle, isOpen, paint, onRouteChange, logAction, restore };
})(window.FS);
