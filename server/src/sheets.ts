import { readFileSync } from "fs";
import { resolve } from "path";
import { parse } from "csv-parse/sync";
import { AdminEntry, OrgCache, RosterEntry, WeeklyEntry } from "./types";

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000);
const CONFIG_FILE_PATH = resolve(__dirname, "../../config/sheet-link.txt");

// Fields counted toward a week's completion progress bar. Notes and
// identifying columns (Week Of, Student ID, names, Mentor Name) are
// excluded since they aren't program-progress signals.
export const PROGRESS_FIELDS = [
  "attendance",
  "bookTitle",
  "bookPagesRead",
  "quranPagesRead",
  "lectureJoined",
  "quranLinesMemorized",
  "activityJoined",
] as const satisfies readonly (keyof WeeklyEntry)[];

// Attendance is a checkbox in the sheet, so it comes back as the literal
// string "TRUE"/"FALSE" — only "TRUE" should count as filled in. Every other
// progress field just needs any value.
export function isFieldComplete(key: (typeof PROGRESS_FIELDS)[number], value: string): boolean {
  if (key === "attendance") return value.trim().toUpperCase() === "TRUE";
  return value !== "";
}

// Accepts either a full Google Sheets URL or a bare sheet ID.
function parseSheetId(link: string): string | null {
  const trimmed = link.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]+$/.test(trimmed)) return trimmed;
  return null;
}

// The sheet link lives in config/sheet-link.txt (gitignored, one link per
// deployment) so a copy of this project can be personalized without editing
// env vars. SHEET_LINK is a fallback for hosts like Render where dropping a
// file into the repo isn't convenient.
function readConfiguredSheetLink(): string {
  try {
    const fromFile = readFileSync(CONFIG_FILE_PATH, "utf-8").trim();
    if (fromFile) return fromFile;
  } catch {
    // File doesn't exist — fall through to the env var.
  }
  const fromEnv = process.env.SHEET_LINK?.trim();
  if (fromEnv) return fromEnv;
  throw new Error(
    `No Google Sheet configured. Put its link in ${CONFIG_FILE_PATH} (copy config/sheet-link.example.txt) or set the SHEET_LINK env var.`
  );
}

const SHEET_ID = (() => {
  const link = readConfiguredSheetLink();
  const id = parseSheetId(link);
  if (!id) {
    throw new Error(`Couldn't parse a sheet ID out of the configured link: "${link}"`);
  }
  return id;
})();

// Sanity check on top of the gid-based lookup below (which already pins an
// exact tab by id, so it can't silently drift to the wrong tab the way a
// name-based lookup could) — still useful to catch a renamed/missing column.
function assertTabShape(tabName: string, headers: string[]): void {
  const has = (name: string) => headers.includes(name);
  const looksRight =
    tabName === "Admins"
      ? has("Username") && has("Password") && !has("Student ID")
      : tabName === "Student Roster"
        ? has("Student ID") && has("Username") && !has("Week Of")
        : tabName === "Weekly Programs"
          ? has("Week Of") && has("Student ID")
          : true;
  if (!looksRight) {
    throw new Error(
      `Couldn't find a "${tabName}" tab with the expected columns. Make sure the sheet is shared as "Anyone with the link" (Viewer) and has a tab named exactly "${tabName}".`
    );
  }
}

