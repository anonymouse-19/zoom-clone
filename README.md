# Zoom Clone

A Zoom-style video conferencing web app: schedule and join meetings, then talk over
peer-to-peer video with chat, reactions, screen sharing, and host controls.

> **Status:** Phase 4 (schedule & join flows) complete: dashboard, Meetings, details,
> Schedule / Edit, Join page, pre-join screen with camera preview. The meeting room is next.
> Sections marked _(Phase N)_ are filled in as each phase lands.

## Tech stack

| Layer | Choice | Why (full reasoning in [docs/DECISIONS.md](docs/DECISIONS.md)) |
|---|---|---|
| Frontend | Next.js 16 (App Router), TypeScript (strict), Tailwind CSS v4 | File-based routing, fast client-side navigation, typed props |
| Backend | Python 3.11+, FastAPI, Pydantic v2 | Typed request validation and auto-generated OpenAPI docs |
| Realtime | FastAPI WebSockets + browser WebRTC (mesh) | _(Phase 5)_ |
| Database | SQLite via SQLAlchemy 2.0 + Alembic | Zero-setup file DB; typed models; versioned, reviewable migrations |
| Tooling | ESLint + Prettier (frontend), Ruff (backend), pytest | One linter and one formatter per language |

## Architecture

_(Diagram and explanation: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).)_

## Local setup

**Prerequisites:** Node.js 20+, Python 3.11+.

### 1. Backend (terminal 1)

```bash
cd backend
python -m venv .venv
# Windows (PowerShell):  .venv\Scripts\Activate.ps1
# Windows (Git Bash):    source .venv/Scripts/activate
# macOS / Linux:         source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env            # optional: defaults work for local dev
alembic upgrade head            # create/upgrade the tables in zoom_clone.db
uvicorn app.main:app --reload --port 8000
```

On first start the server fills the empty database with demo data (the default user
Alex Morgan, colleagues, upcoming and past meetings). To start over, delete
`zoom_clone.db*` and run `alembic upgrade head` again.

Check it: <http://localhost:8000/api/health> returns `{"status":"ok"}`, and
<http://localhost:8000/docs> shows the interactive API docs.

### 2. Frontend (terminal 2)

```bash
cd frontend
npm install
cp .env.example .env.local      # optional: defaults point at localhost:8000
npm run dev
```

Open <http://localhost:3000>. The Home page should list Alex Morgan's meetings. If the
lists show an error instead, check `NEXT_PUBLIC_API_URL` (frontend) and `CORS_ORIGINS`
(backend).

### Try both sides of a meeting on one computer

There's no login, so every tab is Alex. A meeting still has two "doors":
1. **Tab 1 (host):** Home → **New meeting**, or **Start** on an upcoming meeting.
2. **Tab 2 (guest):** paste the meeting's invite link (Copy invitation) into a new tab,
   type a different name, and **Join**. You join as an anonymous attendee.

Each tab keeps its own join ticket (sessionStorage), so the two tabs are two participants.

### Quality checks

```bash
# backend/
pytest                 # tests
ruff check .           # lint
ruff format .          # format

# frontend/
npm run lint           # ESLint
npm run typecheck      # TypeScript
npm run format         # Prettier
```

## Project structure

```
backend/    FastAPI app
  app/main.py        entry point: CORS, startup seeding, routers
  app/config.py      settings from env vars
  app/db.py          engine, sessions, SQLite pragmas
  app/models/        one file per table (+ enums.py, types.py)
  app/deps.py        get_db (session per request), get_current_user (auth seam)
  app/routers/       thin HTTP layer: health, users, meetings, participants
  app/schemas/       Pydantic request/response shapes
  app/services/      business rules: meeting_service, join_service, participant_service,
                     summary_service, ics, codes
  app/seed.py        inserts demo data; app/seed_data.py describes it
  alembic/           database migrations
  tests/             pytest suite (factories.py = test-data helpers)
frontend/   Next.js app
  app/(main)/        pages with the navbar: Home, Meetings, details, Schedule
  app/join/          Join page (ID or link) · app/j/[code]/  pre-join screen (invite links)
  app/room/[code]/   the meeting room (Phase 5)
  app/providers.tsx  React Query cache + toasts
  components/ui/     hand-built primitives: Button, Modal, Dropdown, Tabs, Toggle, ...
  components/home/   ActionTiles, ClockCard, MeetingRow, MeetingList
  components/layout/ Navbar, ProfileMenu, SettingsModal, MinimalHeader
  components/schedule/ ScheduleForm, InviteesInput, MeetingScheduledDialog
  components/join/, prejoin/  JoinForm; PrejoinScreen, DevicePreview, MicLevelMeter, ...
  hooks/             queries.ts (React Query), useMeetingActions, useLocalMedia,
                     useMediaDevices, useMicLevel, usePreferences, useNow
  lib/               api.ts (only place that fetches), schedule.ts (form logic),
                     meetingSession.ts (per-tab join ticket), media.ts, format.ts, ics.ts
docs/       Interview guide, decisions, concepts, architecture, schema, learning log
```

