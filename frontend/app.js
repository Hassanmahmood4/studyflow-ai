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
    toast: $("#toast"),
  };
  var editingId = null;
  var THEME_KEY = "studyflow-theme";
  var currentTasks = [];

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
      elements.tasksList.innerHTML = pending.map(renderTask).join("");
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
    updateCalendar();
    updateCompletionChart();
  }

  function taskDateString(task) {
    if (task.due_datetime) return String(task.due_datetime).slice(0, 10);
    if (task.due_date) return String(task.due_date).slice(0, 10);
    return null;
  }
  var calendarView = { year: new Date().getFullYear(), month: new Date().getMonth() };
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
      var cls = "calendar-day" + (isToday ? " today" : "") + (count > 0 ? " has-tasks" : "");
      html += '<div class="' + cls + '" title="' + (count > 0 ? count + " task(s) due" : "") + '"><span class="day-num">' + i + "</span>" + (count > 0 ? '<span class="day-dot"></span>' : "") + "</div>";
    }
    grid.innerHTML = html;
  }
  function calendarNav(delta) {
    calendarView.month += delta;
    if (calendarView.month > 11) { calendarView.year++; calendarView.month = 0; }
    if (calendarView.month < 0) { calendarView.year--; calendarView.month = 11; }
    updateCalendar();
  }
  var prevBtn = document.getElementById("calendar-prev");
  var nextBtn = document.getElementById("calendar-next");
  if (prevBtn) prevBtn.addEventListener("click", function () { calendarNav(-1); });
  if (nextBtn) nextBtn.addEventListener("click", function () { calendarNav(1); });

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
  function renderTask(task) {
    var due = formatDeadline(task);
    var desc = task.description ? escapeHtml(task.description) : "";
    var completed = isCompleted(task);
    return (
      '<div class="task-card ' + (completed ? "completed" : "") + '" data-id="' + task.id + '">' +
      '<input type="checkbox" class="task-checkbox" ' + (completed ? "checked" : "") + ' aria-label="Complete" />' +
      '<div class="task-body">' +
      '<p class="task-title-text">' + escapeHtml(task.title) + "</p>" +
      (desc ? '<p class="task-description">' + desc + "</p>" : "") +
      (due ? '<p class="task-meta">Due ' + escapeHtml(due) + "</p>" : "") +
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
    var payload = {
      title: title,
      description: (elements.taskDescription && elements.taskDescription.value.trim()) || "",
      due_date: dueVal ? dueVal.slice(0, 10) : null,
      due_datetime: dueVal ? dueVal.slice(0, 16) : null,
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
    elements.taskForm.classList.remove("hidden");
    elements.taskTitle.focus();
  });
  if (elements.cancelTaskBtn) elements.cancelTaskBtn.addEventListener("click", function () {
    elements.taskForm.classList.add("hidden");
    editingId = null;
  });
  if (elements.emptyAddTaskBtn) elements.emptyAddTaskBtn.addEventListener("click", function () {
    elements.addTaskBtn.click();
  });
})();
