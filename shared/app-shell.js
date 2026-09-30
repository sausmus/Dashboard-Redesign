(() => {
  "use strict";

  const SHELL_KEY = "teacherDashboard.shell.v1";

  const icons = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>',
    students: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-3.2 2.4-5 5.5-5s5 1.8 5.5 5"/><circle cx="17.5" cy="9.5" r="2.2"/><path d="M15.5 15.5c2.8-.4 4.6.7 5 3.5"/></svg>',
    agenda: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M8 2.5v4M16 2.5v4M3 9h18"/><path d="M7.5 13h3M7.5 16.5h6"/></svg>',
    writing: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h11a2 2 0 0 1 2 2v12H6a2 2 0 0 0-2 2V4Z"/><path d="M6 20h14V8"/><path d="M8 9h5M8 13h5"/><path d="m15.5 15.5 4-4 1.5 1.5-4 4-2 .5.5-2Z"/></svg>',
    games: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="13" rx="5"/><path d="M8 10v5M5.5 12.5h5M16 11h.01M19 14h.01"/></svg>',
    scoreboard: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5a2 2 0 0 0 2 4h1M16 6h3a2 2 0 0 1-2 4h-1"/><path d="M12 12v4M8.5 20h7M10 16h4"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.87l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.1.4.3.75.6 1 .3.25.7.38 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7.6Z"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 6-6 6 6 6"/></svg>'
  };

  const items = [
    ["home", "Home", "index.html"],
    ["students", "Students", "students.html"],
    ["agenda", "Agenda", "agenda.html"],
    ["writing", "Writing", "writing.html"],
    ["games", "Games", "games.html"],
    ["scoreboard", "Scoreboard", "scoreboard.html"],
    ["inbox", "Inbox Assistant", "inbox-assistant.html"]
  ];

  function readShellState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SHELL_KEY) || "{}");
      return { collapsed: parsed.collapsed === true };
    } catch {
      return { collapsed: false };
    }
  }

  function writeShellState(patch = {}) {
    const next = { ...readShellState(), ...patch };
    localStorage.setItem(SHELL_KEY, JSON.stringify(next));
    applyCollapsed(next.collapsed);
    return next;
  }

  function applyCollapsed(collapsed = readShellState().collapsed) {
    const compact = Boolean(collapsed) && window.innerWidth > 860;
    document.body.classList.toggle("td-sidebar-collapsed", compact);
    document.querySelectorAll("[data-td-collapse]").forEach(button => {
      button.setAttribute("aria-pressed", String(compact));
      button.setAttribute("aria-label", compact ? "Expand sidebar" : "Collapse sidebar");
      button.title = compact ? "Expand sidebar" : "Collapse sidebar";
    });
  }

  function link(item, current) {
    const [key, label, href] = item;
    return `<a class="td-nav-link" href="${href}" title="${label}" ${key === current ? 'aria-current="page"' : ""}>
      <span class="td-nav-icon" aria-hidden="true">${icons[key]}</span>
      <span class="td-nav-label">${label}</span>
    </a>`;
  }

  function renderSidebar(current = "") {
    return `<aside class="td-sidebar" aria-label="Main navigation">
      <a class="td-brand" href="index.html" title="Teacher Dashboard">
        <span class="td-brand-mark"><img src="bjh-logo.png" alt=""></span>
        <span class="td-brand-copy"><span class="td-brand-title">Teacher Dashboard</span><span class="td-brand-subtitle">Brea Junior High</span></span>
      </a>
      <nav class="td-nav">
        ${items.map(item => link(item, current)).join("")}
      </nav>
      <div class="td-sidebar-spacer"></div>
      <div class="td-sidebar-bottom">
        <button class="td-nav-link td-sidebar-collapse" type="button" data-td-collapse aria-pressed="false">
          <span class="td-nav-icon td-collapse-icon" aria-hidden="true">${icons.collapse}</span>
          <span class="td-nav-label">Collapse</span>
        </button>
        ${link(["settings", "Settings", "settings.html"], current)}
      </div>
    </aside>`;
  }

  function renderMobileBar() {
    return `<div class="td-mobile-bar">
      <button class="td-mobile-menu-button" type="button" data-td-menu-toggle aria-label="Open navigation">☰</button>
      <span class="td-mobile-brand">Teacher Dashboard</span>
      <span style="width:38px" aria-hidden="true"></span>
    </div><div class="td-mobile-overlay"></div>`;
  }

  function toggleSidebar(force) {
    const sidebar = document.querySelector(".td-sidebar");
    const overlay = document.querySelector(".td-mobile-overlay");
    if (!sidebar) return;
    const open = typeof force === "boolean" ? force : !sidebar.classList.contains("open");
    sidebar.classList.toggle("open", open);
    overlay?.classList.toggle("open", open);
    document.body.classList.toggle("td-menu-open", open);
  }

  function bindShell(root = document) {
    root.querySelectorAll("[data-td-menu-toggle]").forEach(button => {
      if (button.dataset.shellBound === "1") return;
      button.dataset.shellBound = "1";
      button.addEventListener("click", () => toggleSidebar());
    });

    root.querySelectorAll("[data-td-collapse]").forEach(button => {
      if (button.dataset.shellBound === "1") return;
      button.dataset.shellBound = "1";
      button.addEventListener("click", () => writeShellState({ collapsed: !readShellState().collapsed }));
    });

    const overlay = root.querySelector(".td-mobile-overlay");
    if (overlay && overlay.dataset.shellBound !== "1") {
      overlay.dataset.shellBound = "1";
      overlay.addEventListener("click", () => toggleSidebar(false));
    }

    root.querySelectorAll(".td-sidebar a").forEach(link => {
      if (link.dataset.shellBound === "1") return;
      link.dataset.shellBound = "1";
      link.addEventListener("click", () => {
        if (window.innerWidth <= 860) toggleSidebar(false);
      });
    });

    applyCollapsed();
  }

  function mount() {
    document.querySelectorAll("[data-td-sidebar]").forEach(root => {
      root.outerHTML = renderSidebar(root.dataset.tdSidebar || "");
    });
    document.querySelectorAll("[data-td-mobile-bar]").forEach(root => {
      root.outerHTML = renderMobileBar();
    });
    bindShell();
    window.TeacherDashboardTheme?.bindShell?.();
  }

  function currentClassId() {
    try {
      return window.DashboardData?.getCurrentClassId?.() || null;
    } catch {
      return null;
    }
  }

  function setCurrentClassId(classId) {
    if (!classId || !window.DashboardData?.setCurrentClass) return null;
    try {
      return window.DashboardData.setCurrentClass(String(classId));
    } catch {
      return null;
    }
  }

  window.addEventListener("resize", () => {
    if (window.innerWidth > 860) toggleSidebar(false);
    applyCollapsed();
  });

  window.TeacherDashboardShell = Object.freeze({
    storageKey: SHELL_KEY,
    renderSidebar,
    renderMobileBar,
    mount,
    bindShell,
    toggleSidebar,
    getShellState: readShellState,
    setCollapsed: collapsed => writeShellState({ collapsed: Boolean(collapsed) }),
    getCurrentClassId: currentClassId,
    setCurrentClassId
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();