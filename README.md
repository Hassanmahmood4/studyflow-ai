# Studyflow AI

**About:** A lightweight study and task manager with AI-powered suggestions. Django + vanilla JS. Add tasks, set deadlines, and get smart next-step ideas—with or without an OpenAI API key.

## Project description

**Studyflow AI** is a lightweight study and task manager that helps you stay focused by combining a simple task list with AI-generated suggestions. You get a single place to see what to do next, add deadlines, and tick off completed work—without leaving the app.

The app uses **Django** on the backend and a **vanilla JavaScript** frontend (no framework), so it’s easy to run locally or deploy. When you set an optional **OpenAI API key**, it suggests new tasks based on your current list; without a key, it still works using built-in suggestions. Tasks you add from suggestions appear only under “Your tasks,” and the AI section always shows at least three new ideas so you never run out of options. A dark/light theme and clear hover states (including brown accents) keep the interface readable and pleasant to use.

Whether you use it for daily study planning, project deadlines, or quick to-dos, Studyflow AI keeps everything in one place with minimal setup.

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
