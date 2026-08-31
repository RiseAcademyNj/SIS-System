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

// If the requested tab name doesn't exist, Google's CSV export endpoint
// doesn't error — it silently serves a *different* tab (200 OK, content-type
// text/csv) instead. res.ok/content-type alone can't detect that, so each
// caller checks for header columns that only that tab should have.
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

async function fetchTabRows(tabName: string): Promise<Record<string, string>[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const res = await fetch(url);
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.includes("csv")) {
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

async function loadAdmins(): Promise<AdminEntry[]> {
  const rows = await fetchTabRows("Admins");
  const entries: AdminEntry[] = [];
  for (const row of rows) {
    const username = get(row, "Username");
    if (!username) continue;
    entries.push({ username, password: get(row, "Password") });
  }
  return entries;
}

async function loadRoster(): Promise<RosterEntry[]> {
  const rows = await fetchTabRows("Student Roster");
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

async function loadWeekly(): Promise<WeeklyEntry[]> {
  const rows = await fetchTabRows("Weekly Programs");
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
    const [admins, roster, weekly] = await Promise.all([loadAdmins(), loadRoster(), loadWeekly()]);
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
