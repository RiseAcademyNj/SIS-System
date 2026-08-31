import { useEffect, useState } from "react";
import { api, FieldTotal, RosterSummaryEntry } from "../lib/api";
import { formatWeekOf, timeAgo } from "../lib/format";
import { ProgressBar } from "../components/ProgressBar";
import { StatBoxes } from "../components/StatBoxes";
import { RefreshButton } from "../components/RefreshButton";
import { BrandHeader } from "../components/BrandHeader";
import { StudentDashboard } from "./StudentDashboard";

const POLL_MS = 5000;

export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [students, setStudents] = useState<RosterSummaryEntry[]>([]);
  const [totals, setTotals] = useState<FieldTotal[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (selectedStudentId) return;
    let cancelled = false;

    async function load() {
      try {
        const result = await api.adminRoster();
        if (!cancelled) {
          setStudents(result.students);
          setTotals(result.totals);
          setLastSyncedAt(result.lastSyncedAt);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load roster");
      }
    }

    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedStudentId]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await api.refresh();
      const result = await api.adminRoster();
      setStudents(result.students);
      setTotals(result.totals);
      setLastSyncedAt(result.lastSyncedAt);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }

  if (selectedStudentId) {
    return (
      <StudentDashboard
        studentId={selectedStudentId}
        onLogout={onLogout}
        backLink={{ label: "All students", onClick: () => setSelectedStudentId(null) }}
      />
    );
  }

  return (
    <div className="dashboard">
      <BrandHeader />
      <header className="dashboard-header">
        <div>
          <h1>All Students</h1>
          <p className="sync-status">Live · updated {timeAgo(lastSyncedAt)}</p>
        </div>
        <div className="dashboard-header-actions">
          <RefreshButton onClick={handleRefresh} refreshing={refreshing} />
          <button className="logout-button" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      {error && <p className="dashboard-error">{error}</p>}

      <StatBoxes totals={totals} />

      <div className="roster-list">
        {students.map((s) => (
          <button key={s.studentId} className="roster-row" onClick={() => setSelectedStudentId(s.studentId)}>
            <div className="roster-row-name">
              <strong>{s.fullName}</strong>
              <span className="roster-row-id">{s.studentId}</span>
            </div>
            <div className="roster-row-progress">
              {s.latestCompletion ? (
                <>
                  <span className="roster-row-week">{formatWeekOf(s.latestWeekOf ?? "", null)}</span>
                  <ProgressBar completed={s.latestCompletion.completed} total={s.latestCompletion.total} />
                </>
              ) : (
                <span className="empty-state">No entries yet</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
