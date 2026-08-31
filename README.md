# SIS — Student Progress Portal

Reads student weekly progress live from a Google Sheet. Parents/students log in
to see only their own child; admins see every student. This is a template
project: each program gets its own copy, pointed at its own sheet.

## How it works

- The Google Sheet **is** the account: there's no separate signup or admin
  panel. Whoever controls the sheet (and its sharing link) controls who can
  log in.
- The sheet must be shared as **"Anyone with the link" → Viewer**. The server
  reads it straight from Google's public CSV export, no service account or
  API key needed.
- Which sheet to read is set once per copy of this project, in
  **`config/sheet-link.txt`** (gitignored — copy `config/sheet-link.example.txt`
  to create it, then paste your sheet's URL in). No env vars, no Google Cloud
  setup.
- The server polls the sheet every `POLL_INTERVAL_MS` (default 5s) into an
  in-memory cache; all requests are served from that cache. The "Refresh"
  button in the UI forces an immediate re-fetch.
- Three tabs are required, with these exact names and header rows:
  - **`Admins`** — `Username`, `Password`. Anyone listed here logs in as an
    admin and can view every student. Add as many rows as you want co-admins.
  - **`Student Roster`** — `Student ID`, `Full Name`, `Username`, `Password`.
    One row per student; whatever you put in `Username`/`Password` is what
    that student/parent logs in with.
  - **`Weekly Programs`** — one row per student per week, looked up by
    `Student ID` (matched against the roster) and shown newest `Week Of`
    first. Columns: `Week Of`, `Student ID`, `Mentor Name`, `Attendance`,
    `Book Title`, `Book Pages Read`, `Quran Pages Read`, `Lecture Joined`,
    `Quran Lines Memorized`, `Activity Joined`, `Notes`.
- A week's progress bar counts 7 fields as "complete" when filled in:
  Attendance, Book Title, Book Pages Read, Quran Pages Read, Lecture Joined,
  Quran Lines Memorized, Activity Joined. (`Notes` is excluded — it's
  freeform.) Edit the `PROGRESS_FIELDS` list in `server/src/sheets.ts` if you
  want to change what counts.
- Read-only: the app never writes back to the Sheet. Add/remove students or
  weeks, or change who's an admin, by editing the Sheet directly.

**Heads up on privacy:** because the sheet must be link-viewable for the app
to read it with no setup, anyone who has the sheet link can open it directly
in Google Sheets too — the app's login only gates the *app's* views, not the
underlying document. Don't put anything in the sheet you wouldn't want
visible to someone who got hold of the link.

## Sharing this with someone else running their own program

Give them the project (this repo/folder). They:

1. Make a Google Sheet with the three tabs and headers above.
2. Set sharing to **Anyone with the link → Viewer**.
3. Copy `config/sheet-link.example.txt` to `config/sheet-link.txt` and paste
   their sheet's link in.
4. Fill in `Admins` and `Student Roster`, run/deploy the app, done.

Each copy of the project points at exactly one sheet — if they want to run
their own version, they deploy their own copy (their own Render + Vercel
projects, or just run it locally). `config/sheet-link.txt` is gitignored so
personalizing a fork doesn't create merge conflicts with upstream.

## One-time setup (local)

1. `npm install`
2. Copy `config/sheet-link.example.txt` to `config/sheet-link.txt` and paste
   your sheet's link in.
3. Copy `server/.env.example` to `server/.env` and fill in `SESSION_SECRET`.
4. Copy `client/.env.example` to `client/.env` if you need a non-default API
   URL.
5. Drop your logo at `client/public/logo.png` (falls back to a text "SIS"
   wordmark if missing).

## Local development

```bash
npm run dev
```

- Server: http://localhost:3001
- Client: http://localhost:5173

## Deploying

- **Server → Render**: `render.yaml` at the repo root defines the web
  service. Push to a connected repo, or `render blueprint launch`, then set
  `CLIENT_ORIGIN` in the Render dashboard to your deployed client's URL. If
  you'd rather not commit `config/sheet-link.txt` to the repo Render deploys
  from, set the `SHEET_LINK` env var instead — it's used as a fallback when
  the file isn't present.
- **Client → Vercel**: `vercel.json` at the repo root builds only the client
  workspace. Set `VITE_API_URL` in the Vercel project settings to your
  deployed Render server URL.
