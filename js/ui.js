/*
 * Shared UI primitives: DOM building, modals, toasts, dropdowns, pagers.
 *
 * The real module leans on AntD for all of this. Here it is hand-rolled so
 * the demo stays a folder of static files with nothing to install.
 */
(function (FS) {
  "use strict";

  const U = FS.util;

  /** Terse element builder. el("div.card", {onclick}, [children]) */
  function el(spec, props, children) {
    const [tagPart, ...classes] = String(spec).split(".");
    const node = document.createElement(tagPart || "div");
    if (classes.length) node.className = classes.join(" ");
    if (props) {
      Object.keys(props).forEach((k) => {
        const v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") node.className = node.className ? `${node.className} ${v}` : v;
        else if (k === "html") node.innerHTML = v;
        else if (k === "text") node.textContent = v;
        else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
        else if (k === "dataset") Object.assign(node.dataset, v);
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? "" : v);
      });
    }
    appendAll(node, children);
    return node;
  }

  function appendAll(node, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) {
      children.forEach((c) => appendAll(node, c));
      return;
    }
    node.appendChild(children instanceof Node ? children : document.createTextNode(String(children)));
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  /** Inline SVG from a path string, so icons need no sprite sheet. */
  function icon(name, size, color) {
    const p = ICONS[name];
    if (!p) return el("span");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", p.box || "0 0 24 24");
    svg.setAttribute("width", size || 16);
    svg.setAttribute("height", size || 16);
    svg.setAttribute("fill", p.fill ? color || "currentColor" : "none");
    svg.classList.add("ic");
    p.d.forEach((d) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      if (p.fill) {
        path.setAttribute("fill", color || "currentColor");
      } else {
        path.setAttribute("stroke", color || "currentColor");
        path.setAttribute("stroke-width", p.width || 1.7);
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
      }
      svg.appendChild(path);
    });
    return svg;
  }

  const ICONS = {
    plus: { d: ["M12 5v14M5 12h14"] },
    eye: { d: ["M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z", "M12 15a3 3 0 100-6 3 3 0 000 6z"] },
    edit: { d: ["M12 20h9", "M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"] },
    trash: { d: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6", "M10 11v6M14 11v6"] },
    copy: { d: ["M9 9h10v10H9z", "M5 15V5h10"] },
    close: { d: ["M18 6L6 18M6 6l12 12"] },
    check: { d: ["M20 6L9 17l-5-5"] },
    chevronDown: { d: ["M6 9l6 6 6-6"] },
    chevronUp: { d: ["M18 15l-6-6-6 6"] },
    chevronRight: { d: ["M9 6l6 6-6 6"] },
    chevronLeft: { d: ["M15 6l-6 6 6 6"] },
    arrowLeft: { d: ["M19 12H5", "M12 19l-7-7 7-7"] },
    arrowRight: { d: ["M5 12h14", "M12 5l7 7-7 7"] },
    calendar: { d: ["M3 6a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2z", "M16 2v4M8 2v4M3 10h18"] },
    database: { d: ["M12 7c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3z", "M20 4v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V4", "M20 10v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6"] },
    rise: { d: ["M3 17l6-6 4 4 7-7", "M14 8h7v7"] },
    target: { d: ["M12 21a9 9 0 100-18 9 9 0 000 18z", "M12 17a5 5 0 100-10 5 5 0 000 10z", "M12 13a1 1 0 100-2 1 1 0 000 2z"] },
    money: { d: ["M12 1v22", "M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"] },
    bolt: { d: ["M13 2L3 14h8l-1 8 10-12h-8l1-8z"] },
    tag: { d: ["M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0l-7.2-7.2A2 2 0 013 12V5a2 2 0 012-2h7a2 2 0 011.4.6l7.2 7.2a2 2 0 010 2.6z", "M7.5 7.5h.01"] },
    filter: { d: ["M22 3H2l8 9.5V19l4 2v-8.5L22 3z"] },
    expand: { d: ["M15 3h6v6", "M9 21H3v-6", "M21 3l-7 7", "M3 21l7-7"] },
    compress: { d: ["M4 14h6v6", "M20 10h-6V4", "M14 10l7-7", "M3 21l7-7"] },
    search: { d: ["M11 19a8 8 0 100-16 8 8 0 000 16z", "M21 21l-4.3-4.3"] },
    refresh: { d: ["M3 12a9 9 0 0115.5-6.3L21 8", "M21 3v5h-5", "M21 12a9 9 0 01-15.5 6.3L3 16", "M3 21v-5h5"] },
    more: { d: ["M12 6.5a1 1 0 100-2 1 1 0 000 2z", "M12 13a1 1 0 100-2 1 1 0 000 2z", "M12 19.5a1 1 0 100-2 1 1 0 000 2z"], fill: true },
    download: { d: ["M12 3v12", "M7 11l5 5 5-5", "M20 17v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2"] },
    settings: { d: ["M12 15a3 3 0 100-6 3 3 0 000 6z", "M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.5.57.86 1.09.95H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"] },
    box: { box: "0 0 16 16", fill: true, d: ["M12 6v-4l-4-2-4 2v4l-4 2v5l4 2 4-2 4 2 4-2v-5zM8.090 1.12l2.91 1.44-2.6 1.3-2.91-1.44zM5 2.78l3 1.5v3.6l-3-1.5v-3.6zM4 13.88l-3-1.5v-3.6l3 1.5v3.6zM4.28 9.88l-2.88-1.46 2.6-1.3 2.88 1.44zM12 13.88l-3-1.5v-3.6l3 1.5v3.6zM12.28 9.88l-2.88-1.46 2.6-1.3 2.88 1.44z"] },
    bell: { d: ["M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9", "M13.7 21a2 2 0 01-3.4 0"] },
    alert: { d: ["M12 9v4", "M12 17h.01", "M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"] },
    info: { d: ["M12 21a9 9 0 100-18 9 9 0 000 18z", "M12 16v-4", "M12 8h.01"] },
    undo: { d: ["M3 7v6h6", "M3.5 13a9 9 0 103-7.7L3 8"] },
    spark: { d: ["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"], fill: true },
  };

  // ------------------------------------------------------------------ toast
  let toastHost = null;
  function toast(message, kind) {
    if (!toastHost) {
      toastHost = el("div.toast-host");
      document.body.appendChild(toastHost);
    }
    const node = el(`div.toast.toast-${kind || "info"}`, {}, [
      icon(kind === "error" ? "alert" : kind === "success" ? "check" : "info", 15),
      el("span", { text: message }),
    ]);
    toastHost.appendChild(node);
    setTimeout(() => node.classList.add("in"), 10);
    setTimeout(() => {
      node.classList.remove("in");
      setTimeout(() => node.remove(), 250);
    }, 3200);
  }

  // ------------------------------------------------------------------ modal
  /**
   * A modal that owns its own backdrop.
   *
   * Returns a handle with `close()` so callers can shut it from a footer
   * button as well as the backdrop and Escape.
   */
  function modal(opts) {
    const o = opts || {};
    const box = el("div.modal", { style: { width: (o.width || 720) + "px" } });
    const back = el("div.modal-back", {
      onclick: (e) => {
        if (e.target === back && o.dismissable !== false) handle.close();
      },
    }, [box]);

    const handle = {
      el: box,
      close() {
        document.removeEventListener("keydown", onKey);
        back.classList.remove("in");
        setTimeout(() => back.remove(), 180);
        if (o.onClose) o.onClose();
      },
    };

    function onKey(e) {
      if (e.key === "Escape" && o.dismissable !== false) handle.close();
    }
    document.addEventListener("keydown", onKey);

    if (o.title || o.actions) {
      box.appendChild(
        el("div.modal-head", {}, [
          el("div", {}, [
            el("h3.modal-title", { text: o.title || "" }),
            o.subtitle ? el("p.modal-sub", { text: o.subtitle }) : null,
          ]),
          el("div.modal-actions", {}, o.actions ? o.actions(handle) : [
            el("button.icon-btn", { onclick: () => handle.close(), title: "Close" }, [icon("close", 16)]),
          ]),
        ])
      );
    }

    const body = el("div.modal-body");
    box.appendChild(body);
    handle.body = body;
    if (o.body) appendAll(body, o.body(handle));
    if (o.footer) box.appendChild(el("div.modal-foot", {}, o.footer(handle)));

    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add("in"));
    return handle;
  }

  /** Yes/no, used before anything destructive. */
  function confirm(opts) {
    const o = opts || {};
    return modal({
      width: 420,
      title: o.title || "Are you sure?",
      actions: (h) => [el("button.icon-btn", { onclick: () => h.close() }, [icon("close", 16)])],
      body: () => [el("p.confirm-text", { text: o.message || "" })],
      footer: (h) => [
        el("button.btn", { text: o.cancelText || "Cancel", onclick: () => h.close() }),
        el(`button.btn.${o.danger ? "btn-danger" : "btn-primary"}`, {
          text: o.okText || "Confirm",
          onclick: () => {
            h.close();
            if (o.onOk) o.onOk();
          },
        }),
      ],
    });
  }

  // --------------------------------------------------------------- controls
  /** A plain single-select built from a value/label list. */
  function select(options, value, onChange, opts) {
    const o = opts || {};
    const node = el("select.select", { onchange: (e) => onChange(e.target.value) });
    if (o.placeholder && (value === undefined || value === null || value === "")) {
      node.appendChild(el("option", { value: "", text: o.placeholder, disabled: true, selected: true }));
    }
    options.forEach((opt) => {
      const option = el("option", { value: opt.value, text: opt.label });
      if (opt.disabled) option.disabled = true;
      if (String(opt.value) === String(value)) option.selected = true;
      node.appendChild(option);
    });
    if (o.className) node.className += " " + o.className;
    if (o.disabled) node.disabled = true;
    return node;
  }

  /**
   * Multi-select with a search box and checkboxes.
   *
   * The target picker's filters need this: lists run to dozens of values and
   * a native <select multiple> is unusable for picking four of them.
   */
  function multiSelect(opts) {
    const o = opts || {};
    let value = (o.value || []).slice();
    const host = el("div.ms");
    const label = el("span.ms-label");
    const box = el("button.ms-box", { type: "button" }, [label, icon("chevronDown", 14)]);
    const panel = el("div.ms-panel");
    const searchInput = el("input.ms-search", { type: "text", placeholder: "Search…" });
    const list = el("div.ms-list");

    function paint() {
      label.textContent = value.length
        ? value.length === 1
          ? String(value[0])
          : `${value.length} selected`
        : o.placeholder || "All";
      label.classList.toggle("muted", !value.length);
      host.classList.toggle("has-value", value.length > 0);
    }

    function renderList() {
      clear(list);
      const q = searchInput.value.trim().toLowerCase();
      // Chosen values stay at the top, so a long list still shows the picks.
      const picked = value.slice();
      const rest = (o.options || []).filter((v) => !picked.includes(v));
      const rows = picked.concat(rest).filter((v) => !q || String(v).toLowerCase().includes(q));
      if (!rows.length) {
        list.appendChild(el("div.ms-empty", { text: "No matches" }));
        return;
      }
      rows.slice(0, 300).forEach((v) => {
        const on = value.includes(v);
        list.appendChild(
          el("label.ms-item", {}, [
            el("input", {
              type: "checkbox",
              checked: on || null,
              onchange: (e) => {
                if (e.target.checked) value.push(v);
                else value = value.filter((x) => x !== v);
                paint();
                if (o.onChange) o.onChange(value.slice());
              },
            }),
            el("span", { text: String(v) }),
          ])
        );
      });
    }

    box.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = host.classList.toggle("open");
      if (open) {
        closeOtherMultiSelects(host);
        renderList();
        searchInput.focus();
      }
    });
    searchInput.addEventListener("input", renderList);
    panel.addEventListener("click", (e) => e.stopPropagation());

    panel.appendChild(searchInput);
    panel.appendChild(list);
    panel.appendChild(
      el("div.ms-foot", {}, [
        el("button.link-btn", {
          type: "button",
          text: "Clear",
          onclick: () => {
            value = [];
            paint();
            renderList();
            if (o.onChange) o.onChange([]);
          },
        }),
        el("button.link-btn", {
          type: "button",
          text: "Done",
          onclick: () => host.classList.remove("open"),
        }),
      ])
    );

    host.appendChild(box);
    host.appendChild(panel);
    paint();
    return host;
  }

  function closeOtherMultiSelects(except) {
    document.querySelectorAll(".ms.open").forEach((n) => {
      if (n !== except) n.classList.remove("open");
    });
  }
  document.addEventListener("click", () => closeOtherMultiSelects(null));

  /** Two native date inputs acting as one range. */
  function dateRange(start, end, onChange, opts) {
    const o = opts || {};
    const a = el("input.date-input", {
      type: "date",
      value: U.ymd(start),
      onchange: () => onChange([new Date(a.value), new Date(b.value)]),
    });
    const b = el("input.date-input", {
      type: "date",
      value: U.ymd(end),
      onchange: () => onChange([new Date(a.value), new Date(b.value)]),
    });
    if (o.disabled) {
      a.disabled = true;
      b.disabled = true;
    }
    return el("div.date-range", {}, [a, el("span.date-sep", { text: "→" }), b]);
  }

  function pill(text, kind) {
    return el(`span.pill.pill-${kind || "grey"}`, { text });
  }

  /** A pager that reports page and size changes back to the caller. */
  function pager(opts) {
    const o = opts || {};
    const total = o.total || 0;
    const size = o.pageSize || 25;
    const pages = Math.max(1, Math.ceil(total / size));
    const page = U.clamp(o.page || 1, 1, pages);
    const from = total ? (page - 1) * size + 1 : 0;
    const to = Math.min(total, page * size);

    const btn = (label, target, disabled) =>
      el("button.pg-btn", {
        text: label,
        disabled: disabled || null,
        onclick: () => o.onChange(target, size),
      });

    const nums = [];
    const span = 2;
    for (let p = 1; p <= pages; p += 1) {
      if (p === 1 || p === pages || Math.abs(p - page) <= span) {
        nums.push(
          el(`button.pg-btn${p === page ? ".active" : ""}`, {
            text: String(p),
            onclick: () => o.onChange(p, size),
          })
        );
      } else if (nums.length && nums[nums.length - 1].textContent !== "…") {
        nums.push(el("span.pg-dots", { text: "…" }));
      }
    }

    return el("div.pager", {}, [
      el("span.pg-total", { text: `${U.inr(from)}–${U.inr(to)} of ${U.inr(total)} ${o.unit || "rows"}` }),
      el("div.pg-nums", {}, [btn("‹", page - 1, page <= 1), nums, btn("›", page + 1, page >= pages)]),
      el("div.pg-size", {}, [
        el("span", { text: "Rows" }),
        select(
          (o.sizes || [10, 25, 50, 100]).map((n) => ({ value: n, label: String(n) })),
          size,
          (v) => o.onChange(1, Number(v)),
          { className: "select-sm" }
        ),
      ]),
    ]);
  }

  /** Full-card spinner used while a run is in flight. */
  function spinner(text) {
    return el("div.spinner-wrap", {}, [el("div.spinner"), text ? el("span.spinner-text", { text }) : null]);
  }

  function empty(text, sub) {
    return el("div.empty", {}, [
      icon("filter", 26),
      el("p.empty-title", { text }),
      sub ? el("p.empty-sub", { text: sub }) : null,
    ]);
  }

  FS.ui = {
    el, clear, icon, toast, modal, confirm, select, multiSelect,
    dateRange, pill, pager, spinner, empty, appendAll,
  };
})(window.FS);
