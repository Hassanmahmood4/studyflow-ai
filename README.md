# Studyflow AI

A study and task management app with AI-powered suggestions. Built with **Django 5+** and a vanilla JS/CSS frontend.

## Features

- **Your tasks** — Create, edit, complete, and delete tasks with optional due date/time and priority.
- **AI suggestions** — Smart task ideas and a “suggested next” action. Uses OpenAI when `OPENAI_API_KEY` is set; falls back to curated suggestions otherwise.
- **Single source of truth** — Suggested tasks that you add appear only under “Your tasks”; the AI section stays non-empty with at least 3 suggestions.
- **Dark / light theme** — Toggle with preference stored in `localStorage`.
- **Responsive UI** — Hover highlights and brown accents for a clear, focused experience.

## Quick start

### 1. Clone and setup

```bash
git clone https://github.com/Hassanmahmood4/studyflow-ai.git
cd studyflow-ai
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Environment (optional)

Copy the example env and add your OpenAI key for AI suggestions:

```bash
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=sk-your-key-here
```

Get an API key at [OpenAI API keys](https://platform.openai.com/api-keys).  
If you skip this, the app still runs with built-in fallback suggestions.

### 3. Database and run

```bash
python manage.py migrate
python manage.py runserver
```

Open **http://127.0.0.1:8000/** in your browser.

## Project structure

```
studyflow-ai/
├── frontend/           # Static UI
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── users/              # Main app: tasks + AI API
│   ├── models.py       # Task model
│   ├── views.py       # Task CRUD + AI suggestions endpoint
│   ├── serializers.py
│   └── urls.py
├── studyflow/          # Django project
│   ├── settings.py
│   ├── urls.py
│   └── views.py       # Serves app with initial data
├── tasks/              # Legacy app (minimal use)
├── manage.py
├── requirements.txt
└── .env.example
```

## API

- **GET/POST** `/api/users/tasks/` — List and create tasks.
- **PUT/DELETE** `/api/users/tasks/<id>/` — Update and delete a task.
- **GET** `/api/users/ai-suggestions/` — Returns `suggestions`, `smart_task`, and `summary` (used by the frontend).

The root URL is served by a Django view that injects initial data so the first load doesn’t need an extra API call.

## Tech stack

- **Backend:** Django 5+, Django REST framework, python-dotenv  
- **Frontend:** Vanilla JavaScript, CSS variables (theming), no build step  
- **AI:** Optional OpenAI (gpt-4o-mini) for suggestions; fallbacks if no key or on error  

## License

MIT.
