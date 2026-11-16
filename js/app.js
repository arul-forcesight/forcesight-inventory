/*
 * Router and bootstrap.
 *
 * Which of the three views is open lives in the URL hash, not in a variable,
 * so a refresh lands exactly where it left off and any screen can be linked
 * to — the same reason the real module moved its view state into the query
 * string.
 */
(function (FS) {
  "use strict";

  /** "#/demand-forecasting?campaign=3&running=1" -> { path, params } */
  function parseHash() {
    const raw = window.location.hash.replace(/^#/, "") || "/demand-forecasting";
    const [path, query] = raw.split("?");
    const params = {};
    (query || "").split("&").filter(Boolean).forEach((pair) => {
      const [k, v] = pair.split("=");
      params[decodeURIComponent(k)] = decodeURIComponent(v || "");
    });
    return { path: path || "/demand-forecasting", params };
  }

  let last = "";
  // The current query, so a view can read it without re-parsing the hash.
  let current = {};

  function route() {
    const { path, params } = parseHash();
    const key = window.location.hash;
    current = params;

    if (path === "/restock") {
      if (last !== key) FS.views.restock.open(params);
      last = key;
      const plan = params.plan ? FS.store.getPlan(Number(params.plan)) : null;
      FS.shell.setView({
        title: "Restock",
        crumb: "Inventory",
        subtitle: plan ? plan.name : params.view === "wizard" ? "New plan" : "Plans",
        render: FS.views.restock.render,
      });
      return;
    }

    if (path !== "/demand-forecasting") {
      window.location.hash = "#/demand-forecasting";
      return;
    }

    if (params.view === "wizard") {
      // Re-entering the wizard from the list starts a new draft; a repaint of
      // the same URL keeps the one in flight.
      if (last !== key) FS.views.wizard.begin();
      last = key;
      FS.shell.setView({
        title: "Demand Forecasting",
        crumb: "Inventory",
        subtitle: "New campaign",
        render: FS.views.wizard.render,
      });
      return;
    }

    if (params.campaign) {
      if (last !== key) {
        FS.views.forecast.open(params.campaign, {
          running: params.running === "1",
          scenario: params.scenario,
        });
        // The running flag is spent the moment the run starts; drop it so a
        // refresh does not kick off a second one.
        if (params.running === "1") {
          history.replaceState(null, "", `#/demand-forecasting?campaign=${params.campaign}`);
        }
      }
      last = window.location.hash;
      const campaign = FS.store.getCampaign(Number(params.campaign));
      FS.shell.setView({
        title: "Demand Forecasting",
        crumb: "Inventory",
        subtitle: campaign ? campaign.name : "",
        render: FS.views.forecast.render,
      });
      return;
    }

    last = key;
    FS.shell.setView({
      title: "Demand Forecasting",
      crumb: "Inventory",
      subtitle: "Campaigns",
      render: FS.views.campaigns.render,
    });
  }

  // Views read the query through here rather than parsing the hash again.
  FS.app = { params: () => current };

  window.addEventListener("hashchange", route);
  window.addEventListener("DOMContentLoaded", () => {
    // A panel left open in a previous session still collapses the nav.
    FS.helix.restore();
    if (!window.location.hash) window.location.hash = "#/demand-forecasting";
    route();
  });
})(window.FS);
