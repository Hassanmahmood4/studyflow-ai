# users/serializers.py
from rest_framework import serializers
from .models import Task


class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = "__all__"
        read_only_fields = ("id", "created_at")

    def to_internal_value(self, data):
        data = dict(data)
        if data.get("description") is None:
            data["description"] = ""
        if data.get("due_date") == "":
            data["due_date"] = None
        if data.get("due_datetime") == "":
            data["due_datetime"] = None
        if "order" not in data:
            data["order"] = 0
        if "priority" not in data:
            data["priority"] = "medium"
        return super().to_internal_value(data)