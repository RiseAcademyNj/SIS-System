import { Logo } from "./Logo";

export function BrandHeader() {
  return (
    <div className="brand-header">
      <Logo size="small" />
      <p className="brand-header-text">Student Information System</p>
    </div>
  );
}
