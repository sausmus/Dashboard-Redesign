(() => {
  "use strict";

  const STORAGE_KEY = "teacherDashboard.gradingTerms.v1";
  const CHANGE_EVENT = "teacher-dashboard-grading-terms-changed";

  const TERMS = Object.freeze([
    { id: "q1", label: "Quarter 1" },
    { id: "q2", label: "Quarter 2" },
    { id: "q3", label: "Quarter 3" },
    { id: "q4", label: "Quarter 4" },
    { id: "fall", label: "Fall Semester" },
    { id: "spring", label: "Spring Semester" }
  ]);

  const ALLOWED = Object.freeze({
    participation: Object.freeze(["q1", "q2", "q3", "q4", "fall", "spring"]),
    timeliness: Object.freeze(["fall", "spring"])
  });

  function termLabel(termId) {
    return TERMS.find(item => item.id === String(termId))?.label || String(termId || "");
  }

  function existingTerm(utility) {
    try {
      if (utility === "participation") return window.DashboardData?.getActiveParticipationTermId?.() || "q1";
      if (utility === "timeliness") return window.DashboardData?.getActiveTimelinessTermId?.() || "fall";
    } catch {}
    return utility === "timeliness" ? "fall" : "q1";
  }

  function defaultGlobalTerm() {
    const timeliness = existingTerm("timeliness");
    if (ALLOWED.timeliness.includes(timeliness)) return timeliness;
    const month = new Date().getMonth();
    return month >= 6 ? "fall" : "spring";
  }

  function defaults() {
    const globalTermId = defaultGlobalTerm();
    const p = existingTerm("participation");
    const t = existingTerm("timeliness");
    return {
      version: 1,
      configured: false,
      globalTermId,
      utilities: {
        participation: {
          mode: p === globalTermId ? "global" : "custom",
          overrideTermId: p
        },
        timeliness: {
          mode: t === globalTermId ? "global" : "custom",
          overrideTermId: t
        }
      }
    };
  }

  function normalize(raw = {}) {
    const base = defaults();
    const globalCandidate = String(raw.globalTermId || base.globalTermId);
    const globalTermId = TERMS.some(item => item.id === globalCandidate) ? globalCandidate : base.globalTermId;

    const result = {
      version: 1,
      configured: raw.configured === true,
      globalTermId,
      utilities: {}
    };

    ["participation", "timeliness"].forEach(utility => {
      const allowed = ALLOWED[utility];
      const incoming = raw.utilities?.[utility] || {};
      const fallback = existingTerm(utility);
      let mode = incoming.mode === "custom" ? "custom" : "global";
      let overrideTermId = allowed.includes(String(incoming.overrideTermId))
        ? String(incoming.overrideTermId)
        : (allowed.includes(fallback) ? fallback : allowed[0]);

      // Timeliness currently stores semester records only. If the global term
      // is a quarter, preserve the existing semester record instead of
      // silently moving or rewriting any Timeliness data.
      if (mode === "global" && !allowed.includes(globalTermId)) {
        mode = "custom";
        overrideTermId = allowed.includes(fallback) ? fallback : overrideTermId;
      }

      result.utilities[utility] = { mode, overrideTermId };
    });

    return result;
  }

  function getConfig() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return normalize(raw || {});
    } catch {
      return normalize({});
    }
  }

  function resolveTermId(utility, config = getConfig()) {
    const allowed = ALLOWED[utility] || [];
    const pref = config.utilities?.[utility] || {};
    if (pref.mode === "custom" && allowed.includes(pref.overrideTermId)) return pref.overrideTermId;
    if (allowed.includes(config.globalTermId)) return config.globalTermId;
    const fallback = existingTerm(utility);
    return allowed.includes(fallback) ? fallback : allowed[0];
  }

  function applyToDashboardData(config = getConfig()) {
    if (!config.configured || !window.DashboardData) return config;
    const participationTerm = resolveTermId("participation", config);
    const timelinessTerm = resolveTermId("timeliness", config);

    try {
      if (participationTerm && DashboardData.getActiveParticipationTermId?.() !== participationTerm) {
        DashboardData.setActiveParticipationTerm?.(participationTerm);
      }
    } catch {}

    try {
      if (timelinessTerm && DashboardData.getActiveTimelinessTermId?.() !== timelinessTerm) {
        DashboardData.setActiveTimelinessTerm?.(timelinessTerm);
      }
    } catch {}

    return config;
  }

  function saveConfig(next, options = {}) {
    const config = normalize({ ...next, configured: true });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    if (options.apply !== false) applyToDashboardData(config);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { config } }));
    return config;
  }

  function setGlobalTerm(termId) {
    const config = getConfig();
    config.globalTermId = String(termId);
    return saveConfig(config);
  }

  function setUtilityPreference(utility, value) {
    const config = getConfig();
    if (!config.utilities[utility]) throw new Error(`Unknown grading utility: ${utility}`);
    if (value === "global") {
      config.utilities[utility].mode = "global";
    } else {
      config.utilities[utility].mode = "custom";
      config.utilities[utility].overrideTermId = String(value);
    }
    return saveConfig(config);
  }

  window.TeacherDashboardGradingTerms = Object.freeze({
    storageKey: STORAGE_KEY,
    changeEvent: CHANGE_EVENT,
    terms: TERMS,
    allowedTerms: ALLOWED,
    getConfig,
    saveConfig,
    resolveTermId,
    termLabel,
    applyToDashboardData,
    setGlobalTerm,
    setUtilityPreference
  });

  // Only apply persisted choices. A first-time P4.2 load never changes the
  // teacher's existing active terms automatically.
  const existing = getConfig();
  if (existing.configured) applyToDashboardData(existing);
})();