# Wolf

The owner's management app for everything, not only business. Research, projects and
academics live in Wolf's own database; businesses are separate apps that Wolf reaches
through their admin APIs (right now **ClutchX3D**). The home screen shows a thumbnail tile
for every entry and business, grouped by category.

## What it does
- Sign in with a single owner account (env vars, scrypt hash supported).
- Workspace: create an entry as **Research**, **Project** or **Academic**, with a title,
  description, colour, thumbnail image and due date. Each entry has tasks, and tasks can have
  subtasks (one level), due dates, priority, notes and a step tag.
- Step line: research starts with Literature review → Problem statement → Idea generation →
  Methodology → Experiments → Analysis → Paper writing → Submission, shown across the top of
  its page. Projects and academics can switch on their own step line. Steps can be renamed,
  reordered, added or removed per entry; pick a step to make it the current one. The step
  line folds into a one-line summary until you open it; progress and the step filter sit
  behind icon buttons so the task list gets the full width.
- Research entries have a **Papers** tab: a reading list with links, authors, year, venue,
  notes and a To read → Reading → Read status.
- Academic entries have **Class times** (weekly class and lab slots with room) and **CTs**
  (date, syllabus, marks out of total, average, optionally counting only the best N).
- **Routine** (`/routine`): repeating weekly items such as tutoring on Sat, Mon, Wed, with
  optional times, date range and link to an entry. A weekday can have its own time (Fri 3–4 pm
  while the other days are 10–11 am), and any single date can be moved or skipped from its
  block without touching other weeks. The week shows hour by hour (Hours) with each day's free
  time, or as a list; class and lab times, meetings and contests show there too.
- **Ticks**: a task or subtask can need doing more than once. Academic tasks get 3 ticks by
  default (others 1), changeable from 1 to 20 under "Times to do"; it is done when all are ticked.
- **Calendar** (`/calendar`): month view of task and subtask due dates, entry deadlines, CTs,
  routine and classes, with layers you can hide. Click a day (or **Timeline** in the dashboard's
  Today panel) for its **timeline**, a dialog on the web and its own page (`/day/<date>`) in the app: hour by hour,
  with classes, meetings, routine and contests as blocks and the free stretches between them
  (counted within the waking hours you set, e.g. 8 am – 11 pm).
  The dashboard's Today panel shows today's items, overdue tasks and the next 7 days.
- **Done workspaces**: "Move to Done" on an entry takes it off the main grid into the
  dashboard's folded *Done* section. Reopen brings it back.
- **Android app**: "Download App" (top bar and sign-in page) serves `web/public/wolf.apk`.
- ClutchX3D: overview numbers and a 14-day chart; orders with search and filters; order
  detail with the bKash/Nagad payment check (verify or reject), status, customer files,
  internal notes and history; products with a field builder for custom products;
  payment numbers, delivery charges and the store notice.

## Run locally
```bash
npm install
cp .env.example .env   # fill in values, then export them or use your shell's dotenv
npm run build
WOLF_ADMIN_PASSWORD=secret WOLF_COOKIE_SECURE=false \
WOLF_DATABASE_URL=postgres://clutch:clutch@localhost:5434/clutchx3d \
CLUTCHX3D_API_URL=http://localhost:8080 CLUTCHX3D_ADMIN_KEY=<key> npm start
# http://localhost:8081
```
For live reload use `npm run dev` (Vite on :5174, proxying /api to :8081).

## Android app
The app in `../wolf-app` is Wolf in a web view. It opens the hosted Wolf on the DigitalOcean
Droplet (`https://162-243-255-182.sslip.io`, set by `--dart-define=WOLF_SERVER=...`); Back on the first screen
offers "Change server". Every web change reaches the phone without a new APK. Rebuild only when the app
shell itself changes:
```bash
source ~/sdk/env.sh   # JDK 17, Flutter, Android SDK
cd ../wolf-app && flutter build apk --release --target-platform android-arm,android-arm64
cp build/app/outputs/flutter-apk/app-release.apk ../wolf/web/public/wolf.apk
```
The app adds `WolfApp` to its user agent so the web app hides its own download button.

## Environment
| Variable | Purpose |
|---|---|
| `WOLF_ADMIN_USERNAME` | Sign-in username (default `admin`) |
| `WOLF_ADMIN_PASSWORD` / `WOLF_ADMIN_PASSWORD_HASH` | Password, plain or `npm run hash-password -- 'pw'` |
| `WOLF_SESSION_SECRET` | 24+ random characters; required in production |
| `WOLF_COOKIE_SECURE` | `false` only for plain-http testing |
| `WOLF_DATABASE_URL` | Postgres for the workspace. Tables are created in a `wolf` schema on start |
| `WOLF_DATABASE_CA_CERT` | CA certificate for managed Postgres (optional) |
| `CLUTCHX3D_API_URL` | Base URL of the ClutchX3D app |
| `CLUTCHX3D_ADMIN_KEY` | Same value as `ADMIN_API_KEY` in ClutchX3D |
| `CLUTCHX3D_PUBLIC_URL` | Storefront URL for the "Open storefront" link |

## Deploy to DigitalOcean
`doctl apps create --spec wolf/.do/app.yaml`, then set the secrets in the App Platform
dashboard. The workspace needs a Postgres database (`WOLF_DATABASE_URL`); it can share the
shop's database since its tables live in their own `wolf` schema. Business data stays in each
business's own app. If the database is unreachable the business tiles keep working and the
workspace retries every 30 seconds.

## Adding another business
1. Add an entry to `server/modules.js` (id, name, API URL, key, allowed paths).
2. Add its UI under `web/src/modules/<id>/`, a route in `web/src/main.jsx` and a
   `TILE` entry in `web/src/pages/Home.jsx`.
