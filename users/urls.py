# users/urls.py
from django.urls import path
from .views import task_list_create, task_detail, task_reorder, ai_suggestions

urlpatterns = [
    path("tasks/", task_list_create),
    path("tasks/reorder/", task_reorder),
    path("tasks/<int:pk>/", task_detail),
    path("ai-suggestions/", ai_suggestions),
]