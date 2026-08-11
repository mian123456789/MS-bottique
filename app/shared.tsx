"use client";

import { AlertTriangle, PackageOpen, X } from "lucide-react";
import { ReactNode } from "react";

export type Row = Record<string, string | number | boolean | null>;

export type SessionUser = {
  id: number; name: string; username: string; email: string;
  role: "Owner" | "Staff" | "Shop"; shopId: number; active: boolean; permissions: string[];
};

export const initials = (name: string) => name.split(" ").filter(Boolean).map((word) => word[0]).slice(0, 2).join("").toUpperCase() || "MS";

export const today = "2026-08-09";
export const currentPeriod = today.slice(0, 7);

export const number = (value: unknown) => Number(value ?? 0);
export const fmt = (value: unknown) => number(value).toLocaleString("en-US");
export const round2 = (value: number) => Math.round(value * 100) / 100;

// Whole amounts stay clean; per-piece rates and pro-rata pay keep their paisa.
export const money = (value: unknown) => {
  const amount = number(value);
  return `Rs ${amount.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
};

// A month's day-rate uses the real length of that month, so August pays over 31
// days and September over 30 — never a fixed working-day count.
export const daysInPeriod = (period: string) => {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return 30;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

export const formatDate = (value: unknown, withTime = false) => {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", withTime ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

export function cx(...classes: Array<string | false | null | undefined>) { return classes.filter(Boolean).join(" "); }

export function StatusBadge({ status }: { status: unknown }) {
  const value = String(status || "Waiting");
  const tone = /completed|delivered|in stock|dispatched|paid|received|active|present|balanced|cleared/i.test(value) && !/partially|unpaid|non/i.test(value) ? "success"
    : /running|progress|transit|warehouse|ready|issued|ordered|shipped/i.test(value) ? "info"
    : /hold|delay|rejected|error|absent|sold out|closed|inactive|critical/i.test(value) ? "danger"
    : /partial|rework|packing|pending|unpaid|half/i.test(value) ? "warning" : "neutral";
  return <span className={`status status-${tone}`}><span className="status-dot" />{value}</span>;
}

export function Progress({ value, compact = false }: { value: number; compact?: boolean }) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  return <div className={cx("progress-wrap", compact && "compact")}><div className="progress-track"><span style={{ width: `${safe}%` }} /></div><b>{safe}%</b></div>;
}

export function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={cx("modal", wide && "modal-wide")} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header className="modal-header"><div><h2 id="modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog" title="Close"><X size={19} /></button></header>
      <div className="modal-body">{children}</div>
    </section>
  </div>;
}

export function Field({ label, error, children, span = false }: { label: string; error?: string; children: ReactNode; span?: boolean }) {
  return <label className={cx("field", span && "field-span")}><span>{label}</span>{children}{error && <small className="field-error"><AlertTriangle size={13} />{error}</small>}</label>;
}

export function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><div><PackageOpen size={27} /></div><h3>{title}</h3><p>{detail}</p></div>;
}

export function SectionHead({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail: string; action?: ReactNode }) {
  return <div className="section-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2><p>{detail}</p></div>{action}</div>;
}

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
export function downloadCsv(rows: string[][], filename: string) {
  const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `${filename}.csv`; anchor.click();
  URL.revokeObjectURL(url);
}

export function exportRows(rows: Row[], filename: string) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]).filter((column) => !["password_hash"].includes(column));
  downloadCsv([columns, ...rows.map((row) => columns.map((column) => String(row[column] ?? "")))], filename);
}

// An uploaded logo reaches the client either as a fresh data URI (just picked) or
// as its cacheable endpoint URL (loaded from the server) — both count as uploaded.
export const hasUploadedLogo = (value: string) => value.startsWith("data:") || value.startsWith("/api/factory/logo");

// A dropped connection surfaces as a bare "Failed to fetch". Retry once, then
// explain what actually happened instead of leaking the browser's wording.
export async function apiFetch(url: string, init?: RequestInit) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetch(url, { cache: "no-store", ...init });
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  throw new Error(`Could not reach the server${lastError instanceof Error && lastError.message ? "" : ""}. Check that the app is still running, then try again.`);
}

export const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] || character));

// Opens a print-ready window; the browser's own print dialog saves it as PDF.
export function printDocument(title: string, styles: string, body: string) {
  const popup = window.open("", "_blank", "width=1024,height=800");
  if (!popup) { window.alert("Please allow pop-ups to print or save this document."); return; }
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${styles}</style></head><body>${body}</body></html>`);
  popup.document.close(); popup.focus(); popup.onload = () => popup.print();
}

// Reads a picked image as a data URI so the logo travels with the record and
// prints on invoices without any external hosting.
export function readLogoFile(file: File | null | undefined, onDone: (dataUrl: string) => void, onError: (message: string) => void) {
  if (!file) return;
  if (!/^image\/(png|jpeg|jpg|webp|gif|svg\+xml)$/.test(file.type)) return onError("Choose a PNG, JPG, WEBP, GIF or SVG image.");
  if (file.size > 400 * 1024) return onError(`That image is ${Math.round(file.size / 1024)} KB. Please choose a logo under 400 KB.`);
  const reader = new FileReader();
  reader.onload = () => onDone(String(reader.result || ""));
  reader.onerror = () => onError("That image could not be read. Try a different file.");
  reader.readAsDataURL(file);
}
