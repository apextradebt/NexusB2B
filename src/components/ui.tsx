import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { MatchStatus } from "@/types";

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`bg-surface rounded-[2rem] shadow-soft ${className}`}>{children}</div>;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "soft" | "ghost" };
export function Button({ variant = "primary", className = "", children, ...rest }: BtnProps) {
  const styles = {
    primary: "bg-primary text-on-primary shadow-soft-sm hover:opacity-90",
    soft: "bg-surface text-ink shadow-soft-sm hover:shadow-soft",
    ghost: "text-muted hover:text-ink hover:bg-line/50",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${styles} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">{title}</h1>
        {desc && <p className="text-muted font-medium text-sm max-w-2xl">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, hint, tone = "ink" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "ink" | "buy" | "sell" }) {
  const color = { ink: "text-ink", buy: "text-buy", sell: "text-sell" }[tone];
  return (
    <Card className="p-6 flex flex-col gap-1.5">
      <span className="text-muted font-medium text-xs uppercase tracking-wider">{label}</span>
      <span className={`text-3xl font-bold tabular-nums ${color}`}>{value}</span>
      {hint && <span className="text-xs text-muted font-medium">{hint}</span>}
    </Card>
  );
}

const STATUS_STYLE: Record<MatchStatus, string> = {
  matched: "bg-lime/25 text-sell",
  review: "bg-sand/25 text-warn",
  unmatched: "bg-bokara/10 text-muted dark:bg-bright/10",
};
const STATUS_LABEL: Record<MatchStatus, string> = { matched: "Reconnu", review: "À vérifier", unmatched: "Non reconnu" };

export function StatusBadge({ status }: { status: MatchStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider whitespace-nowrap ${STATUS_STYLE[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === "matched" ? "bg-lime" : status === "review" ? "bg-sand" : "bg-muted"}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Chip({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono ${muted ? "text-muted border border-dashed border-line" : "bg-line/70 text-ink"}`}>
      {children}
    </span>
  );
}

export function Select({ value, onChange, options, className = "", ariaLabel }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string; ariaLabel?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-surface shadow-inner-soft rounded-xl px-3 py-2 text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-primary/40 ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={`bg-surface shadow-inner-soft rounded-xl px-4 py-2.5 text-sm font-medium text-ink placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/40 ${className}`}
    />
  );
}
