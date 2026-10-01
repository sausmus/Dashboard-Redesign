(() => {
  "use strict";

  const CLIENT_ID_KEY = "teacherDashboard.classroomOAuthClientId.v1";
  const CONSENT_KEY = "teacherDashboard.googleCalendarConsent.v1";
  const SESSION_KEY = "teacherDashboard.googleCalendarSession.v1";
  const GIS_SRC = "https://accounts.google.com/gsi/client";
  const SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
  const API_ROOT = "https://www.googleapis.com/calendar/v3";
  const CHANGE_EVENT = "teacher-dashboard-google-calendar-changed";

  let accessToken = "";
  let expiresAt = 0;
  let gisLoadPromise = null;

  function restoreSession() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
      const token = String(saved?.accessToken || "");
      const expiry = Number(saved?.expiresAt || 0);
      if (token && expiry > Date.now() + 60_000) {
        accessToken = token;
        expiresAt = expiry;
        return true;
      }
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    }
    return false;
  }

  function persistSession() {
    try {
      if (accessToken && expiresAt) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken, expiresAt }));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {}
  }

  restoreSession();

  function getClientId() { return String(localStorage.getItem(CLIENT_ID_KEY) || "").trim(); }
  function hasConsentHint() { return localStorage.getItem(CONSENT_KEY) === "true"; }
  function isConnected() { return Boolean(accessToken && Date.now() < expiresAt - 60_000); }
  function clearSession() {
    accessToken = "";
    expiresAt = 0;
    persistSession();
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { type: "disconnected" } }));
  }
  function ensureGoogleIdentityLibrary() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (gisLoadPromise) return gisLoadPromise;
    gisLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", () => reject(new Error("Google Identity Services could not be loaded.")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Google Identity Services could not be loaded."));
      document.head.appendChild(script);
    });
    return gisLoadPromise;
  }
  async function connect(options = {}) {
    const clientId = getClientId();
    if (!clientId) throw new Error("Save your Google OAuth Web Client ID in Settings first.");
    if (isConnected() && !options.force) return { connected: true, expiresAt };
    await ensureGoogleIdentityLibrary();
    return new Promise((resolve, reject) => {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: response => {
          if (response?.error) {
            clearSession();
            reject(new Error(response.error_description || response.error || "Google Calendar authorization failed."));
            return;
          }
          accessToken = String(response?.access_token || "");
          if (!accessToken) {
            reject(new Error("Google did not return a Calendar access token."));
            return;
          }
          expiresAt = Date.now() + Math.max(60, Number(response?.expires_in) || 3600) * 1000;
          persistSession();
          const granted = google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE);
          if (!granted) {
            clearSession();
            reject(new Error("Allow read-only Calendar event access to show events in Today."));
            return;
          }
          localStorage.setItem(CONSENT_KEY, "true");
          window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { type: "connected" } }));
          resolve({ connected: true, expiresAt });
        },
        error_callback: error => reject(new Error(error?.message || error?.type || "Google Calendar authorization was canceled."))
      });
      tokenClient.requestAccessToken({ prompt: options.silent ? "" : (hasConsentHint() ? "" : "consent") });
    });
  }
  async function request(path, params = {}) {
    if (!isConnected()) throw new Error("Connect Google Calendar first.");
    const url = new URL(API_ROOT + path);
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });
    const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
    if (response.status === 401) {
      clearSession();
      throw new Error("Your Google Calendar session expired. Reconnect Calendar.");
    }
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) throw new Error(body?.error?.message || `Google Calendar request failed (${response.status}).`);
    return body;
  }
  function dayBounds(dateValue) {
    const date = dateValue instanceof Date ? new Date(dateValue) : new Date(dateValue || Date.now());
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return { start, end };
  }
  async function listEventsForDay(dateValue = new Date()) {
    const { start, end } = dayBounds(dateValue);
    const body = await request('/calendars/primary/events', {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      showDeleted: false,
      maxResults: 50
    });
    return Array.isArray(body?.items) ? body.items : [];
  }

  window.CalendarService = Object.freeze({
    scope: SCOPE,
    changeEvent: CHANGE_EVENT,
    getClientId,
    hasConsentHint,
    isConnected,
    connect,
    clearSession,
    restoreSession,
    listEventsForDay
  });
})();
