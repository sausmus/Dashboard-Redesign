(() => {
  "use strict";

  if (!window.BellService) {
    console.error("Global Bell requires shared/bell-service.js to load first.");
    return;
  }

  const HOST_ID = "teacherDashboardGlobalBell";
  const QUICK_MINUTES = [20, 15, 10, 5];

  let host = null;
  let root = null;
  let summaryButton = null;
  let labelEl = null;
  let timeEl = null;
  let contextEl = null;
  let scheduleSelect = null;
  let customInput = null;
  let customButton = null;
  let statusEl = null;
  let stopButton = null;
  let renderTimer = null;

  const chevronSvg = `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m4 6 4 4 4-4"></path>
    </svg>`;

  function compactLabel(snapshot) {
    if (!snapshot) return "Bell";
    if (snapshot.countdownType === "schoolStart") return "First bell";
    if (snapshot.countdownType === "passingPeriod") return "Passing";

    const name = String(snapshot.entry?.name || "Bell").trim();
    const periodMatch = name.match(/^Period\s+(\d+)$/i);
    if (periodMatch) return `P${periodMatch[1]}`;
    return name;
  }

  function contextText(snapshot) {
    if (!snapshot) return "Bell schedule";

    const clock = BellService.formatClockTime(snapshot.targetTime);
    if (snapshot.countdownType === "schoolStart") {
      return `${snapshot.targetDayLabel} · ${snapshot.scheduleLabel} · first bell ${clock}`;
    }
    if (snapshot.countdownType === "passingPeriod") {
      return `${snapshot.scheduleLabel} · passing ends ${clock}`;
    }
    return `${snapshot.entry?.name || "Current period"} · ends ${clock}`;
  }

  function markup() {
    const prefs = BellService.getPreferences();

    return `
      <div class="td-global-bell">
        <button
          class="td-global-bell-summary"
          type="button"
          aria-expanded="false"
          aria-controls="tdGlobalBellPanel"
          title="Bell countdown and alarms">
          <span class="td-global-bell-indicator" aria-hidden="true"></span>
          <span class="td-global-bell-label">Bell</span>
          <span class="td-global-bell-time">--:--</span>
          <span class="td-global-bell-chevron" aria-hidden="true">${chevronSvg}</span>
        </button>

        <div class="td-global-bell-panel" id="tdGlobalBellPanel" role="dialog" aria-label="Bell alarms">
          <div class="td-global-bell-panel-head">
            <div>
              <h2 class="td-global-bell-panel-title">Bell alarms</h2>
              <p class="td-global-bell-context">Loading schedule…</p>
            </div>
          </div>

          <span class="td-global-bell-section-label">Ring when this much time remains</span>
          <div class="td-global-bell-quick">
            ${QUICK_MINUTES.map(minutes => `
              <button class="td-global-bell-alarm-button" type="button" data-minutes="${minutes}" aria-pressed="false">
                ${minutes} min
              </button>`).join("")}
          </div>

          <div class="td-global-bell-custom-row">
            <input
              class="td-global-bell-custom-input"
              type="number"
              min="1"
              max="180"
              step="1"
              inputmode="numeric"
              value="${prefs.customWarningMinutes}"
              aria-label="Custom minutes before bell"
              placeholder="Custom minutes">
            <button class="td-global-bell-custom-button" type="button">Arm</button>
          </div>

          <div class="td-global-bell-status" aria-live="polite"></div>

          <div class="td-global-bell-divider"></div>

          <div class="td-global-bell-schedule-row">
            <span class="td-global-bell-section-label">Schedule</span>
            <select class="td-global-bell-schedule" aria-label="Bell schedule">
              <option value="auto">Auto</option>
              <option value="regular">Regular</option>
              <option value="lateStart">Late Start</option>
              <option value="minimum">Minimum Day</option>
            </select>
          </div>

          <button class="td-global-bell-stop" type="button">Stop ringing</button>
        </div>
      </div>`;
  }

  function setOpen(open) {
    if (!root || !summaryButton) return;
    root.classList.toggle("open", Boolean(open));
    summaryButton.setAttribute("aria-expanded", String(Boolean(open)));
  }

  function showMessage(message = "", isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle("error", Boolean(isError));
  }

  async function toggleMinutes(minutes) {
    try {
      await BellService.enableAudio();
      BellService.toggleWarning(minutes);
      showMessage("");
    } catch (error) {
      showMessage(error?.message || "That alarm could not be armed.", true);
    }
    render();
  }

  function bind() {
    summaryButton = root.querySelector(".td-global-bell-summary");
    labelEl = root.querySelector(".td-global-bell-label");
    timeEl = root.querySelector(".td-global-bell-time");
    contextEl = root.querySelector(".td-global-bell-context");
    scheduleSelect = root.querySelector(".td-global-bell-schedule");
    customInput = root.querySelector(".td-global-bell-custom-input");
    customButton = root.querySelector(".td-global-bell-custom-button");
    statusEl = root.querySelector(".td-global-bell-status");
    stopButton = root.querySelector(".td-global-bell-stop");

    summaryButton.addEventListener("click", event => {
      event.stopPropagation();
      setOpen(!root.classList.contains("open"));
    });

    root.querySelector(".td-global-bell-panel").addEventListener("click", event => {
      event.stopPropagation();
    });

    root.querySelectorAll(".td-global-bell-alarm-button").forEach(button => {
      button.addEventListener("click", () => toggleMinutes(Number(button.dataset.minutes)));
    });

    customButton.addEventListener("click", async () => {
      const minutes = Math.floor(Number(customInput.value));
      try {
        if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) {
          throw new Error("Enter a custom alarm from 1 to 180 minutes.");
        }
        BellService.setPreferences({ customWarningMinutes: minutes });
        await toggleMinutes(minutes);
      } catch (error) {
        showMessage(error?.message || "Enter a valid number of minutes.", true);
      }
    });

    customInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        customButton.click();
      }
    });

    customInput.addEventListener("input", () => {
      showMessage("");
      render();
    });

    scheduleSelect.addEventListener("change", () => {
      BellService.setScheduleMode(scheduleSelect.value);
      showMessage("");
      render();
    });

    stopButton.addEventListener("click", event => {
      event.stopPropagation();
      BellService.stopAlarm();
      showMessage("Alarm stopped.");
      render();
    });

    document.addEventListener("click", event => {
      if (root?.classList.contains("open") && !root.contains(event.target)) setOpen(false);
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && root?.classList.contains("open")) {
        setOpen(false);
        summaryButton.focus();
      }
    });

    window.addEventListener(BellService.changeEvent, render);
    if (window.DashboardData?.changeEvent) {
      window.addEventListener(DashboardData.changeEvent, render);
    }

    document.addEventListener("fullscreenchange", moveIntoFullscreenContext);
  }

  function render() {
    if (!root) return;

    const snapshot = BellService.getSnapshot();
    const warnings = BellService.getWarnings();
    const alarmActive = BellService.isAlarmActive();
    const label = compactLabel(snapshot);

    labelEl.textContent = label;
    timeEl.textContent = snapshot?.displayCountdown || "--:--";
    contextEl.textContent = contextText(snapshot);

    summaryButton.setAttribute(
      "aria-label",
      `${label}, ${snapshot?.displayCountdown || "countdown unavailable"}. Open bell alarms.`
    );

    scheduleSelect.value = snapshot?.scheduleMode || "auto";

    root.classList.toggle("has-armed", warnings.some(item => item.status === "armed"));
    root.classList.toggle("alarm-active", alarmActive);

    root.querySelectorAll(".td-global-bell-alarm-button").forEach(button => {
      const minutes = Number(button.dataset.minutes);
      const warning = warnings.find(item => item.minutes === minutes);
      const armed = warning?.status === "armed";
      const fired = warning?.status === "fired";

      button.classList.toggle("armed", armed);
      button.classList.toggle("fired", fired);
      button.setAttribute("aria-pressed", String(armed));
      button.textContent = armed ? `✓ ${minutes}` : `${minutes} min`;
    });

    const customMinutes = Math.floor(Number(customInput.value));
    const customWarning = warnings.find(item => item.minutes === customMinutes);
    const customArmed = customWarning?.status === "armed";
    customButton.classList.toggle("armed", customArmed);
    customButton.textContent = customArmed ? `✓ ${customMinutes} min` : "Arm";

    const armed = warnings.filter(item => item.status === "armed");
    if (!statusEl.classList.contains("error")) {
      if (armed.length) {
        const values = armed.map(item => `${item.minutes} min`).join(" · ");
        statusEl.textContent = `Armed: ${values}`;
      } else if (statusEl.textContent !== "Alarm stopped.") {
        statusEl.textContent = "No alarms armed.";
      }
    }

    stopButton.classList.toggle("visible", alarmActive);
  }

  function moveIntoFullscreenContext() {
    if (!host) return;
    const target = document.fullscreenElement || document.body;
    if (target && host.parentElement !== target) target.appendChild(host);
  }

  function mount() {
    const existing = document.getElementById(HOST_ID);
    if (existing) {
      host = existing;
      root = host.querySelector(".td-global-bell");
      return;
    }

    host = document.createElement("div");
    host.id = HOST_ID;
    host.className = "td-global-bell-host";
    host.setAttribute("data-global-bell", "");
    host.innerHTML = markup();
    document.body.appendChild(host);

    root = host.querySelector(".td-global-bell");
    bind();
    render();

    renderTimer = window.setInterval(render, 250);
  }

  function destroy() {
    if (renderTimer) window.clearInterval(renderTimer);
    renderTimer = null;
    host?.remove();
    host = null;
    root = null;
  }

  window.TeacherDashboardGlobalBell = Object.freeze({
    mount,
    render,
    close: () => setOpen(false),
    destroy
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
