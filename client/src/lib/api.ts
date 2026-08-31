const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export interface Session {
  role: "admin" | "student";
  studentId: string | null;
}

export interface Student {
  studentId: string;
  fullName: string;
}

export interface FieldTotal {
  key: string;
  label: string;
  kind: "sum" | "count";
  value: number;
  weeksCount: number;
}

export interface WeeklyEntry {
  weekOf: string;
  weekOfDate: number | null;
  mentorName: string;
  attendance: string;
  bookTitle: string;
  bookPagesRead: string;
  quranPagesRead: string;
  lectureJoined: string;
  quranLinesMemorized: string;
  activityJoined: string;
  notes: string;
  completedFields: number;
  totalFields: number;
}

export interface ProgressResponse {
  student: Student;
  weeks: WeeklyEntry[];
  totals: FieldTotal[];
  lastSyncedAt: number | null;
}

export interface RosterSummaryEntry {
  studentId: string;
  fullName: string;
  latestWeekOf: string | null;
  latestCompletion: { completed: number; total: number } | null;
  totalWeeksLogged: number;
}

export interface AdminRosterResponse {
  students: RosterSummaryEntry[];
  lastSyncedAt: number | null;
  totals: FieldTotal[];
}

export const api = {
  login: (username: string, password: string) =>
    request<{ role: "admin" | "student"; studentId?: string; fullName?: string }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/logout", { method: "POST" }),
  me: () => request<Session>("/api/me"),
  progress: (studentId?: string) =>
    request<ProgressResponse>(`/api/progress${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ""}`),
  adminRoster: () => request<AdminRosterResponse>("/api/admin/roster"),
  refresh: () => request<{ ok: boolean; lastSyncedAt: number | null; lastError: string | null }>("/api/refresh", {
    method: "POST",
  }),
};
