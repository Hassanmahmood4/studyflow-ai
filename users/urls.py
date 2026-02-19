from django.urls import path
from .views import task_list_create

urlpatterns = [
    path('tasks/', task_list_create),
]