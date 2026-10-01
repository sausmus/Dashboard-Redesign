(() => {
  "use strict";

  const STORAGE_PREFIX = "bjhAgenda_v1_";
  const CHANGE_EVENT = "teacher-dashboard-agenda-changed";

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function emptyContent() { return { agenda: "", homework: "" }; }
  function activeClassIds() {
    const classes = window.DashboardData?.getClasses?.({ activeOnly: true }) || window.DashboardData?.getClasses?.() || [];
    const ids = classes.filter(item => item.active !== false).map(item => String(item.id));
    return ids.length ? ids : ["1", "2", "3", "4", "5", "6", "7"];
  }
  function normalizeDateKey(value) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = value instanceof Date ? value : new Date(value || Date.now());
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function defaultDay() {
    const periods = {};
    for (let i = 1; i <= 7; i += 1) periods[String(i)] = emptyContent();
    const groups = window.ClassGroups?.getGroups?.() || [];
    const scopeByPeriod = {};
    const groupAgendas = {};
    const ids = activeClassIds();
    if (groups.length) {
      for (const group of groups) {
        groupAgendas[group.id] = emptyContent();
        for (const classId of group.classIds) {
          if (ids.includes(String(classId))) scopeByPeriod[String(classId)] = `group:${group.id}`;
        }
      }
      for (const classId of ids) {
        if (!scopeByPeriod[classId]) scopeByPeriod[classId] = "period";
      }
    }
    return {
      // Preserve the legacy all-periods default when no Class Groups exist.
      // Once groups are configured, a brand-new day defaults to group sharing
      // for grouped periods and class-only for ungrouped periods.
      shared: groups.length === 0,
      sharedAgenda: "",
      sharedHomework: "",
      periods,
      groupAgendas,
      scopeByPeriod
    };
  }
  function normalizeDay(raw) {
    const base = defaultDay();
    const data = raw && typeof raw === "object" ? { ...raw } : {};
    data.periods = data.periods && typeof data.periods === "object" ? data.periods : {};
    for (let i = 1; i <= 7; i += 1) {
      const id = String(i);
      const value = data.periods[id] || data.periods[i] || {};
      data.periods[id] = { agenda: String(value.agenda || ""), homework: String(value.homework || "") };
    }
    data.shared = typeof data.shared === "boolean" ? data.shared : base.shared;
    data.sharedAgenda = String(data.sharedAgenda || "");
    data.sharedHomework = String(data.sharedHomework || "");
    data.groupAgendas = data.groupAgendas && typeof data.groupAgendas === "object" ? data.groupAgendas : {};
    data.scopeByPeriod = data.scopeByPeriod && typeof data.scopeByPeriod === "object" ? data.scopeByPeriod : {};
    return data;
  }
  function readDay(date) {
    const key = STORAGE_PREFIX + normalizeDateKey(date);
    try {
      const raw = localStorage.getItem(key);
      return raw ? normalizeDay(JSON.parse(raw)) : defaultDay();
    } catch (error) {
      console.error("Agenda data could not be read:", error);
      return defaultDay();
    }
  }
  function saveDay(date, data, detail = {}) {
    const dateKey = normalizeDateKey(date);
    const normalized = normalizeDay(data);
    localStorage.setItem(STORAGE_PREFIX + dateKey, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { ...detail, dateKey } }));
    return clone(normalized);
  }
  function validGroupScope(scope, classId) {
    if (!String(scope).startsWith("group:")) return false;
    const groupId = String(scope).slice(6);
    const group = window.ClassGroups?.getGroup?.(groupId);
    return Boolean(group && group.classIds.includes(String(classId)));
  }
  function resolveScope(data, classId) {
    const id = String(classId);
    const explicit = String(data?.scopeByPeriod?.[id] || "");
    if (explicit === "period" || explicit === "all" || validGroupScope(explicit, id)) return explicit;
    // Legacy Agenda compatibility: shared=true means the old all-periods record.
    return data?.shared === true ? "all" : "period";
  }
  function contentFor(data, classId) {
    const id = String(classId);
    const scope = resolveScope(data, id);
    if (scope === "all") return { scope, agenda: data.sharedAgenda || "", homework: data.sharedHomework || "" };
    if (scope.startsWith("group:")) {
      const groupId = scope.slice(6);
      const value = data.groupAgendas?.[groupId] || emptyContent();
      return { scope, agenda: value.agenda || "", homework: value.homework || "" };
    }
    const value = data.periods?.[id] || emptyContent();
    return { scope: "period", agenda: value.agenda || "", homework: value.homework || "" };
  }
  function seedContent(data, classId) {
    const current = contentFor(data, classId);
    return { agenda: current.agenda || "", homework: current.homework || "" };
  }
  function setScope(date, classId, nextScope) {
    const id = String(classId);
    const data = readDay(date);
    const seed = seedContent(data, id);
    const scope = String(nextScope || "period");
    const activeIds = activeClassIds();

    if (scope === "all") {
      if (!data.sharedAgenda && !data.sharedHomework) {
        data.sharedAgenda = seed.agenda;
        data.sharedHomework = seed.homework;
      }
      for (const activeId of activeIds) data.scopeByPeriod[activeId] = "all";
      data.shared = true;
    } else if (scope.startsWith("group:")) {
      const groupId = scope.slice(6);
      const group = window.ClassGroups?.getGroup?.(groupId);
      if (!group || !group.classIds.includes(id)) throw new Error("That class group is no longer available.");
      if (!data.groupAgendas[groupId]) data.groupAgendas[groupId] = { ...seed };
      for (const memberId of group.classIds.filter(member => activeIds.includes(String(member)))) {
        data.scopeByPeriod[String(memberId)] = `group:${groupId}`;
      }
      data.shared = activeIds.length > 0 && activeIds.every(activeId => data.scopeByPeriod[activeId] === "all");
    } else {
      if (!data.periods[id]?.agenda && !data.periods[id]?.homework) data.periods[id] = { ...seed };
      data.scopeByPeriod[id] = "period";
      data.shared = activeIds.length > 0 && activeIds.every(activeId => data.scopeByPeriod[activeId] === "all");
    }

    return saveDay(date, data, { type: "scope-changed", classId: id, scope });
  }
  function saveContent(date, classId, agenda, homework) {
    const id = String(classId);
    const data = readDay(date);
    const scope = resolveScope(data, id);
    const value = { agenda: String(agenda || ""), homework: String(homework || "") };
    if (scope === "all") {
      data.sharedAgenda = value.agenda;
      data.sharedHomework = value.homework;
    } else if (scope.startsWith("group:")) {
      data.groupAgendas[scope.slice(6)] = value;
    } else {
      data.periods[id] = value;
    }
    return saveDay(date, data, { type: "content-changed", classId: id, scope });
  }
  function getContent(date, classId) {
    return clone(contentFor(readDay(date), classId));
  }
  function getContext(date, classId) {
    const id = String(classId);
    const data = readDay(date);
    const scope = resolveScope(data, id);
    const group = scope.startsWith("group:") ? window.ClassGroups?.getGroup?.(scope.slice(6)) : window.ClassGroups?.getGroupForClass?.(id);
    const isException = Boolean(group && scope === "period");
    return {
      classId: id,
      scope,
      group: clone(group || null),
      isException,
      content: clone(contentFor(data, id))
    };
  }

  window.AgendaService = Object.freeze({
    storagePrefix: STORAGE_PREFIX,
    changeEvent: CHANGE_EVENT,
    dateKey: normalizeDateKey,
    readDay,
    saveDay,
    getContent,
    getContext,
    resolveScope,
    setScope,
    saveContent
  });
})();