// Maps tab name -> gid by scraping the sheet's public "htmlview" page, which
// embeds a bootstrap script listing every tab as
// `{name: "Tab Name", pageUrl: "...", gid: "123456"}`. This is undocumented
// but has been stable for a long time; if Google ever changes this markup,
// every tab lookup below will start failing with a clear "couldn't find tab"
// error rather than silently mismatching data.
async function fetchTabGids(): Promise<Map<string, string>> {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/htmlview`);
  if (!res.ok) {
    throw new Error(
      `Couldn't read the sheet's tab list. Make sure the sheet is shared as "Anyone with the link" (Viewer).`
    );
  }
  const html = await res.text();
  const gids = new Map<string, string>();
  for (const match of html.matchAll(/\{name: "([^"]*)", pageUrl: "[^"]*", gid: "(\d+)"/g)) {
    gids.set(match[1], match[2]);
  }
  return gids;
}

// The gviz "tq" query endpoint (`/gviz/tq?tqx=out:csv&sheet=<name>`) silently
// caps its result at a small number of rows on large sheets — no error, no
// truncation warning, just a partial CSV. Confirmed on a ~3800-row sheet: it
// returned only 41 rows. The plain `/export?format=csv&gid=<gid>` endpoint
// does a real full-tab dump instead, so that's used here despite needing an
// extra request (fetchTabGids) to resolve tab name -> gid, since tabs are
// still identified by name everywhere else in this app for no-setup sharing.
async function fetchTabRows(tabName: string, gids: Map<string, string>): Promise<Record<string, string>[]> {
  const gid = gids.get(tabName);
  if (gid === undefined) {
    throw new Error(
      `Couldn't find a tab named exactly "${tabName}". Make sure the sheet is shared as "Anyone with the link" (Viewer) and has a tab named exactly "${tabName}".`
    );
  }
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Couldn't read the "${tabName}" tab. Make sure the sheet is shared as "Anyone with the link" (Viewer) and has a tab named exactly "${tabName}".`
    );
  }
  const text = await res.text();
  const rows: string[][] = parse(text, { relax_column_count: true });
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  assertTabShape(tabName, headers);
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      record[header] = (row[i] ?? "").trim();
    });
    return record;
  });
}

function get(record: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    if (record[name] !== undefined) return record[name];
  }
  return "";
}

function parseWeekOfDate(raw: string): number | null {
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

async function loadAdmins(gids: Map<string, string>): Promise<AdminEntry[]> {
  const rows = await fetchTabRows("Admins", gids);
  const entries: AdminEntry[] = [];
  for (const row of rows) {
    const username = get(row, "Username");
    if (!username) continue;
    entries.push({ username, password: get(row, "Password") });
  }
  return entries;
}

async function loadRoster(gids: Map<string, string>): Promise<RosterEntry[]> {
  const rows = await fetchTabRows("Student Roster", gids);
  const entries: RosterEntry[] = [];
  for (const row of rows) {
    const studentId = get(row, "Student ID");
    const username = get(row, "Username");
    if (!studentId || !username) continue;
    entries.push({
      studentId,
      fullName: get(row, "Full Name"),
      username,
      password: get(row, "Password"),
    });
  }
  return entries;
}

async function loadWeekly(gids: Map<string, string>): Promise<WeeklyEntry[]> {
  const rows = await fetchTabRows("Weekly Programs", gids);
  const entries: WeeklyEntry[] = [];
  for (const row of rows) {
    const studentId = get(row, "Student ID");
    const weekOf = get(row, "Week Of");
    if (!studentId || !weekOf) continue;

    const entry: WeeklyEntry = {
      weekOf,
      weekOfDate: parseWeekOfDate(weekOf),
      studentId,
      mentorName: get(row, "Mentor Name"),
      attendance: get(row, "Attendance"),
      bookTitle: get(row, "Book Title"),
      bookPagesRead: get(row, "Book Pages Read"),
      quranPagesRead: get(row, "Quran Pages Read"),
      lectureJoined: get(row, "Lecture Joined"),
      quranLinesMemorized: get(row, "Quran Lines Memorized"),
      activityJoined: get(row, "Activity Joined"),
      notes: get(row, "Notes"),
      completedFields: 0,
      totalFields: PROGRESS_FIELDS.length,
    };
    entry.completedFields = PROGRESS_FIELDS.filter((field) => isFieldComplete(field, entry[field])).length;
    entries.push(entry);
  }
  return entries;
}

export const cache: OrgCache = {
  admins: [],
  roster: [],
  weekly: [],
  lastFetchedAt: null,
  lastSyncedAt: null,
  lastError: null,
};

export async function refresh(): Promise<void> {
  try {
    const gids = await fetchTabGids();
    const [admins, roster, weekly] = await Promise.all([loadAdmins(gids), loadRoster(gids), loadWeekly(gids)]);
    cache.admins = admins;
    cache.roster = roster;
    cache.weekly = weekly;
    cache.lastFetchedAt = Date.now();
    cache.lastSyncedAt = Date.now();
    cache.lastError = null;
  } catch (err) {
    cache.lastFetchedAt = Date.now();
    cache.lastError = err instanceof Error ? err.message : String(err);
    console.error("[sheets] refresh failed:", cache.lastError);
  }
}

export function startPolling(): void {
  refresh();
  setInterval(refresh, POLL_INTERVAL_MS);
}
