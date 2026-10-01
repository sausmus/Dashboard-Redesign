(function (global) {
  "use strict";

  function normalizeStudent(student, classInfo, index = 0) {
    const normalized = typeof student === "string"
      ? { id: `manual-${classInfo.id}-${index}`, name: student }
      : (student || {});
    if (!normalized.name) return null;
    return {
      ...normalized,
      id: String(normalized.id ?? `manual-${classInfo.id}-${index}`),
      name: String(normalized.name).trim(),
      classId: String(classInfo.id),
      className: String(classInfo.name || `Period ${classInfo.id}`),
      periodLabel: periodLabel(classInfo)
    };
  }

  function periodLabel(classInfo) {
    const id = String(classInfo?.id ?? "").trim();
    if (/^\d+$/.test(id)) return `P${id}`;
    const name = String(classInfo?.name || "");
    const match = name.match(/\b(?:period|p)\s*(\d+)\b/i);
    if (match) return `P${match[1]}`;
    return name || id || "Class";
  }

  function allStudents(options = {}) {
    if (!global.DashboardData) return [];
    const classId = options.classId == null ? "" : String(options.classId);
    const excludeIds = new Set((options.excludeStudentIds || []).map(String));
    const classes = global.DashboardData.getClasses?.({ activeOnly: true }) || [];
    const rows = [];
    classes.forEach(classInfo => {
      if (classId && String(classInfo.id) !== classId) return;
      const roster = global.DashboardData.getStudents?.(classInfo.id) || [];
      roster.forEach((student, index) => {
        const item = normalizeStudent(student, classInfo, index);
        if (!item || !item.name || excludeIds.has(item.id)) return;
        rows.push(item);
      });
    });
    return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.periodLabel.localeCompare(b.periodLabel, undefined, { numeric: true }));
  }

  function rankedMatches(query, options = {}) {
    const value = String(query || "").trim().toLocaleLowerCase();
    if (!value) return [];
    const selectedKeys = new Set((options.selected || []).map(item => `${item.classId}\u0000${item.id}`));
    return allStudents(options)
      .map(student => {
        const name = student.name.toLocaleLowerCase();
        const tokens = name.split(/\s+/);
        const rank = name.startsWith(value) ? 0 : tokens.some(token => token.startsWith(value)) ? 1 : name.includes(value) ? 2 : 99;
        return { student, rank };
      })
      .filter(item => item.rank < 99 && !selectedKeys.has(`${item.student.classId}\u0000${item.student.id}`))
      .sort((a, b) => a.rank - b.rank || a.student.name.localeCompare(b.student.name, undefined, { sensitivity: "base" }))
      .slice(0, Math.max(1, Number(options.maxResults) || 8))
      .map(item => item.student);
  }

  function create(options = {}) {
    const input = options.input;
    const results = options.results;
    if (!input || !results) throw new Error("Student search needs an input and results container.");

    const multiple = options.multiple === true;
    const selectedContainer = options.selectedContainer || null;
    let selected = [];
    let activeIndex = -1;
    let rendered = [];
    let destroyed = false;

    function dynamicClassId() {
      return typeof options.classId === "function" ? String(options.classId() || "") : String(options.classId || "");
    }

    function dynamicExclusions() {
      const ids = typeof options.excludeStudentIds === "function" ? options.excludeStudentIds() : options.excludeStudentIds;
      return (ids || []).map(String);
    }

    function notify() {
      if (typeof options.onChange === "function") options.onChange(getSelected());
    }

    function getSelected() {
      return multiple ? selected.map(item => ({ ...item })) : (selected[0] ? { ...selected[0] } : null);
    }

    function findStudent(classId, studentId) {
      return allStudents({ classId: classId || dynamicClassId(), excludeStudentIds: [] })
        .find(item => String(item.classId) === String(classId) && String(item.id) === String(studentId)) || null;
    }

    function renderSelected() {
      if (!selectedContainer) return;
      selectedContainer.replaceChildren();
      if (!multiple || !selected.length) {
        selectedContainer.hidden = true;
        return;
      }
      selectedContainer.hidden = false;
      selected.forEach(student => {
        const chip = document.createElement("span");
        chip.className = "td-student-search-chip";
        const label = document.createElement("span");
        label.textContent = `${student.name} · ${student.periodLabel}`;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "td-student-search-chip-remove";
        remove.setAttribute("aria-label", `Remove ${student.name}`);
        remove.textContent = "×";
        remove.addEventListener("click", () => {
          selected = selected.filter(item => !(String(item.id) === String(student.id) && String(item.classId) === String(student.classId)));
          renderSelected();
          renderResults();
          notify();
          input.focus();
        });
        chip.append(label, remove);
        selectedContainer.appendChild(chip);
      });
    }

    function closeResults() {
      rendered = [];
      activeIndex = -1;
      results.replaceChildren();
      results.classList.remove("visible");
    }

    function selectStudent(student, { silent = false } = {}) {
      if (!student) return;
      if (multiple) {
        const key = `${student.classId}\u0000${student.id}`;
        if (!selected.some(item => `${item.classId}\u0000${item.id}` === key)) selected.push(student);
        input.value = "";
      } else {
        selected = [student];
        input.value = student.name;
      }
      closeResults();
      renderSelected();
      if (!silent) {
        if (typeof options.onSelect === "function") options.onSelect({ ...student });
        notify();
      }
    }

    function renderResults() {
      if (destroyed) return;
      const query = input.value.trim();
      if (!query) {
        closeResults();
        return;
      }
      rendered = rankedMatches(query, {
        classId: dynamicClassId(),
        excludeStudentIds: dynamicExclusions(),
        selected,
        maxResults: options.maxResults || 8
      });
      results.replaceChildren();
      activeIndex = -1;
      rendered.forEach(student => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "td-student-search-result";
        const name = document.createElement("span");
        name.className = "td-student-search-result-name";
        name.textContent = student.name;
        const period = document.createElement("span");
        period.className = "td-student-search-result-period";
        period.textContent = `· ${student.periodLabel}`;
        button.append(name, period);
        button.addEventListener("mousedown", event => {
          event.preventDefault();
          selectStudent(student);
        });
        results.appendChild(button);
      });
      results.classList.toggle("visible", rendered.length > 0);

      if (!multiple) {
        const exact = allStudents({ classId: dynamicClassId(), excludeStudentIds: dynamicExclusions() })
          .filter(student => student.name.toLocaleLowerCase() === query.toLocaleLowerCase());
        if (exact.length === 1) {
          selected = [exact[0]];
          renderSelected();
          notify();
        } else if (selected[0] && selected[0].name.toLocaleLowerCase() !== query.toLocaleLowerCase()) {
          selected = [];
          renderSelected();
          notify();
        }
      }
    }

    function handleKeydown(event) {
      const buttons = [...results.querySelectorAll(".td-student-search-result")];
      if (!buttons.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        activeIndex = Math.min(activeIndex + 1, buttons.length - 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
      } else if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        selectStudent(rendered[activeIndex]);
        return;
      } else if (event.key === "Escape") {
        closeResults();
        return;
      } else return;
      buttons.forEach((button, index) => button.classList.toggle("active", index === activeIndex));
      buttons[activeIndex]?.scrollIntoView({ block: "nearest" });
    }

    function clear({ keepInput = false, silent = false } = {}) {
      selected = [];
      if (!keepInput) input.value = "";
      closeResults();
      renderSelected();
      if (!silent) notify();
    }

    function setSelected(value, { silent = true } = {}) {
      const values = Array.isArray(value) ? value : (value ? [value] : []);
      selected = values.map(item => {
        if (!item) return null;
        if (item.name && item.classId != null && item.id != null) {
          const classInfo = global.DashboardData?.getClass?.(String(item.classId));
          return {
            ...item,
            id: String(item.id),
            classId: String(item.classId),
            className: item.className || classInfo?.name || `Period ${item.classId}`,
            periodLabel: item.periodLabel || periodLabel(classInfo || { id: item.classId, name: item.className })
          };
        }
        return findStudent(item.classId, item.id);
      }).filter(Boolean);
      if (!multiple) selected = selected.slice(0, 1);
      if (!multiple) input.value = selected[0]?.name || "";
      else input.value = "";
      closeResults();
      renderSelected();
      if (!silent) notify();
    }

    function refresh() {
      const current = selected.map(item => findStudent(item.classId, item.id)).filter(Boolean);
      selected = multiple ? current : current.slice(0, 1);
      if (!multiple && selected[0]) input.value = selected[0].name;
      renderSelected();
      renderResults();
    }

    const onInput = () => renderResults();
    const onBlur = () => setTimeout(closeResults, 120);
    input.addEventListener("input", onInput);
    input.addEventListener("blur", onBlur);
    input.addEventListener("keydown", handleKeydown);

    renderSelected();

    return Object.freeze({
      getSelected,
      setSelected,
      clear,
      refresh,
      renderResults,
      closeResults,
      destroy() {
        destroyed = true;
        input.removeEventListener("input", onInput);
        input.removeEventListener("blur", onBlur);
        input.removeEventListener("keydown", handleKeydown);
        closeResults();
      }
    });
  }

  global.TeacherDashboardStudentSearch = Object.freeze({
    create,
    allStudents,
    search: rankedMatches,
    periodLabel
  });
})(window);
