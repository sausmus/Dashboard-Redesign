(() => {
  "use strict";

  const STORAGE_KEY = "teacherDashboard.classGroups.v1";
  const CHANGE_EVENT = "teacher-dashboard-class-groups-changed";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function uid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function validClassIds() {
    try {
      return new Set((window.DashboardData?.getClasses?.() || []).map(item => String(item.id)));
    } catch {
      return new Set(["1", "2", "3", "4", "5", "6", "7"]);
    }
  }

  function normalizeGroup(group) {
    const valid = validClassIds();
    const classIds = [...new Set((Array.isArray(group?.classIds) ? group.classIds : [])
      .map(String)
      .filter(id => valid.size === 0 || valid.has(id)))]
      .sort((a, b) => Number(a) - Number(b));
    return {
      id: String(group?.id || uid()),
      name: String(group?.name || "").trim().slice(0, 80),
      classIds,
      createdAt: String(group?.createdAt || new Date().toISOString()),
      updatedAt: String(group?.updatedAt || new Date().toISOString())
    };
  }

  function normalize(data) {
    const input = data && typeof data === "object" ? data : {};
    const seenClasses = new Set();
    const groups = [];
    for (const raw of Array.isArray(input.groups) ? input.groups : []) {
      const group = normalizeGroup(raw);
      if (!group.name || group.classIds.length < 2) continue;
      group.classIds = group.classIds.filter(id => {
        if (seenClasses.has(id)) return false;
        seenClasses.add(id);
        return true;
      });
      if (group.classIds.length >= 2) groups.push(group);
    }
    return { version: 1, groups };
  }

  function read() {
    try {
      return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
    } catch {
      return normalize({});
    }
  }

  function write(data, detail = {}) {
    const normalized = normalize(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { ...detail, data: clone(normalized) } }));
    return clone(normalized);
  }

  function getGroups() {
    return clone(read().groups);
  }

  function getGroup(groupId) {
    return clone(read().groups.find(group => group.id === String(groupId)) || null);
  }

  function getGroupForClass(classId) {
    const id = String(classId);
    return clone(read().groups.find(group => group.classIds.includes(id)) || null);
  }

  function saveGroup(input) {
    const name = String(input?.name || "").trim();
    const classIds = [...new Set((input?.classIds || []).map(String))];
    if (!name) throw new Error("Enter a name for the class group.");
    if (classIds.length < 2) throw new Error("Choose at least two classes for a class group.");

    const data = read();
    const now = new Date().toISOString();
    const id = String(input?.id || uid());
    const existing = data.groups.find(group => group.id === id);

    // One class can belong to only one group. Saving a group moves selected
    // classes out of other groups rather than creating ambiguous Agenda scope.
    data.groups = data.groups
      .filter(group => group.id !== id)
      .map(group => ({ ...group, classIds: group.classIds.filter(classId => !classIds.includes(classId)) }))
      .filter(group => group.classIds.length >= 2);

    data.groups.push(normalizeGroup({
      id,
      name,
      classIds,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }));

    return write(data, { type: existing ? "group-updated" : "group-created", groupId: id });
  }

  function deleteGroup(groupId) {
    const id = String(groupId);
    const data = read();
    data.groups = data.groups.filter(group => group.id !== id);
    return write(data, { type: "group-deleted", groupId: id });
  }

  function describeGroup(group) {
    if (!group) return "";
    const labels = group.classIds.map(id => {
      const info = window.DashboardData?.getClass?.(id);
      return info?.name || `Period ${id}`;
    });
    return labels.join(" · ");
  }

  window.ClassGroups = Object.freeze({
    storageKey: STORAGE_KEY,
    changeEvent: CHANGE_EVENT,
    getGroups,
    getGroup,
    getGroupForClass,
    saveGroup,
    deleteGroup,
    describeGroup
  });
})();
