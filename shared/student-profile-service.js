(function (global) {
  "use strict";

  const STORAGE_KEY = "teacherDashboard.studentProfiles.v1";
  const CHANGE_EVENT = "teacher-dashboard-student-profiles-changed";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makeId() {
    return global.crypto?.randomUUID?.() || `note:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
  }

  function normalizeId(value) {
    return String(value ?? "").trim();
  }

  function normalizeNote(note = {}) {
    const text = String(note.text ?? note.note ?? "").trim();
    return {
      id: normalizeId(note.id) || makeId(),
      text,
      createdAt: String(note.createdAt || new Date().toISOString()),
      updatedAt: String(note.updatedAt || "")
    };
  }

  function pairKey(a, b) {
    const ids = [normalizeId(a), normalizeId(b)].filter(Boolean).sort();
    return ids.length === 2 && ids[0] !== ids[1] ? `${ids[0]}\u0000${ids[1]}` : "";
  }

  function normalizeState(raw = {}) {
    const profiles = {};
    const rawProfiles = raw.profiles && typeof raw.profiles === "object" && !Array.isArray(raw.profiles)
      ? raw.profiles
      : {};

    Object.entries(rawProfiles).forEach(([classId, classProfiles]) => {
      if (!classProfiles || typeof classProfiles !== "object" || Array.isArray(classProfiles)) return;
      const normalizedClass = {};
      Object.entries(classProfiles).forEach(([studentId, profile]) => {
        const sid = normalizeId(studentId);
        if (!sid) return;
        const notes = Array.isArray(profile?.notes)
          ? profile.notes.map(normalizeNote).filter(note => note.text)
          : [];
        normalizedClass[sid] = { notes };
      });
      profiles[String(classId)] = normalizedClass;
    });

    const pairings = {};
    const rawPairings = raw.pairings && typeof raw.pairings === "object" && !Array.isArray(raw.pairings)
      ? raw.pairings
      : {};

    Object.entries(rawPairings).forEach(([classId, pairs]) => {
      const seen = new Set();
      pairings[String(classId)] = [];
      (Array.isArray(pairs) ? pairs : []).forEach(pair => {
        const a = normalizeId(pair?.a ?? pair?.[0]);
        const b = normalizeId(pair?.b ?? pair?.[1]);
        const key = pairKey(a, b);
        if (!key || seen.has(key)) return;
        seen.add(key);
        const [first, second] = key.split("\u0000");
        pairings[String(classId)].push({ a: first, b: second });
      });
    });

    return { version: 1, profiles, pairings };
  }

  function read() {
    try {
      return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
    } catch (error) {
      console.warn("StudentProfileService could not load student profile data.", error);
      return normalizeState({});
    }
  }

  function write(state, detail = {}) {
    const normalized = normalizeState(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    global.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { ...detail, state: clone(normalized) } }));
    return clone(normalized);
  }

  function ensureProfile(state, classId, studentId) {
    const cid = normalizeId(classId);
    const sid = normalizeId(studentId);
    if (!cid || !sid) throw new Error("Student profile is missing a class or student id.");
    state.profiles[cid] ||= {};
    state.profiles[cid][sid] ||= { notes: [] };
    state.profiles[cid][sid].notes ||= [];
    return state.profiles[cid][sid];
  }

  function getProfile(classId, studentId) {
    const state = read();
    const cid = normalizeId(classId);
    const sid = normalizeId(studentId);
    const notes = state.profiles?.[cid]?.[sid]?.notes || [];
    return {
      notes: clone(notes),
      avoidPairingWith: getAvoidPairing(classId, studentId, state)
    };
  }

  function addNote(classId, studentId, text) {
    const value = String(text || "").trim();
    if (!value) throw new Error("Enter a note first.");
    const state = read();
    const profile = ensureProfile(state, classId, studentId);
    const note = normalizeNote({ id: makeId(), text: value, createdAt: new Date().toISOString() });
    profile.notes.push(note);
    write(state, { type: "note-added", classId: String(classId), studentId: String(studentId), noteId: note.id });
    return clone(note);
  }

  function updateNote(classId, studentId, noteId, text) {
    const value = String(text || "").trim();
    if (!value) throw new Error("A note cannot be blank.");
    const state = read();
    const profile = ensureProfile(state, classId, studentId);
    const index = profile.notes.findIndex(note => String(note.id) === String(noteId));
    if (index < 0) return null;
    profile.notes[index] = normalizeNote({
      ...profile.notes[index],
      text: value,
      updatedAt: new Date().toISOString()
    });
    write(state, { type: "note-updated", classId: String(classId), studentId: String(studentId), noteId: String(noteId) });
    return clone(profile.notes[index]);
  }

  function deleteNote(classId, studentId, noteId) {
    const state = read();
    const profile = ensureProfile(state, classId, studentId);
    const next = profile.notes.filter(note => String(note.id) !== String(noteId));
    if (next.length === profile.notes.length) return false;
    profile.notes = next;
    write(state, { type: "note-deleted", classId: String(classId), studentId: String(studentId), noteId: String(noteId) });
    return true;
  }

  function getAvoidPairing(classId, studentId, existingState = null) {
    const state = existingState || read();
    const cid = normalizeId(classId);
    const sid = normalizeId(studentId);
    if (!cid || !sid) return [];
    const ids = [];
    (state.pairings?.[cid] || []).forEach(pair => {
      if (pair.a === sid) ids.push(pair.b);
      else if (pair.b === sid) ids.push(pair.a);
    });
    return [...new Set(ids)];
  }

  function setAvoidPairing(classId, studentId, studentIds = []) {
    const cid = normalizeId(classId);
    const sid = normalizeId(studentId);
    if (!cid || !sid) throw new Error("Student profile is missing a class or student id.");
    const desired = [...new Set((studentIds || []).map(normalizeId).filter(id => id && id !== sid))];
    const state = read();
    state.pairings[cid] ||= [];
    const kept = state.pairings[cid].filter(pair => pair.a !== sid && pair.b !== sid);
    desired.forEach(otherId => {
      const key = pairKey(sid, otherId);
      if (!key) return;
      const [a, b] = key.split("\u0000");
      kept.push({ a, b });
    });
    state.pairings[cid] = kept;
    write(state, { type: "pairings-updated", classId: cid, studentId: sid });
    return getAvoidPairing(cid, sid);
  }

  function hasPairingConflict(classId, firstStudentId, secondStudentId) {
    const cid = normalizeId(classId);
    const key = pairKey(firstStudentId, secondStudentId);
    if (!cid || !key) return false;
    return (read().pairings?.[cid] || []).some(pair => pairKey(pair.a, pair.b) === key);
  }

  function getPairings(classId) {
    const cid = normalizeId(classId);
    return clone(read().pairings?.[cid] || []);
  }

  global.addEventListener("storage", event => {
    if (event.key === STORAGE_KEY) {
      global.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { type: "storage" } }));
    }
  });

  global.StudentProfileService = Object.freeze({
    storageKey: STORAGE_KEY,
    changeEvent: CHANGE_EVENT,
    getProfile,
    addNote,
    updateNote,
    deleteNote,
    getAvoidPairing,
    setAvoidPairing,
    hasPairingConflict,
    getPairings
  });
})(window);
