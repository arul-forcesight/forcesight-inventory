/*
 * The app shell — sidebar, page header and the Helix AI dock.
 *
 * Forked from the real Forcesight frontend: the menu tree, labels, icon
 * colours and collapse behaviour mirror components/CustomSideBar.js. The
 * header follows the product board instead: breadcrumb on the left, and
 * Downloads / Helix AI / notifications / avatar on the right.
 */
(function (FS) {
  "use strict";

  const { el, icon, clear, toast } = FS.ui;

  const COLLAPSE_KEY = "fs_sidebar_collapsed";

  const ORG_NAME = "Forcesight Demo";
  const ORG_INITIALS = "FD";

  // Icon colours per group, matching the real sidebar's palette.
  const MENU = [
    { key: "helix", label: "Helix AI (Beta)", icon: "spark", color: "#007FFF" },
    {
      key: "money", label: "Money (Beta)", icon: "money", color: "#027FFF",
      children: [{ label: "The Brief" }, { label: "Tracking" }, { label: "Team performance" }],
    },
    { key: "action", label: "Action Required", icon: "bolt", color: "#8E6BFF" },
    {
      key: "profit", label: "Profit", icon: "rise", color: "#2196F3",
      children: [
        { label: "Summary" }, { label: "Sales Summary" }, { label: "Profit - Table view" },
        { label: "Profit - Monthly View" }, { label: "Make Your Own Report" },
      ],
    },
    {
      key: "reconcile", label: "Reconcile", icon: "refresh", color: "#00A389",
      children: [
        { label: "Summary" }, { label: "Outstanding Payments" }, { label: "B2C Reconciliation" },
        { label: "B2B Reconciliation" }, { label: "Fee Leaks" }, { label: "Minimum Settlement Leaks" },
        { label: "Returns" }, { label: "Flipkart Claims" },
      ],
    },
    {
      key: "plan", label: "Plan Inventory", icon: "box", color: "#795548",
      children: [{ label: "Ledger" }, { label: "Restock Plan" }],
    },
    {
      key: "inventory", label: "Inventory", icon: "box", color: "#795548", open: true,
      children: [
        { label: "Demand Forecasting", route: "#/demand-forecasting", active: true },
        { label: "Inventory Price Tracking" },
      ],
    },
    {
      key: "brand", label: "Brand Intelligence", icon: "spark", color: "#F79009",
      children: [{ label: "Reviews" }, { label: "Campaigns" }, { label: "Sentiment" }],
    },
    {
      key: "product", label: "Product Intelligence", icon: "target", color: "#7C4DFF",
      children: [{ label: "Price Tracker" }, { label: "Buybox" }, { label: "Compliance" }],
    },
    { key: "downloads", label: "Downloads", icon: "download", color: "#0A335C" },
    {
      key: "settings", label: "Settings", icon: "settings", color: "#6B0CC4",
      children: [{ label: "Product Settings" }, { label: "User Settings" }, { label: "Logout" }],
    },
  ];

  let collapsed = localStorage.getItem(COLLAPSE_KEY) === "1";
  /*
   * Opening Helix collapses the nav for the duration. The user's own choice is
   * remembered separately so closing the panel puts the labels back — unless
   * they had collapsed it themselves to begin with.
   */
  let forcedCollapse = false;
  let userCollapsed = collapsed;

  const openGroups = new Set(MENU.filter((m) => m.open).map((m) => m.key));

  /**
   * Collapse the nav. `forced` marks it as Helix's doing rather than the
   * user's — a courtesy so three columns fit, never a lock. Touching the
   * toggle afterwards overrides it and the choice sticks.
   */
  function setNavCollapsed(next, forced) {
    if (forced) {
      forcedCollapse = next;
      collapsed = next || userCollapsed;
      return;
    }
    // A deliberate choice outranks the courtesy collapse.
    forcedCollapse = false;
    userCollapsed = next;
    collapsed = next;
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  }

  function logoMark(small) {
    // The real product mark, copied out of the frontend's image folder.
    const img = el("img.logo-img", {
      src: "./assets/forcesight-icon.png",
      alt: "Forcesight",
      width: small ? 30 : 34,
      height: small ? 30 : 34,
    });
    if (small) return el("div.logo", {}, [img]);
    return el("div.logo", {}, [
      img,
      el("img.logo-word-img", {
        src: "./assets/forcesight-logo.png",
        alt: "ForceSight",
      }),
    ]);
  }

  function renderSidebar() {
    const aside = el("aside.sidebar", { class: collapsed ? "collapsed" : "" });

    aside.appendChild(el("div.sidebar-logo", {}, [logoMark(collapsed)]));

    aside.appendChild(
      el("div.sidebar-toggle-row", {}, [
        collapsed ? null : el("p.sidebar-caption", { text: "Menu" }),
        el("button.collapse-btn", {
          title: collapsed ? "Expand menu" : "Collapse menu",
          onclick: () => {
            setNavCollapsed(!collapsed, false);
            mountShell();
          },
        }, [icon(collapsed ? "chevronRight" : "chevronLeft", 13)]),
      ])
    );

    const menu = el("nav.menu");
    MENU.forEach((item) => {
      const hasKids = !!(item.children && item.children.length);
      const isOpen = openGroups.has(item.key);
      const activeChild = hasKids && item.children.some((c) => c.active);

      const row = el(`button.menu-item${activeChild ? " parent-active" : ""}`, {
        title: item.label,
        onclick: () => {
          // The Helix entry opens the panel rather than a dead page.
          if (item.key === "helix") {
            FS.helix.setOpen(true);
            return;
          }
          if (!hasKids) {
            toast(`${item.label} is not part of this demo.`, "info");
            return;
          }
          // On the icon rail there is nowhere to show a submenu, so opening a
          // group expands the nav first.
          if (collapsed) {
            setNavCollapsed(false, false);
            openGroups.add(item.key);
            mountShell();
            return;
          }
          if (isOpen) openGroups.delete(item.key);
          else openGroups.add(item.key);
          mountShell();
        },
      }, [
        el("span.menu-icon", {}, [icon(item.icon, 18, item.color)]),
        collapsed ? null : el("span.menu-label", { text: item.label }),
        collapsed || !hasKids ? null : el("span.menu-caret", {}, [icon(isOpen ? "chevronUp" : "chevronDown", 12)]),
      ]);
      menu.appendChild(row);

      if (hasKids && isOpen && !collapsed) {
        const sub = el("div.submenu");
        item.children.forEach((child) => {
          sub.appendChild(
            el(`button.submenu-item${child.active ? " active" : ""}`, {
              title: child.label,
              onclick: () => {
                if (child.route) {
                  window.location.hash = child.route;
                  return;
                }
                toast(`${child.label} is not part of this demo.`, "info");
              },
            }, [el("span", { text: child.label })])
          );
        });
        menu.appendChild(sub);
      }
    });

    aside.appendChild(menu);
    return aside;
  }

  // ----------------------------------------------------------------- header
  function renderHeader(title, subtitle) {
    const helixOpen = FS.helix && FS.helix.isOpen();

    return el("header.page-header", {}, [
      el("div.head-left", {}, [
        el("span.crumb", { text: "Inventory" }),
        el("span.crumb-sep", { text: ">" }),
        el("h1.page-title", { text: title }),
        subtitle ? el("span.page-sub", { text: subtitle }) : null,
      ]),
      el("div.head-right", {}, [
        el("button.btn.btn-outline.head-downloads", {
          onclick: () => toast("Downloads is not part of this demo.", "info"),
        }, [el("span", { text: "Downloads" }), icon("download", 15)]),
        el(`button.btn.helix-btn${helixOpen ? " on" : ""}`, {
          title: helixOpen ? "Close Helix AI" : "Open Helix AI",
          onclick: () => FS.helix.toggle(),
        }, [icon("spark", 15, "#007FFF"), el("span", { text: "Helix AI" })]),
        el("button.icon-btn.head-icon", {
          title: "Notifications",
          onclick: () => toast("No new notifications.", "info"),
        }, [icon("bell", 17), el("span.bell-dot")]),
        el("div.avatar", { title: ORG_NAME }, [el("span", { text: ORG_INITIALS })]),
      ]),
    ]);
  }

  // ------------------------------------------------------------------ mount
  let currentView = { title: "Demand Forecasting", subtitle: "", render: null };

  function mountShell() {
    const root = document.getElementById("app");
    clear(root);

    const helixOpen = FS.helix && FS.helix.isOpen();
    root.className = helixOpen ? "helix-open" : "";

    root.appendChild(renderSidebar());

    const main = el("main.main", { class: collapsed ? "collapsed" : "" });
    main.appendChild(renderHeader(currentView.title, currentView.subtitle));
    const content = el("div.content", { id: "content" });
    main.appendChild(content);
    root.appendChild(main);

    if (helixOpen) {
      // On a narrow screen the panel floats over the page, so it needs a
      // backdrop to dismiss against.
      root.appendChild(
        el("div.helix-backdrop", { onclick: () => FS.helix.setOpen(false) })
      );
      root.appendChild(FS.helix.panel());
    }

    if (currentView.render) currentView.render(content);
  }

  /** Swap the page under the shell. */
  function setView(view) {
    currentView = Object.assign({}, currentView, view);
    mountShell();
    if (FS.helix) FS.helix.onRouteChange();
  }

  /** Re-render only the content area — used after in-page state changes. */
  function refresh() {
    const content = document.getElementById("content");
    if (!content || !currentView.render) return mountShell();
    clear(content);
    currentView.render(content);
    if (FS.helix && FS.helix.isOpen()) FS.helix.paint();
  }

  FS.shell = { mountShell, setView, refresh, setNavCollapsed, MENU, ORG_NAME };
})(window.FS);
