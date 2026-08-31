// Replace client/public/logo.png with your real logo — this renders
// a text wordmark placeholder whenever that file is absent.
import { useState } from "react";

export function Logo({ size = "large" }: { size?: "large" | "small" }) {
  const [failed, setFailed] = useState(false);

  if (!failed) {
    return (
      <img
        src="/logo.png"
        alt="Rise Academy"
        className={`logo logo-${size}`}
        onError={() => setFailed(true)}
      />
    );
  }

  return <div className={`logo-fallback logo-${size}`}>SIS</div>;
}