## REST API

Interactive docs at <http://localhost:8000/docs> when the backend is running.

| Method | Path | What it does |
|---|---|---|
| GET | `/api/me` | The logged-in (seeded) user |
| GET | `/api/meetings?scope=upcoming\|recent\|all` | Meetings I host, am invited to, or attended |
| POST | `/api/meetings/instant` | Start a meeting now (or my personal room) → 201 |
| POST | `/api/meetings` | Schedule a meeting → 201 |
| GET | `/api/meetings/resolve?q=...` | "Can I join this?" for an ID or any invite link |
| GET | `/api/meetings/{code}` | Meeting details, invite link, invitation text |
| POST | `/api/meetings/{code}/participants` | Join: host door (`join_as: host`) or guest door (token/passcode) → 201 with a session token |
| PATCH | `/api/meetings/{code}` | Edit an upcoming meeting (host only) |
| DELETE | `/api/meetings/{code}` | Cancel (soft delete, host only) → 204 |
| POST | `/api/meetings/{code}/start` · `/end` | Host starts / ends for everyone |
| GET | `/api/meetings/{code}/ics` | Calendar file download |
| GET | `/api/meetings/{code}/summary` | Post-meeting recap: attendance and chat |
| GET | `/api/meetings/{code}/messages` | Public chat history |
| GET | `/api/health` | Liveness check |

Errors always look like `{"detail": "..."}`: 403 not the host · 404 unknown code ·
409 not allowed in the meeting's current state · 422 invalid input · 503 retry.

## Database schema

Seven tables: `users`, `meetings` (the hub), `meeting_settings` (1:1),
`meeting_invitees`, `participants` (one row per *join session*), `chat_messages`, and
`meeting_events` (audit log). Times are stored in UTC, foreign keys and CHECK
constraints are enforced by SQLite, and children cascade when a meeting is deleted.
ER diagram and reasoning: [docs/SCHEMA.md](docs/SCHEMA.md).

## Deployment

_(Phase 8. Vercel for the frontend, Render/Railway for the backend.)_

## Conventions (for anyone taking over this code)

- **Every non-trivial file starts with a short header**: what it's for, who calls it,
  what it calls.
- **Readable over clever.** Keyword arguments over positional ones, named things over
  list positions, no one-letter aliases, no packed one-liners.
- **No magic values.** Constants are named and commented (`SLOT_MINUTES = 15`).
- **Layers (backend):** routers stay thin (validate, call a service, return a schema).
  Rules live in `services/`. Tables live in `models/`.
- **One API client (frontend):** only `frontend/lib/api.ts` calls `fetch` for REST.
- **`# INTERVIEW:` comments** mark the decisions most worth understanding. List them with
  `grep -rn "INTERVIEW:" backend/app frontend/lib`.
- **Schema changes:** edit the model, run `alembic revision --autogenerate -m "..."`,
  *read* the generated file, then `alembic upgrade head`. `pytest` fails if models and
  migrations drift apart.
- **Tests read as sentences** (`test_deleting_a_meeting_cascades_to_all_its_children`),
  and each test file starts with the list of behaviors it proves.

## Assumptions

- No authentication: a seeded user ("Alex Morgan", id=1) is always logged in.
- Starting a meeting is a host action (the dashboard). Joining by ID or link is always
  as a guest: an anonymous attendee who needs the invite token or the passcode.
- Recurring meetings are labelled (daily / weekly) but keep one meeting ID, like Zoom's;
  individual occurrences aren't generated.
- Single backend instance with one SQLite file (fine for a demo; see DECISIONS for the scale-out path).

## Documentation

| File | What it's for |
|---|---|
| [docs/INTERVIEW_GUIDE.md](docs/INTERVIEW_GUIDE.md) | Pitch, request walkthroughs, Q&A, failure scenarios |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Every library and architectural choice, with alternatives |
| [docs/CONCEPTS.md](docs/CONCEPTS.md) | Plain-English glossary with analogies and code locations |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System diagrams |
| [docs/SCHEMA.md](docs/SCHEMA.md) | ER diagram and table rationale |
| [docs/LEARNING_LOG.md](docs/LEARNING_LOG.md) | What was built each phase, and the bugs hit along the way |
| [docs/COMPREHENSION_QUESTIONS.md](docs/COMPREHENSION_QUESTIONS.md) | Self-check questions per phase |
