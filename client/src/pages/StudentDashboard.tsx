import { useEffect, useState } from "react";
import { api, ProgressResponse } from "../lib/api";
import { timeAgo } from "../lib/format";
import { WeekCard } from "../components/WeekCard";
import { StatBoxes } from "../components/StatBoxes";
import { RefreshButton } from "../components/RefreshButton";
import { BrandHeader } from "../components/BrandHeader";

const POLL_MS = 5000;

export function StudentDashboard({
  studentId,
  onLogout,
  backLink,
}: {
  studentId?: string;
  onLogout?: () => void;
  backLink?: { label: string; onClick: () => void };
}) {
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await api.progress(studentId);
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load progress");
      }
    }

    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [studentId]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await api.refresh();
      const result = await api.progress(studentId);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }

  if (error) {
    return <div className="dashboard-error">{error}</div>;
  }

  if (!data) {
    return <div className="dashboard-loading">Loading…</div>;
  }

  return (
    <div className="dashboard">
      <BrandHeader />
      <header className="dashboard-header">
        <div>
          {backLink && (
            <button className="link-button" onClick={backLink.onClick}>
              ← {backLink.label}
            </button>
          )}
          <h1>{data.student.fullName}</h1>
          <p className="sync-status">Live · updated {timeAgo(data.lastSyncedAt)}</p>
        </div>
        <div className="dashboard-header-actions">
          <RefreshButton onClick={handleRefresh} refreshing={refreshing} />
          {onLogout && (
            <button className="logout-button" onClick={onLogout}>
              Log out
            </button>
          )}
        </div>
      </header>

      <StatBoxes totals={data.totals} />

      {data.weeks.length === 0 ? (
        <p className="empty-state">No weekly entries yet.</p>
      ) : (
        <div className="week-list">
          {data.weeks.map((week) => (
            <WeekCard key={week.weekOf} week={week} />
          ))}
        </div>
      )}
    </div>
  );
}
