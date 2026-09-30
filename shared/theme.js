(() => {
  "use strict";

  const STORAGE_KEY = "teacherDashboard.appearance.v1";
  const CHANGE_EVENT = "teacher-dashboard-appearance-changed";
  const VALID_MODES = new Set(["light", "dark", "system"]);
  const VALID_THEMES = new Set(["blue", "sage", "lavender", "terracotta", "slate"]);
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function normalize(value) {
    const incoming = value && typeof value === "object" ? value : {};
    const mode = VALID_MODES.has(incoming.mode) ? incoming.mode : "light";
    const theme = VALID_THEMES.has(incoming.theme) ? incoming.theme : "blue";
    return { mode, theme };
  }

  function load() {
    try {
      return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
    } catch {
      return normalize({});
    }
  }

  function resolvedMode(settings = load()) {
    if (settings.mode !== "system") return settings.mode;
    return media?.matches ? "dark" : "light";
  }

  function apply(settings = load(), { dispatch = false } = {}) {
    const next = normalize(settings);
    const root = document.documentElement;
    root.dataset.themeMode = next.mode;
    root.dataset.colorMode = resolvedMode(next);
    root.dataset.accentTheme = next.theme;

    if (dispatch) {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { ...next, resolvedMode: resolvedMode(next) } }));
    }

    document.querySelectorAll("[data-theme-mode]").forEach(button => {
      const selected = button.dataset.themeMode === next.mode;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    document.querySelectorAll("[data-theme-value]").forEach(button => {
      const selected = button.dataset.themeValue === next.theme;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    return next;
  }

  function save(updates = {}) {
    const next = normalize({ ...load(), ...updates });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return apply(next, { dispatch: true });
  }

  function bindControls(root = document) {
    root.querySelectorAll("[data-theme-mode]").forEach(button => {
      if (button.dataset.themeBound === "1") return;
      button.dataset.themeBound = "1";
      button.addEventListener("click", () => save({ mode: button.dataset.themeMode }));
    });

    root.querySelectorAll("[data-theme-value]").forEach(button => {
      if (button.dataset.themeBound === "1") return;
      button.dataset.themeBound = "1";
      button.addEventListener("click", () => save({ theme: button.dataset.themeValue }));
    });

    apply();
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
    root.querySelector(".td-mobile-overlay")?.addEventListener("click", () => toggleSidebar(false));
    root.querySelectorAll(".td-sidebar a").forEach(link => link.addEventListener("click", () => {
      if (window.innerWidth <= 860) toggleSidebar(false);
    }));
  }

  // Apply immediately, before DOMContentLoaded, to reduce flashes.
  apply();

  media?.addEventListener?.("change", () => {
    if (load().mode === "system") apply(load(), { dispatch: true });
  });

  window.addEventListener("storage", event => {
    if (event.key === STORAGE_KEY) apply();
  });

  window.TeacherDashboardTheme = Object.freeze({
    storageKey: STORAGE_KEY,
    changeEvent: CHANGE_EVENT,
    getSettings: load,
    save,
    apply,
    bindControls,
    bindShell,
    toggleSidebar
  });

  const ready = () => {
    bindControls();
    bindShell();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready, { once: true });
  else ready();
})();
