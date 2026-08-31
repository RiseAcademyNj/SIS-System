import { FieldTotal } from "../lib/api";

export function StatBoxes({ totals }: { totals: FieldTotal[] }) {
  if (totals.length === 0) return null;

  return (
    <div className="stat-boxes">
      {totals.map((total) => (
        <div key={total.key} className="stat-box">
          <span className="stat-box-value">
            {total.kind === "sum" ? total.value : `${total.value}/${total.weeksCount}`}
          </span>
          <span className="stat-box-label">{total.label}</span>
        </div>
      ))}
    </div>
  );
}
