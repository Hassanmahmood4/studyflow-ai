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

  function updateTasksList(tasks) {
    var list = Array.isArray(tasks) ? tasks : [];
    if (elements.tasksSkeletons) elements.tasksSkeletons.classList.add("hidden");
    elements.tasksList.classList.add("hidden");
    elements.tasksList.innerHTML = "";
    if (elements.tasksEmpty) elements.tasksEmpty.classList.add("hidden");
    if (list.length === 0) {
      if (elements.tasksEmpty) elements.tasksEmpty.classList.remove("hidden");
    } else {
      elements.tasksList.classList.remove("hidden");
      elements.tasksList.innerHTML = list.map(renderTask).join("");
      bindTaskEvents();
    }
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
    return (
      '<div class="task-card ' + (task.completed ? "completed" : "") + '" data-id="' + task.id + '">' +
      '<input type="checkbox" class="task-checkbox" ' + (task.completed ? "checked" : "") + ' aria-label="Complete" />' +
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
    if (!elements.tasksList) return;
    elements.tasksList.querySelectorAll(".task-checkbox").forEach(function (cb) {
      cb.addEventListener("change", function (e) {
        var id = Number(e.target.closest(".task-card").dataset.id);
        var checked = e.target.checked;
        fetch(API_BASE + "/tasks/" + id + "/", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed: checked }),
        }).then(function (r) {
          if (r.ok) {
            e.target.closest(".task-card").classList.toggle("completed", checked);
            showToast(checked ? "Done" : "Uncompleted", "success");
          }
        });
      });
    });
    elements.tasksList.querySelectorAll(".edit-btn").forEach(function (btn) {
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
          });
      });
    });
    elements.tasksList.querySelectorAll(".delete-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("Delete this task?")) return;
        var id = Number(btn.closest(".task-card").dataset.id);
        fetch(API_BASE + "/tasks/" + id + "/", { method: "DELETE" }).then(function (r) {
          if (r.ok) {
            btn.closest(".task-card").remove();
            if (elements.tasksList.children.length === 0) {
              elements.tasksList.classList.add("hidden");
              if (elements.tasksEmpty) elements.tasksEmpty.classList.remove("hidden");
            }
            showToast("Deleted", "success");
          }
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
    elements.tasksList.classList.add("hidden");
    elements.tasksList.innerHTML = "";
    if (elements.tasksEmpty) elements.tasksEmpty.classList.add("hidden");
    if (tasks.length === 0) {
      if (elements.tasksEmpty) elements.tasksEmpty.classList.remove("hidden");
    } else {
      elements.tasksList.classList.remove("hidden");
      elements.tasksList.innerHTML = tasks.map(renderTask).join("");
      bindTaskEvents();
    }
  }

  if (window.__INITIAL_DATA__) {
    applyInitialData(window.__INITIAL_DATA__);
  }

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
          window.location.reload();
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
