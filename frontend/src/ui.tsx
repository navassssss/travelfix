import { useCallback, useEffect, useRef, useState } from "react";

// ---------- Toast ----------
// A small toast that appears bottom-centre and dismisses itself.
// Usage: const { toast, showToast, ToastEl } = useToast();
export function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const ToastEl = toast ? (
    <div className="toast" role="status">
      <span className="toast-dot" aria-hidden>✓</span> {toast}
      <button className="toast-close" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
    </div>
  ) : null;
  return { toast, showToast, ToastEl };
}

// ---------- In-page confirm dialog ----------
// Replaces window.confirm so confirmations stay inside the page.
export function ConfirmDialog({ title, body, confirmLabel, cancelLabel = "Cancel", onConfirm, onCancel, danger }: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <div className="dialog-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="muted">{body}</p>
        <div className="dialog-actions">
          <button className="btn secondary" onClick={onCancel}>{cancelLabel}</button>
          <button className={`btn ${danger ? "danger" : ""}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Skeleton loading placeholders ----------
export function SkeletonCard() {
  return (
    <div className="card skeleton-card" aria-hidden>
      <div className="sk sk-line sk-w60" />
      <div className="sk sk-line sk-w40" />
      <div className="sk sk-line sk-w90" />
      <div className="sk sk-line sk-w30" />
    </div>
  );
}

export function SkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid">
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}

// ---------- Empty state ----------
export function EmptyState({ icon, title, body, action }: {
  icon: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>{icon}</div>
      <h3>{title}</h3>
      <p className="muted">{body}</p>
      {action}
    </div>
  );
}

// ---------- Section header ----------
export function SectionHeader({ eyebrow, title, body }: { eyebrow?: string; title: string; body?: string }) {
  return (
    <div className="section-head">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
      {body && <p className="muted">{body}</p>}
    </div>
  );
}

// ---------- Category data (shared visual picker) ----------
export const CATEGORY_META: { name: string; icon: string; hint: string }[] = [
  { name: "Transportation", icon: "🚗", hint: "Flights, trains, buses, taxis" },
  { name: "Accommodation", icon: "🛏️", hint: "Hotels, stays, check-in" },
  { name: "Lost Belongings & Documents", icon: "🎒", hint: "Passport, wallet, luggage" },
  { name: "Money & Payments", icon: "💳", hint: "Cards, cash, payments" },
  { name: "Medical Assistance", icon: "🏥", hint: "Illness, injury, pharmacy" },
  { name: "Communication & Language", icon: "💬", hint: "Phone, internet, language" },
  { name: "Safety & Unexpected Situations", icon: "🛡️", hint: "Emergencies, safety" },
  { name: "Other", icon: "🧭", hint: "Anything else that went wrong" },
];

export function CategoryPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="cat-grid" role="radiogroup" aria-label="Problem category">
      {CATEGORY_META.map((c) => (
        <button
          key={c.name}
          type="button"
          role="radio"
          aria-checked={value === c.name}
          className={`cat-card ${value === c.name ? "active" : ""}`}
          onClick={() => onChange(c.name)}
        >
          <span className="cat-icon" aria-hidden>{c.icon}</span>
          <span className="cat-name">{c.name}</span>
          <span className="cat-hint">{c.hint}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- Stat card (dashboard / admin) ----------
export function StatCard({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="card stat">
      <strong className="stat-value">{value}</strong>
      <p className="muted">{label}</p>
    </div>
  );
}
