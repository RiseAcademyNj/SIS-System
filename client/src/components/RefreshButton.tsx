export function RefreshButton({ onClick, refreshing }: { onClick: () => void; refreshing: boolean }) {
  return (
    <button
      type="button"
      className="refresh-button"
      onClick={onClick}
      disabled={refreshing}
      aria-label="Refresh from Google Sheet"
      title="Refresh from Google Sheet"
    >
      <span className={`refresh-icon${refreshing ? " refresh-icon-spinning" : ""}`}>&#8635;</span>
      {refreshing ? "Refreshing…" : "Refresh"}
    </button>
  );
}
