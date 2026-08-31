import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import session from "express-session";
import { cache, startPolling, refresh, PROGRESS_FIELDS, isFieldComplete } from "./sheets";
import { WeeklyEntry } from "./types";

const FIELD_LABELS: Record<(typeof PROGRESS_FIELDS)[number], string> = {
  attendance: "Attendance",
  bookTitle: "Book Title",
  bookPagesRead: "Book Pages Read",
  quranPagesRead: "Quran Pages Read",
  lectureJoined: "Lecture Joined",
  quranLinesMemorized: "Quran Lines Memorized",
  activityJoined: "Activity Joined",
};

const PORT = Number(process.env.PORT ?? 3001);
const SESSION_SECRET = process.env.SESSION_SECRET;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const isProduction = process.env.NODE_ENV === "production";

if (!SESSION_SECRET) {
  throw new Error("Missing SESSION_SECRET env var");
}

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 12, // 12 hours
    },
  })
);

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.role) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

function sortWeeklyDesc(entries: WeeklyEntry[]): WeeklyEntry[] {
  return [...entries].sort((a, b) => {
    if (a.weekOfDate !== null && b.weekOfDate !== null) {
      return b.weekOfDate - a.weekOfDate;
    }
    return b.weekOf.localeCompare(a.weekOf);
  });
}

interface FieldTotal {
  key: string;
  label: string;
  kind: "sum" | "count";
  value: number;
  weeksCount: number;
}

function isNumeric(value: string): boolean {
  return value.trim() !== "" && !Number.isNaN(Number(value));
}

// Numeric fields (page counts, lines memorized) are summed; fields that hold
// free text (Lecture Joined, ...) are counted by how many weeks logged
// something. Attendance is a checkbox, so it's counted by how many weeks
// were actually marked TRUE, not just non-empty. Book Title is excluded
// entirely — a count of "weeks with a book" isn't a meaningful total.
function summarizeWeeks(weeks: WeeklyEntry[]): FieldTotal[] {
  return PROGRESS_FIELDS.filter((key) => key !== "bookTitle").map((key) => {
    if (key === "attendance") {
      const value = weeks.filter((w) => isFieldComplete(key, w[key])).length;
      return { key, label: FIELD_LABELS[key], kind: "count" as const, value, weeksCount: weeks.length };
    }
    const values = weeks.map((w) => w[key]).filter((v): v is string => typeof v === "string" && v !== "");
    const allNumeric = values.length > 0 && values.every(isNumeric);
    if (allNumeric) {
      const value = values.reduce((sum, v) => sum + Number(v), 0);
      return { key, label: FIELD_LABELS[key], kind: "sum" as const, value, weeksCount: weeks.length };
    }
    return { key, label: FIELD_LABELS[key], kind: "count" as const, value: values.length, weeksCount: weeks.length };
  });
}

function rosterSummary() {
  return cache.roster.map((student) => {
    const weeks = sortWeeklyDesc(cache.weekly.filter((w) => w.studentId === student.studentId));
    // The sheet is pre-populated with blank weeks far into the future, so the
    // most recent *calendar* week is usually still empty. Show the most
    // recent week that actually has data logged instead.
    const latest = weeks.find((w) => w.completedFields > 0) ?? null;
    return {
      studentId: student.studentId,
      fullName: student.fullName,
      latestWeekOf: latest?.weekOf ?? null,
      latestCompletion: latest ? { completed: latest.completedFields, total: latest.totalFields } : null,
      totalWeeksLogged: weeks.length,
    };
  });
}

function studentProgress(studentId: string) {
  const student = cache.roster.find((s) => s.studentId === studentId);
  if (!student) return null;
  const rawWeeks = sortWeeklyDesc(cache.weekly.filter((w) => w.studentId === studentId));
  // Displayed oldest-first, even though `rawWeeks` stays newest-first for totals/latest-week logic.
  const weeks = [...rawWeeks].reverse().map((w) => {
    const { studentId: _omit, ...rest } = w;
    return rest;
  });
  return {
    student: { studentId: student.studentId, fullName: student.fullName },
    weeks,
    totals: summarizeWeeks(rawWeeks),
  };
}

app.post("/api/login", (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const adminMatch = cache.admins.find((a) => a.username === username && a.password === password);
  if (adminMatch) {
    req.session.role = "admin";
    req.session.studentId = undefined;
    res.json({ role: "admin" });
    return;
  }

  const match = cache.roster.find((s) => s.username === username && s.password === password);
  if (!match) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  req.session.role = "student";
  req.session.studentId = match.studentId;
  res.json({ role: "student", studentId: match.studentId, fullName: match.fullName });
});

app.post("/api/logout", (req: Request, res: Response) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", requireAuth, (req: Request, res: Response) => {
  res.json({ role: req.session.role, studentId: req.session.studentId ?? null });
});

app.get("/api/progress", requireAuth, (req: Request, res: Response) => {
  const studentId = req.session.role === "admin" ? String(req.query.studentId ?? "") : req.session.studentId!;

  if (!studentId) {
    res.status(400).json({ error: "studentId is required" });
    return;
  }

  const result = studentProgress(studentId);
  if (!result) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  res.json({ ...result, lastSyncedAt: cache.lastSyncedAt });
});

app.get("/api/admin/roster", requireAuth, requireAdmin, (_req: Request, res: Response) => {
  res.json({ students: rosterSummary(), lastSyncedAt: cache.lastSyncedAt, totals: summarizeWeeks(cache.weekly) });
});

app.post("/api/refresh", requireAuth, async (_req: Request, res: Response) => {
  await refresh();
  res.json({ ok: true, lastSyncedAt: cache.lastSyncedAt, lastError: cache.lastError });
});

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, lastSyncedAt: cache.lastSyncedAt, lastError: cache.lastError });
});

startPolling();
app.listen(PORT, () => {
  console.log(`SIS server listening on port ${PORT}`);
});
