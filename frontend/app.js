(function () {
  "use strict";
  var API_BASE = (window.location.origin && window.location.origin.indexOf("file") !== 0)
    ? window.location.origin + "/api/users"
    : "/api/users";
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var elements = {
    suggestionsSkeletons: $("#suggestions-skeletons"),
    suggestionsContent: $("#suggestions-content"),
    aiSummary: $("#ai-summary"),
    aiSmartTask: $("#ai-smart-task"),
    tasksSkeletons: $("#tasks-skeletons"),
    tasksList: $("#tasks-list"),
    tasksEmpty: $("#tasks-empty"),
    doneSkeletons: $("#done-skeletons"),
    doneList: $("#done-list"),
    doneEmpty: $("#done-empty"),
    taskForm: $("#task-form"),
    addTaskBtn: $("#add-task-btn"),
    emptyAddTaskBtn: $("#empty-add-task-btn"),
    cancelTaskBtn: $("#cancel-task-btn"),
    taskTitle: $("#task-title"),
    taskDescription: $("#task-description"),
    taskDue: $("#task-due"),
    taskDuration: $("#task-duration"),
    toast: $("#toast"),
  };
  var editingId = null;
  var THEME_KEY = "studyflow-theme";
  var STREAK_KEY = "studyflow-streak";
  var currentTasks = [];

  function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
  }
  function getYesterdayStr() {
    return new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  }
  function recordCompletionDay() {
    var today = getTodayStr();
    var yesterday = getYesterdayStr();
    var raw = null;
    try { raw = localStorage.getItem(STREAK_KEY); } catch (_) {}
    var data = { lastDate: today, count: 1 };
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        var last = parsed.lastDate;
        if (last === today) return;
        if (last === yesterday) data.count = (parsed.count || 0) + 1;
      } catch (_) {}
    }
    try { localStorage.setItem(STREAK_KEY, JSON.stringify(data)); } catch (_) {}
  }
  function getStreakCount() {
    var today = getTodayStr();
    var yesterday = getYesterdayStr();
    var raw = null;
    try { raw = localStorage.getItem(STREAK_KEY); } catch (_) {}
    if (!raw) return 0;
    try {
      var parsed = JSON.parse(raw);
      var last = parsed.lastDate;
      if (last !== today && last !== yesterday) return 0;
      return Math.max(0, parseInt(parsed.count, 10) || 0);
    } catch (_) { return 0; }
  }
  function updateStreakStats() {
    var streakEl = document.getElementById("streak-value");
    var totalEl = document.getElementById("stats-total-done");
    if (streakEl) streakEl.textContent = String(getStreakCount());
    if (totalEl) totalEl.textContent = String((currentTasks.filter(function (t) { return isCompleted(t); }).length));
  }
  function applyTheme(theme) {
    var isLight = theme === "light";
    document.documentElement.setAttribute("data-theme", isLight ? "light" : "dark");
    var btn = $("#theme-toggle");
    if (btn) {
      btn.textContent = isLight ? "Dark" : "Light";
      btn.setAttribute("aria-label", isLight ? "Switch to dark mode" : "Switch to light mode");
    }
    try { localStorage.setItem(THEME_KEY, isLight ? "light" : "dark"); } catch (_) {}
  }

  (function initTheme() {
    try {
      var saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") applyTheme(saved);
      else applyTheme("dark");
    } catch (_) { applyTheme("dark"); }
  })();

  var themeBtn = $("#theme-toggle");
  if (themeBtn) themeBtn.addEventListener("click", function () {
    var current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "light" ? "dark" : "light");
  });

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }
  function showToast(msg, type) {
    var t = elements.toast;
    t.textContent = msg;
    t.className = "toast show " + (type || "");
    clearTimeout(t._tid);
    t._tid = setTimeout(function () { t.classList.remove("show"); }, 3000);
  }
  function getSuggestionsContainer() {
    return $("#suggestions-content") || $(".suggestions-wrap");
  }

  function renderAiSection(ai) {
    if (!ai) return;
    var summary = ai.summary || "";
    var smartTask = ai.smart_task || "";
    var list = Array.isArray(ai.suggestions) ? ai.suggestions : [];
    if (elements.suggestionsSkeletons) elements.suggestionsSkeletons.classList.add("hidden");
    if (elements.aiSummary) {
      elements.aiSummary.textContent = summary;
      elements.aiSummary.classList.toggle("hidden", !summary);
    }
    if (elements.aiSmartTask) {
      elements.aiSmartTask.innerHTML = smartTask
        ? '<div class="smart-label">Suggested next</div><p class="smart-text">' + escapeHtml(smartTask) + '</p><button type="button" class="btn btn-primary btn-add-suggestion">Add as task</button>'
        : "";
      elements.aiSmartTask.classList.toggle("hidden", !smartTask);
      if (smartTask) {
        var addBtn = elements.aiSmartTask.querySelector(".btn-add-suggestion");
        if (addBtn) addBtn.addEventListener("click", function () { addSuggestionAsTask(smartTask); });
      }
    }
    var sug = getSuggestionsContainer();
    if (sug) {
      sug.classList.remove("hidden");
      sug.innerHTML = list.map(function (s) {
        var text = String(s);
        return '<div class="suggestion-item"><span class="suggestion-text">' + escapeHtml(text) + '</span><button type="button" class="btn btn-primary btn-add-suggestion" data-title="' + escapeHtml(text) + '">Add</button></div>';
      }).join("");
      sug.querySelectorAll(".btn-add-suggestion").forEach(function (btn) {
        var title = btn.getAttribute("data-title") || "";
        btn.addEventListener("click", function () { addSuggestionAsTask(title); });
      });
    }
  }

  function isCompleted(task) {
    var c = task && task.completed;
    return c === true || c === "true" || c === 1;
  }
  function updateTasksList(tasks) {
    var list = Array.isArray(tasks) ? tasks : [];
    currentTasks = list.slice();
    var pending = list.filter(function (t) { return !isCompleted(t); });
    var completed = list.filter(function (t) { return isCompleted(t); });

    if (elements.tasksSkeletons) elements.tasksSkeletons.classList.add("hidden");
    var doneSkel = document.getElementById("done-skeletons");
    if (doneSkel) doneSkel.classList.add("hidden");

    elements.tasksList.classList.add("hidden");
    elements.tasksList.innerHTML = "";
    if (elements.tasksEmpty) elements.tasksEmpty.classList.add("hidden");
    if (pending.length === 0) {
      if (elements.tasksEmpty) elements.tasksEmpty.classList.remove("hidden");
    } else {
      elements.tasksList.classList.remove("hidden");
      var dayGroups = groupTasksByDay(pending);
      elements.tasksList.innerHTML = dayGroups.map(function (g) {
        return '<div class="day-group">' +
          '<h3 class="day-group-title">' + escapeHtml(g.label) + ' — ' + g.tasks.length + ' task' + (g.tasks.length !== 1 ? 's' : '') + '</h3>' +
          '<div class="day-group-list">' + g.tasks.map(renderTask).join("") + '</div></div>';
      }).join("");
    }

    var doneListEl = document.getElementById("done-list");
    var doneEmptyEl = document.getElementById("done-empty");
    if (doneListEl) {
      doneListEl.classList.add("hidden");
      doneListEl.innerHTML = "";
    }
    if (doneEmptyEl) doneEmptyEl.classList.add("hidden");
    if (completed.length === 0) {
      if (doneEmptyEl) doneEmptyEl.classList.remove("hidden");
    } else if (doneListEl) {
      doneListEl.classList.remove("hidden");
      doneListEl.innerHTML = completed.map(renderTask).join("");
    }

    bindTaskEvents();
    bindDragDrop();
    updateCalendar();
    updateCompletionChart();
    updateStreakStats();
  }
  function getFullOrderedTaskIdsFromDOM() {
    var ids = [];
    var mainList = elements.tasksList;
    if (mainList) {
      mainList.querySelectorAll(".day-group").forEach(function (group) {
        var list = group.querySelector(".day-group-list");
        if (list) {
          list.querySelectorAll(".task-card").forEach(function (card) {
            var id = card.getAttribute("data-id");
            if (id) ids.push(Number(id));
          });
        }
      });
    }
    var doneList = document.getElementById("done-list");
    if (doneList) {
      doneList.querySelectorAll(".task-card").forEach(function (card) {
        var id = card.getAttribute("data-id");
        if (id) ids.push(Number(id));
      });
    }
    return ids;
  }
  function bindDragDrop() {
    var draggedEl = null;
    var dragParent = null;
    var doneListEl = document.getElementById("done-list");
    var doneSectionEl = document.getElementById("done-section");
    function onTaskCardDragStart(e) {
      var card = e.target.closest(".task-card");
      if (!card || e.target.closest("button") || e.target.closest("input[type=checkbox]") || e.target.closest("select")) return;
      draggedEl = card;
      var list = card.closest(".day-group-list");
      dragParent = list || null;
      card.classList.add("task-card-dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", card.getAttribute("data-id"));
      e.dataTransfer.setDragImage(card, 0, 0);
    }
    elements.tasksList.addEventListener("dragstart", onTaskCardDragStart);
    function onTaskCardDragEnd() {
      if (draggedEl) draggedEl.classList.remove("task-card-dragging");
      draggedEl = null;
      dragParent = null;
      if (elements.tasksList) elements.tasksList.querySelectorAll(".task-card-drag-over").forEach(function (el) { el.classList.remove("task-card-drag-over"); });
      if (doneSectionEl) doneSectionEl.classList.remove("done-drop-zone");
    }
    elements.tasksList.addEventListener("dragend", onTaskCardDragEnd);
    elements.tasksList.addEventListener("dragover", function (e) {
      e.preventDefault();
      var card = e.target.closest(".task-card");
      if (!card || !dragParent || card === draggedEl) return;
      var list = card.closest(".day-group-list");
      if (list !== dragParent) return;
      e.dataTransfer.dropEffect = "move";
      elements.tasksList.querySelectorAll(".task-card-drag-over").forEach(function (el) { el.classList.remove("task-card-drag-over"); });
      card.classList.add("task-card-drag-over");
    });
    elements.tasksList.addEventListener("drop", function (e) {
      e.preventDefault();
      var card = e.target.closest(".task-card");
      elements.tasksList.querySelectorAll(".task-card-drag-over").forEach(function (el) { el.classList.remove("task-card-drag-over"); });
      if (!card || !draggedEl || card === draggedEl) return;
      var list = card.closest(".day-group-list");
      if (!list || list !== dragParent) return;
      var allCards = [].slice.call(list.querySelectorAll(".task-card"));
      var fromIdx = allCards.indexOf(draggedEl);
      var toIdx = allCards.indexOf(card);
      if (fromIdx === -1 || toIdx === -1) return;
      if (fromIdx < toIdx) list.insertBefore(draggedEl, card.nextSibling);
      else list.insertBefore(draggedEl, card);
      var taskIds = getFullOrderedTaskIdsFromDOM();
      fetch(API_BASE + "/tasks/reorder/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_ids: taskIds }),
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (tasks) {
          if (Array.isArray(tasks)) updateTasksList(tasks);
          showToast("Order updated", "success");
        })
        .catch(function () { showToast("Could not save order", "error"); updateTasksList(currentTasks); });
      draggedEl = null;
      dragParent = null;
    });
    if (doneSectionEl) {
      doneSectionEl.addEventListener("dragover", function (e) {
        e.preventDefault();
        if (!draggedEl) return;
        var isFromYourTasks = !doneListEl || !doneListEl.contains(draggedEl);
        if (isFromYourTasks) {
          e.dataTransfer.dropEffect = "move";
          doneSectionEl.classList.add("done-drop-zone");
        }
      });
      doneSectionEl.addEventListener("dragleave", function (e) {
        if (!doneSectionEl.contains(e.relatedTarget)) doneSectionEl.classList.remove("done-drop-zone");
      });
      doneSectionEl.addEventListener("drop", function (e) {
        e.preventDefault();
        doneSectionEl.classList.remove("done-drop-zone");
        if (!draggedEl) return;
        var isFromYourTasks = !doneListEl || !doneListEl.contains(draggedEl);
        if (!isFromYourTasks) return;
        var id = Number(draggedEl.getAttribute("data-id"));
        if (!id) return;
        fetch(API_BASE + "/tasks/" + id + "/", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed: true }),
        })
          .then(function (r) {
            if (!r.ok) throw new Error("Update failed");
            return r.json();
          })
          .then(function (updatedTask) {
            recordCompletionDay();
            showToast("Marked as done", "success");
            var found = false;
            for (var i = 0; i < currentTasks.length; i++) {
              if (Number(currentTasks[i].id) === id) {
                currentTasks[i] = updatedTask;
                found = true;
                break;
              }
            }
            if (found) updateTasksList(currentTasks);
            else fetch(API_BASE + "/tasks/").then(function (res) { return res.json(); }).then(updateTasksList);
          })
          .catch(function () { showToast("Could not mark as done", "error"); });
        draggedEl = null;
        dragParent = null;
      });
    }
    if (doneListEl) {
      doneListEl.addEventListener("dragstart", function (e) {
        var card = e.target.closest(".task-card");
        if (!card || e.target.closest("button") || e.target.closest("input[type=checkbox]")) return;
        draggedEl = card;
        dragParent = doneListEl;
        card.classList.add("task-card-dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", card.getAttribute("data-id"));
      });
      doneListEl.addEventListener("dragend", function (e) {
        if (draggedEl) draggedEl.classList.remove("task-card-dragging");
        draggedEl = null;
        dragParent = null;
        doneListEl.querySelectorAll(".task-card-drag-over").forEach(function (el) { el.classList.remove("task-card-drag-over"); });
        if (doneSectionEl) doneSectionEl.classList.remove("done-drop-zone");
      });
      doneListEl.addEventListener("dragover", function (e) {
        e.preventDefault();
        var card = e.target.closest(".task-card");
        if (!card || !dragParent || card === draggedEl || dragParent !== doneListEl) return;
        e.dataTransfer.dropEffect = "move";
        doneListEl.querySelectorAll(".task-card-drag-over").forEach(function (el) { el.classList.remove("task-card-drag-over"); });
        card.classList.add("task-card-drag-over");
      });
      doneListEl.addEventListener("drop", function (e) {
        e.preventDefault();
        var card = e.target.closest(".task-card");
        doneListEl.querySelectorAll(".task-card-drag-over").forEach(function (el) { el.classList.remove("task-card-drag-over"); });
        if (!card || !draggedEl || card === draggedEl) return;
        var allCards = [].slice.call(doneListEl.querySelectorAll(".task-card"));
        var fromIdx = allCards.indexOf(draggedEl);
        var toIdx = allCards.indexOf(card);
        if (fromIdx === -1 || toIdx === -1) return;
        if (fromIdx < toIdx) doneListEl.insertBefore(draggedEl, card.nextSibling);
        else doneListEl.insertBefore(draggedEl, card);
        var taskIds = getFullOrderedTaskIdsFromDOM();
        fetch(API_BASE + "/tasks/reorder/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_ids: taskIds }),
        })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
          .then(function (tasks) {
            if (Array.isArray(tasks)) updateTasksList(tasks);
            showToast("Order updated", "success");
          })
          .catch(function () { updateTasksList(currentTasks); showToast("Could not save order", "error"); });
        draggedEl = null;
        dragParent = null;
      });
    }
  }

  function taskDateString(task) {
    if (task.due_datetime) return String(task.due_datetime).slice(0, 10);
    if (task.due_date) return String(task.due_date).slice(0, 10);
    return null;
  }
  function taskSortKey(task) {
    var d = taskDateString(task);
    if (!d) return "zzzz-no-date";
    var t = "";
    if (task.due_datetime && String(task.due_datetime).length >= 16) t = String(task.due_datetime).slice(11, 16);
    return d + "T" + (t || "23:59");
  }
  function getDayLabel(dateStr) {
    if (!dateStr) return null;
    var today = new Date();
    var todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    var tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    var tomorrowStr = tomorrow.getFullYear() + "-" + String(tomorrow.getMonth() + 1).padStart(2, "0") + "-" + String(tomorrow.getDate()).padStart(2, "0");
    if (dateStr === todayStr) return "Today";
    if (dateStr === tomorrowStr) return "Tomorrow";
    var d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
  }
  function groupTasksByDay(pending) {
    var groups = {};
    var todayStr = new Date().toISOString().slice(0, 10);
    pending.forEach(function (task) {
      var dateStr = taskDateString(task);
      var key = dateStr || "no-date";
      if (!groups[key]) groups[key] = [];
      groups[key].push(task);
    });
    Object.keys(groups).forEach(function (key) {
      groups[key].sort(function (a, b) {
        var oA = a.order != null ? Number(a.order) : 0;
        var oB = b.order != null ? Number(b.order) : 0;
        if (oA !== oB) return oA - oB;
        return taskSortKey(a) > taskSortKey(b) ? 1 : -1;
      });
    });
    var noDate = groups["no-date"] || [];
    delete groups["no-date"];
    var sortedKeys = Object.keys(groups).sort();
    var result = [];
    sortedKeys.forEach(function (k) {
      result.push({ dateStr: k, label: getDayLabel(k), tasks: groups[k] });
    });
    if (noDate.length) result.push({ dateStr: null, label: "No date", tasks: noDate });
    return result;
  }
  var calendarView = { year: new Date().getFullYear(), month: new Date().getMonth() };
  var selectedCalendarDate = null;
  function formatTimeForTask(task) {
    if (task.due_datetime && String(task.due_datetime).length >= 16) {
      var d = new Date(task.due_datetime);
      return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
    return "";
  }
  function showDayDetail(dateStr) {
    var panel = document.getElementById("calendar-day-detail");
    var titleEl = document.getElementById("calendar-day-detail-title");
    var listEl = document.getElementById("calendar-day-detail-list");
    if (!panel || !titleEl || !listEl) return;
    selectedCalendarDate = dateStr;
    var label = getDayLabel(dateStr);
    var d = new Date(dateStr + "T12:00:00");
    var fullLabel = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    titleEl.textContent = fullLabel;
    var tasksOnDay = currentTasks.filter(function (t) {
      var taskD = taskDateString(t);
      return taskD === dateStr;
    });
    tasksOnDay.sort(function (a, b) { return taskSortKey(a) > taskSortKey(b) ? 1 : -1; });
    if (tasksOnDay.length === 0) {
      listEl.innerHTML = "<li>No tasks this day</li>";
    } else {
      listEl.innerHTML = tasksOnDay.map(function (t) {
        var timeStr = formatTimeForTask(t);
        var completed = isCompleted(t);
        return "<li>" + (timeStr ? "<time>" + escapeHtml(timeStr) + "</time> " : "") + escapeHtml(t.title) + (completed ? " <span class=\"task-done-badge\">done</span>" : "") + "</li>";
      }).join("");
    }
    panel.classList.remove("hidden");
    panel.style.display = "block";
  }
  function hideDayDetail() {
    var panel = document.getElementById("calendar-day-detail");
    if (panel) {
      panel.classList.add("hidden");
      panel.style.display = "";
    }
    selectedCalendarDate = null;
  }
  function updateCalendar() {
    var grid = document.getElementById("calendar-grid");
    var monthLabel = document.getElementById("calendar-month-year");
    if (!grid || !monthLabel) return;
    var y = calendarView.year;
    var m = calendarView.month;
    var monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    monthLabel.textContent = monthNames[m] + " " + y;
    var first = new Date(y, m, 1);
    var last = new Date(y, m + 1, 0);
    var startPad = first.getDay();
    var daysInMonth = last.getDate();
    var tasksByDate = {};
    currentTasks.forEach(function (t) {
      var d = taskDateString(t);
      if (d) tasksByDate[d] = (tasksByDate[d] || 0) + 1;
    });
    var today = new Date();
    var todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    var html = "";
    var i;
    for (i = 0; i < startPad; i++) html += '<div class="calendar-day empty"></div>';
    for (i = 1; i <= daysInMonth; i++) {
      var dateStr = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(i).padStart(2, "0");
      var count = tasksByDate[dateStr] || 0;
      var isToday = dateStr === todayStr;
      var isSelected = dateStr === selectedCalendarDate;
      var cls = "calendar-day" + (isToday ? " today" : "") + (count > 0 ? " has-tasks" : "") + (isSelected ? " selected" : "");
      html += '<button type="button" class="' + cls + '" data-date="' + dateStr + '" title="' + (count > 0 ? count + " task(s) — click to view" : "Click to add task") + '"><span class="day-num">' + i + "</span>" + (count > 0 ? '<span class="day-dot"></span>' : "") + (count > 1 ? '<span class="day-count">' + count + '</span>' : "") + "</button>";
    }
    grid.innerHTML = html;
  }
  function calendarNav(delta) {
    calendarView.month += delta;
    if (calendarView.month > 11) { calendarView.year++; calendarView.month = 0; }
    if (calendarView.month < 0) { calendarView.year--; calendarView.month = 11; }
    updateCalendar();
    if (selectedCalendarDate) {
      var grid = document.getElementById("calendar-grid");
      if (grid && !grid.querySelector(".calendar-day.selected")) hideDayDetail();
    }
  }
  var prevBtn = document.getElementById("calendar-prev");
  var nextBtn = document.getElementById("calendar-next");
  if (prevBtn) prevBtn.addEventListener("click", function () { calendarNav(-1); });
  if (nextBtn) nextBtn.addEventListener("click", function () { calendarNav(1); });
  document.addEventListener("click", function (e) {
    var day = e.target.closest("#calendar-grid .calendar-day");
    if (!day) return;
    if (day.classList.contains("empty")) return;
    var dateStr = day.getAttribute("data-date");
    if (!dateStr) return;
    e.preventDefault();
    e.stopPropagation();
    showDayDetail(dateStr);
    updateCalendar();
    var panel = document.getElementById("calendar-day-detail");
    if (panel) {
      panel.style.display = "block";
      if (panel.scrollIntoView) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
  var todayBtn = document.getElementById("calendar-today");
  if (todayBtn) {
    todayBtn.addEventListener("click", function () {
      var now = new Date();
      calendarView.year = now.getFullYear();
      calendarView.month = now.getMonth();
      var todayStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
      updateCalendar();
      showDayDetail(todayStr);
    });
  }
  function goToDate(dateStr) {
    if (!dateStr || dateStr.length < 10) return;
    var d = new Date(dateStr + "T12:00:00");
    if (isNaN(d.getTime())) return;
    calendarView.year = d.getFullYear();
    calendarView.month = d.getMonth();
    updateCalendar();
    showDayDetail(dateStr);
  }
  var gotoDateInput = document.getElementById("calendar-goto-date");
  var gotoDateBtn = document.getElementById("calendar-goto-btn");
  if (gotoDateBtn) {
    gotoDateBtn.addEventListener("click", function () {
      var val = gotoDateInput && gotoDateInput.value;
      if (val) goToDate(val);
    });
  }
  if (gotoDateInput) {
    gotoDateInput.addEventListener("change", function () {
      if (this.value) goToDate(this.value);
    });
  }
  var addForDayBtn = document.getElementById("calendar-add-for-day");
  if (addForDayBtn) {
    addForDayBtn.addEventListener("click", function () {
      if (!selectedCalendarDate) return;
      editingId = null;
      elements.taskTitle.value = "";
      elements.taskDescription.value = "";
      elements.taskDue.value = selectedCalendarDate + "T09:00";
      if (elements.taskDuration) elements.taskDuration.value = "";
      elements.taskForm.classList.remove("hidden");
      elements.taskTitle.focus();
    });
  }

  function updateCompletionChart() {
    var total = currentTasks.length;
    var done = currentTasks.filter(function (t) { return isCompleted(t); }).length;
    var pending = total - done;
    var doneEl = document.getElementById("completion-done");
    var totalEl = document.getElementById("completion-total");
    var barEl = document.getElementById("completion-bar");
    if (doneEl) doneEl.textContent = done;
    if (totalEl) totalEl.textContent = total;
    var pct = total ? Math.round((done / total) * 100) : 0;
    if (barEl) barEl.style.width = pct + "%";
    var chartEl = document.getElementById("completion-chart");
    if (!chartEl) return;
    var maxH = 80;
    var scale = total > 0 ? maxH / total : 0;
    var doneH = Math.round(done * scale);
    var pendingH = Math.round(pending * scale);
    if (total === 0) doneH = pendingH = 0;
    chartEl.innerHTML =
      '<div class="completion-chart-bar">' +
      '<span class="bar-value">' + done + '</span>' +
      '<div class="bar bar-completed" style="height:' + Math.max(4, doneH) + 'px" title="' + done + ' completed"></div>' +
      '<span class="bar-label">Completed</span>' +
      '</div>' +
      '<div class="completion-chart-bar">' +
      '<span class="bar-value">' + pending + '</span>' +
      '<div class="bar bar-pending" style="height:' + Math.max(4, pendingH) + 'px" title="' + pending + ' to do"></div>' +
      '<span class="bar-label">To do</span>' +
      '</div>';
  }

  function addSuggestionAsTask(title) {
    if (!title || !title.trim()) return;
    var trimmed = title.trim();
    fetch(API_BASE + "/tasks/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed, description: "", due_date: null, due_datetime: null, completed: false }),
    }).then(function (r) {
      if (!r.ok) throw new Error("Request failed");
      showToast('Added "' + trimmed.slice(0, 30) + (trimmed.length > 30 ? "…" : "") + '"', "success");
      return Promise.all([
        fetch(API_BASE + "/ai-suggestions/").then(function (res) { return res.json(); }),
        fetch(API_BASE + "/tasks/").then(function (res) { return res.json(); }),
      ]);
    }).then(function (results) {
      var aiData = results[0];
      var tasksData = results[1];
      renderAiSection(aiData);
      updateTasksList(tasksData);
    }).catch(function () { showToast("Could not add task", "error"); });
  }
  function formatDeadline(task) {
    if (task.due_datetime) {
      var d = new Date(task.due_datetime);
      return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    }
    if (task.due_date) {
      var d = new Date(task.due_date + "T12:00:00");
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    }
    return "";
  }
  function formatTime(task) {
    if (task.due_datetime && String(task.due_datetime).length >= 16) {
      var d = new Date(task.due_datetime);
      return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
    return "";
  }
  function formatDuration(task) {
    var m = task.duration_minutes;
    if (m == null || m === "" || isNaN(Number(m))) return "";
    var n = Number(m);
    if (n <= 0) return "";
    if (n < 60) return n + " min";
    var h = Math.floor(n / 60);
    var mins = n % 60;
    return mins ? h + "h " + mins + " min" : h + "h";
  }
  function renderTask(task) {
    var due = formatDeadline(task);
    var timeStr = formatTime(task);
    var durStr = formatDuration(task);
    var desc = task.description ? escapeHtml(task.description) : "";
    var completed = isCompleted(task);
    var metaParts = [];
    if (due) metaParts.push("Due " + due + (timeStr ? " at " + timeStr : ""));
    else if (timeStr) metaParts.push(timeStr);
    if (durStr) metaParts.push(durStr + " allocated");
    var meta = metaParts.length ? '<p class="task-meta">' + escapeHtml(metaParts.join(" · ")) + "</p>" : "";
    return (
      '<div class="task-card ' + (completed ? "completed" : "") + '" data-id="' + task.id + '" draggable="true">' +
      '<span class="task-drag-handle" aria-label="Drag to reorder or drop on Done to complete" title="Drag to reorder or drop on Done to complete"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>' +
      '<input type="checkbox" class="task-checkbox" ' + (completed ? "checked" : "") + ' aria-label="Complete" />' +
      '<div class="task-body">' +
      '<p class="task-title-text">' + escapeHtml(task.title) + "</p>" +
      (desc ? '<p class="task-description">' + desc + "</p>" : "") +
      meta +
      "</div>" +
      '<div class="task-actions">' +
      '<button type="button" class="btn btn-icon edit-btn" aria-label="Edit">✎</button>' +
      '<button type="button" class="btn btn-icon delete-btn" aria-label="Delete">×</button>' +
      "</div></div>"
    );
  }
  function bindTaskEvents() {
    var doneListEl = document.getElementById("done-list");
    var containers = [elements.tasksList, doneListEl].filter(Boolean);
    containers.forEach(function (container) {
      if (!container) return;
      container.querySelectorAll(".task-checkbox").forEach(function (cb) {
        cb.addEventListener("change", function (e) {
          var id = Number(e.target.closest(".task-card").dataset.id);
          var checked = e.target.checked;
          fetch(API_BASE + "/tasks/" + id + "/", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ completed: checked }),
          })
            .then(function (r) {
              if (!r.ok) throw new Error("Update failed");
              return r.json();
            })
            .then(function (updatedTask) {
              if (checked) recordCompletionDay();
              showToast(checked ? "Done" : "Uncompleted", "success");
              var found = false;
              for (var i = 0; i < currentTasks.length; i++) {
                if (Number(currentTasks[i].id) === id) {
                  currentTasks[i] = updatedTask;
                  found = true;
                  break;
                }
              }
              if (found) {
                updateTasksList(currentTasks);
              } else {
                fetch(API_BASE + "/tasks/").then(function (res) { return res.json(); }).then(function (tasks) {
                  updateTasksList(Array.isArray(tasks) ? tasks : []);
                });
              }
            })
            .catch(function () {
              e.target.checked = !checked;
              showToast("Could not update task", "error");
            });
        });
      });
      container.querySelectorAll(".edit-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = Number(btn.closest(".task-card").dataset.id);
          fetch(API_BASE + "/tasks/" + id + "/")
            .then(function (r) { return r.json(); })
            .then(function (task) {
              editingId = id;
              elements.taskTitle.value = task.title || "";
              elements.taskDescription.value = task.description || "";
              if (task.due_datetime) {
                var d = new Date(task.due_datetime);
                var y = d.getFullYear();
                var m = String(d.getMonth() + 1).padStart(2, "0");
                var day = String(d.getDate()).padStart(2, "0");
                var h = String(d.getHours()).padStart(2, "0");
                var min = String(d.getMinutes()).padStart(2, "0");
                elements.taskDue.value = y + "-" + m + "-" + day + "T" + h + ":" + min;
              } else if (task.due_date) {
                elements.taskDue.value = task.due_date;
              } else {
                elements.taskDue.value = "";
              }
              if (elements.taskDuration) {
                elements.taskDuration.value = (task.duration_minutes != null && task.duration_minutes !== "") ? String(task.duration_minutes) : "";
              }
              elements.taskForm.classList.remove("hidden");
              elements.taskTitle.focus();
            })
            .catch(function () { showToast("Could not load task", "error"); });
        });
      });
      container.querySelectorAll(".delete-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!confirm("Delete this task?")) return;
          var id = Number(btn.closest(".task-card").dataset.id);
          fetch(API_BASE + "/tasks/" + id + "/", { method: "DELETE" }).then(function (r) {
            if (r.ok) {
              showToast("Deleted", "success");
              return fetch(API_BASE + "/tasks/").then(function (res) { return res.json(); });
            }
          }).then(function (tasks) {
            if (Array.isArray(tasks)) updateTasksList(tasks);
          });
        });
      });
    });
  }
  function applyInitialData(data) {
    if (data && (data.summary || data.smart_task || data.suggestions)) {
      renderAiSection({ summary: data.summary, smart_task: data.smart_task, suggestions: data.suggestions });
    }
    var tasks = Array.isArray(data && data.tasks) ? data.tasks : [];
    if (elements.tasksSkeletons) elements.tasksSkeletons.classList.add("hidden");
    if (elements.doneSkeletons) elements.doneSkeletons.classList.add("hidden");
    updateTasksList(tasks);
  }

  function loadInitialState() {
    var data = window.__INITIAL_DATA__;
    if (data && (data.tasks || data.suggestions || data.summary != null)) {
      try {
        applyInitialData(data);
        return;
      } catch (err) {
        updateTasksList([]);
      }
    }
    fetch(API_BASE + "/tasks/")
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; })
      .then(function (tasks) {
        updateTasksList(Array.isArray(tasks) ? tasks : []);
      });
    if (!data || !data.suggestions) {
      fetch(API_BASE + "/ai-suggestions/")
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (ai) {
          if (ai) renderAiSection(ai);
        });
    }
  }
  loadInitialState();
  updateCalendar();
  updateCompletionChart();

  elements.taskForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var title = elements.taskTitle.value.trim();
    if (!title) return;
    var dueVal = elements.taskDue && elements.taskDue.value;
    if (!editingId && !dueVal) {
      showToast("Please pick a date and time for the task", "error");
      if (elements.taskDue) elements.taskDue.focus();
      return;
    }
    var durVal = elements.taskDuration && elements.taskDuration.value.trim();
    var durationNum = durVal ? parseInt(durVal, 10) : null;
    if (durationNum !== null && (isNaN(durationNum) || durationNum < 1)) durationNum = null;
    var payload = {
      title: title,
      description: (elements.taskDescription && elements.taskDescription.value.trim()) || "",
      due_date: dueVal ? dueVal.slice(0, 10) : null,
      due_datetime: dueVal ? dueVal.slice(0, 16) : null,
      duration_minutes: durationNum,
      completed: false,
    };
    var url = API_BASE + "/tasks/";
    var method = "POST";
    if (editingId) {
      url = API_BASE + "/tasks/" + editingId + "/";
      method = "PUT";
    }
    var wasEdit = !!editingId;
    fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        if (r.ok) {
          editingId = null;
          elements.taskForm.classList.add("hidden");
          showToast(wasEdit ? "Updated" : "Added", "success");
          return fetch(API_BASE + "/tasks/").then(function (res) { return res.json(); });
        } else {
          return r.text().then(function (text) {
            var msg = "Request failed (" + r.status + ")";
            try {
              var err = JSON.parse(text);
              if (err.detail) msg = err.detail;
              else if (err.title || err.message) msg = err.title || err.message;
              else if (typeof err === "object" && err !== null) {
                var parts = [];
                for (var k in err) if (err.hasOwnProperty(k)) parts.push(k + ": " + (Array.isArray(err[k]) ? err[k].join(" ") : err[k]));
                if (parts.length) msg = parts.join("; ");
              }
            } catch (_) {}
            throw new Error(msg);
          });
        }
      })
      .then(function (tasks) {
        if (Array.isArray(tasks)) updateTasksList(tasks);
      })
      .catch(function (err) {
        showToast(err.message || "Could not save task", "error");
      });
  });
  elements.addTaskBtn.addEventListener("click", function () {
    editingId = null;
    elements.taskTitle.value = "";
    elements.taskDescription.value = "";
    elements.taskDue.value = "";
    if (elements.taskDuration) elements.taskDuration.value = "";
    elements.taskForm.classList.remove("hidden");
    elements.taskTitle.focus();
  });
  if (elements.cancelTaskBtn) elements.cancelTaskBtn.addEventListener("click", function () {
    elements.taskForm.classList.add("hidden");
    if (elements.taskDuration) elements.taskDuration.value = "";
    editingId = null;
  });
  if (elements.emptyAddTaskBtn) elements.emptyAddTaskBtn.addEventListener("click", function () {
    elements.addTaskBtn.click();
  });
})();
