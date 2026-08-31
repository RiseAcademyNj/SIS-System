export function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const complete = completed === total && total > 0;

  return (
    <div className="progress">
      <div className="progress-track">
        <div
          className={`progress-fill${complete ? " progress-fill-complete" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="progress-label">
        {completed}/{total} {complete ? "· complete" : ""}
      </span>
    </div>
  );
}
