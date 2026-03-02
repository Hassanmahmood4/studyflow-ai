# users/views.py
import json
import os
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.http import JsonResponse, HttpResponse
from .models import Task
from .serializers import TaskSerializer

FALLBACK_SUGGESTIONS = [
    "Revise DAA notes",
    "Practice coding for 30 minutes",
    "Prepare slides for presentation",
]
# Extra pool so we can always show suggestions when some are filtered out (no empty AI section)
EXTRA_FALLBACK_POOL = [
    "Review today's notes",
    "Take a 5-minute break",
    "Plan tomorrow's tasks",
    "Summarize key points from last class",
    "Do 3 practice problems",
    "Read one chapter",
    "Organize your study desk",
    "Quiz yourself on recent topics",
    "Watch a short tutorial",
    "Write down 3 questions to ask",
]
FALLBACK_SMART_TASK = "Pick your most urgent task and focus on it for 25 minutes."
MIN_SUGGESTIONS = 3


def _compute_summary(tasks):
    """Build a short summary of task completion from task list."""
    total = len(tasks)
    completed = sum(1 for t in tasks if getattr(t, "completed", False))
    pending = total - completed
    if total == 0:
        return "No tasks yet. Add one to get started."
    if pending == 0:
        return f"All {total} task(s) completed. Great job!"
    return f"{total} task(s) total — {completed} done, {pending} to go."


def _openai_ai_response(task_titles, task_completed_counts, existing_titles_set):
    """Call OpenAI for suggestions + smart_task. Returns None on failure or no key."""
    try:
        import urllib.request
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return None
        do_not_suggest = f" Do NOT suggest any of these (they are already tasks): {', '.join(sorted(existing_titles_set)[:20])}." if existing_titles_set else ""
        context = f"Current task titles: {task_titles or 'None'}. Completed: {task_completed_counts}.{do_not_suggest}"
        body = {
            "model": "gpt-4o-mini",
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a study coach. Suggest only NEW tasks the user does not already have. "
                        "Reply with valid JSON only, no markdown, with exactly these keys: "
                        '"suggestions" (array of 3-5 short actionable study task strings, none matching their existing tasks), '
                        '"smart_task" (one string: the single best NEW task to do next, must not be one they already have).'
                    ),
                },
                {"role": "user", "content": context},
            ],
            "max_tokens": 300,
        }
        req = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=12) as res:
            data = json.loads(res.read().decode())
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
        if not content or "{" not in content:
            return None
        start = content.index("{")
        parsed = json.loads(content[start : content.rindex("}") + 1])
        suggestions = parsed.get("suggestions")
        smart_task = parsed.get("smart_task")
        if isinstance(suggestions, list) and isinstance(smart_task, str):
            return {"suggestions": suggestions, "smart_task": smart_task}
    except Exception:
        pass
    return None


def _normalize_title(s):
    return (s or "").strip().lower()


def _filter_out_existing(suggestions, smart_task, existing_titles_set):
    """Remove any suggestion or smart_task that matches an existing task title."""
    if not existing_titles_set:
        return suggestions or [], smart_task
    filtered = [s for s in (suggestions or []) if _normalize_title(s) not in existing_titles_set]
    smart_ok = smart_task and _normalize_title(smart_task) not in existing_titles_set
    new_smart = smart_task if smart_ok else (filtered[0] if filtered else FALLBACK_SMART_TASK)
    return filtered, new_smart


def _ensure_min_suggestions(suggestions, smart_task, existing_titles_set):
    """Ensure we always return at least MIN_SUGGESTIONS so the AI section is never empty."""
    if len(suggestions) >= MIN_SUGGESTIONS:
        return suggestions, smart_task
    combined = list(suggestions)
    seen = {_normalize_title(s) for s in combined}
    for candidate in FALLBACK_SUGGESTIONS + EXTRA_FALLBACK_POOL:
        if len(combined) >= MIN_SUGGESTIONS:
            break
        n = _normalize_title(candidate)
        if n not in seen and n not in existing_titles_set:
            combined.append(candidate)
            seen.add(n)
    new_smart = smart_task
    if not new_smart or _normalize_title(new_smart) in existing_titles_set:
        new_smart = next((s for s in combined if _normalize_title(s) not in existing_titles_set), FALLBACK_SMART_TASK)
    return combined, new_smart


def get_ai_response(tasks):
    """Return { suggestions, smart_task, summary }. Suggestions never duplicate existing tasks; always at least MIN_SUGGESTIONS."""
    task_list = list(tasks)
    summary = _compute_summary(task_list)
    existing_titles_set = {_normalize_title(t.title) for t in task_list}
    task_titles = ", ".join(t.title for t in task_list[:15]) or "None"
    completed = sum(1 for t in task_list if t.completed)
    ai = _openai_ai_response(task_titles, f"{completed}/{len(task_list)}", existing_titles_set)
    if ai:
        suggestions, smart_task = _filter_out_existing(
            ai["suggestions"], ai["smart_task"], existing_titles_set
        )
    else:
        suggestions, smart_task = _filter_out_existing(
            FALLBACK_SUGGESTIONS, FALLBACK_SMART_TASK, existing_titles_set
        )
    suggestions, smart_task = _ensure_min_suggestions(suggestions, smart_task, existing_titles_set)
    return {"suggestions": suggestions, "smart_task": smart_task, "summary": summary}


def get_initial_app_data():
    """Data embedded in the app page so it shows without loading."""
    tasks = list(Task.objects.all())
    ai = get_ai_response(tasks)
    return {
        "suggestions": ai["suggestions"],
        "smart_task": ai["smart_task"],
        "summary": ai["summary"],
        "tasks": TaskSerializer(tasks, many=True).data,
    }


@csrf_exempt
@require_http_methods(["GET", "POST"])
def task_list_create(request):
    if request.method == "GET":
        tasks = Task.objects.all()
        return JsonResponse(TaskSerializer(tasks, many=True).data, safe=False)

    try:
        body = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({"detail": "Invalid JSON"}, status=400)

    serializer = TaskSerializer(data=body)
    if serializer.is_valid():
        serializer.save()
        return JsonResponse(serializer.data, status=201)
    return JsonResponse(serializer.errors, status=400)


@csrf_exempt
@require_http_methods(["PUT", "DELETE"])
def task_detail(request, pk):
    task = get_object_or_404(Task, pk=pk)

    if request.method == "DELETE":
        task.delete()
        return HttpResponse(status=204)

    try:
        body = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({"detail": "Invalid JSON"}, status=400)

    serializer = TaskSerializer(task, data=body, partial=True)
    if serializer.is_valid():
        serializer.save()
        return JsonResponse(serializer.data)
    return JsonResponse(serializer.errors, status=400)


@api_view(["GET"])
@permission_classes([AllowAny])
def ai_suggestions(request):
    tasks = Task.objects.all()
    ai = get_ai_response(tasks)
    return Response(ai)