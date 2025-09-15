import type { ReactNode } from "react";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
      <label>
        <strong>{label}</strong>
      </label>
      {children}
    </div>
  );
}

