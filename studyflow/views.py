# studyflow/views.py
import json
from pathlib import Path

from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.http import HttpResponse

from users.views import get_initial_app_data


def app_page(request):
    """Serve the app HTML with initial data so suggestions and tasks show immediately."""
    try:
        data = get_initial_app_data()
        path = Path(settings.BASE_DIR) / "frontend" / "index.html"
        html = path.read_text(encoding="utf-8")
        script = "<script>window.__INITIAL_DATA__=" + json.dumps(data, cls=DjangoJSONEncoder) + ";</script>\n  "
        html = html.replace(
            '  <script src="/static/app.js"></script>',
            script + '  <script src="/static/app.js"></script>',
        )
        return HttpResponse(html, content_type="text/html; charset=utf-8")
    except Exception as e:
        return HttpResponse(
            "<h1>Error loading app</h1><pre>" + str(e) + "</pre>",
            status=500,
            content_type="text/html; charset=utf-8",
        )
