export interface AdminEntry {
  username: string;
  password: string;
}

export interface RosterEntry {
  studentId: string;
  fullName: string;
  username: string;
  password: string;
}

export interface WeeklyEntry {
  weekOf: string;
  weekOfDate: number | null;
  studentId: string;
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

export interface OrgCache {
  admins: AdminEntry[];
  roster: RosterEntry[];
  weekly: WeeklyEntry[];
  lastFetchedAt: number | null;
  lastSyncedAt: number | null;
  lastError: string | null;
}

declare module "express-session" {
  interface SessionData {
    role?: "admin" | "student";
    studentId?: string;
  }
}
