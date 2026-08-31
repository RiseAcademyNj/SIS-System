import { WeeklyEntry } from "../lib/api";
import { formatWeekOf } from "../lib/format";
import { ProgressBar } from "./ProgressBar";

const FIELD_LABELS: { key: keyof WeeklyEntry; label: string }[] = [
  { key: "attendance", label: "Attendance" },
  { key: "bookTitle", label: "Book Title" },
  { key: "bookPagesRead", label: "Book Pages Read" },
  { key: "quranPagesRead", label: "Quran Pages Read" },
  { key: "lectureJoined", label: "Lecture Joined" },
  { key: "quranLinesMemorized", label: "Quran Lines Memorized" },
  { key: "activityJoined", label: "Activity Joined" },
];

export function WeekCard({ week }: { week: WeeklyEntry }) {
  return (
    <div className="week-card">
      <div className="week-card-header">
        <h3>{formatWeekOf(week.weekOf, week.weekOfDate)}</h3>
        <ProgressBar completed={week.completedFields} total={week.totalFields} />
      </div>
      {week.mentorName && <p className="week-mentor">Mentor: {week.mentorName}</p>}
      <dl className="week-fields">
        {FIELD_LABELS.map(({ key, label }) => {
          const raw = String(week[key] ?? "");
          const value = key === "attendance" ? (raw.toUpperCase() === "TRUE" ? "Present" : raw ? "Absent" : "") : raw;
          return (
            <div key={key} className={`week-field${value ? "" : " week-field-empty"}`}>
              <dt>{label}</dt>
              <dd>{value || "—"}</dd>
            </div>
          );
        })}
      </dl>
      {week.notes && (
        <p className="week-notes">
          <strong>Notes:</strong> {week.notes}
        </p>
      )}
    </div>
  );
}
