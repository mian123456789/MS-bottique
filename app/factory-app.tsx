"use client";

import {
  AlertTriangle, ArrowRight, ArrowUp, Banknote, Bell, BellRing, Boxes, CalendarCheck, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronRight, Circle, ClipboardCheck, ClipboardList, ClipboardPlus, Clock, DoorOpen, Download, Eye, Factory,
  FileBarChart, FileText, Filter, Flower2, Info, LayoutDashboard, LoaderCircle, LockKeyhole,
  Globe2, Image, LogOut, MapPin, Menu, PackageCheck, PackageOpen, Palette, Pencil,
  Phone, Plus, Printer, ReceiptText, Route, Save, Scissors, Search, Send, Settings, ShieldCheck, Shirt,
  Receipt, ShoppingBag, Sparkles, Store, Trash2, TrendingUp, Truck, Upload, UserCog, UserPlus, Users, Wallet, Warehouse as WarehouseIcon, X,
} from "lucide-react";
import { apiFetch, escapeHtml, hasUploadedLogo, initials, printDocument, readLogoFile, SessionUser } from "./shared";
import { Dispatch, FormEvent, ReactNode, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Row = Record<string, string | number | boolean | null>;
type FactoryState = {
  lots: Row[];
  sizes: Row[];
  records: Record<string, Row[]>;
  warehouse: Row[];
  receipts: Row[];
  dispatches: Row[];
  gatepasses: Row[];
  transfers: Row[];
  remarks: Row[];
  history: Row[];
  audits: Row[];
  customers: Row[];
  designs: Row[];
  employees: Row[];
  attendance: Row[];
  salaries: Row[];
  pieceWork: Row[];
  advances: Row[];
  users: SessionUser[];
  suppliers: Row[];
  purchases: Row[];
  shops: Row[];
  shopShipments: Row[];
  shopInventory: Row[];
  shopSales: Row[];
  shopSaleItems: Row[];
  shopExpenses: Row[];
  shopDayClose: Row[];
  notifications: Row[];
  settings: Row;
};

const emptyState: FactoryState = {
  lots: [], sizes: [], records: {}, warehouse: [], receipts: [], dispatches: [], gatepasses: [],
  transfers: [], remarks: [], history: [], audits: [], customers: [], designs: [],
  employees: [], attendance: [], salaries: [], pieceWork: [], advances: [], users: [],
  suppliers: [], purchases: [], shops: [], shopShipments: [], shopInventory: [], shopSales: [], shopSaleItems: [], shopExpenses: [], shopDayClose: [],
  notifications: [], settings: {},
};

// Packing hands the lot to Gatepass, and only a released gate pass reaches Warehouse.
const workflow = ["Issue Lot", "Embroidery", "Cutting", "Stitching", "Finishing", "Packing", "Gatepass", "Warehouse", "Customer Dispatch"];
const departmentPages = ["Embroidery", "Cutting", "Stitching", "Finishing", "Packing"];
const dispatchStatuses = ["Active", "In Transit", "Shipped", "Delivered"];
const attendanceStatuses = ["Present", "Absent", "Half Day", "Leave", "Overtime", "Holiday"];
const employeeDepartments = ["Embroidery", "Cutting", "Stitching", "Finishing", "Packing", "Gatepass", "Warehouse", "Customer Dispatch", "Administration"];
const today = "2026-08-09";
const currentPeriod = today.slice(0, 7);
// A month's day-rate uses the real length of that month, so August pays over 31
// days and September over 30 — never a fixed working-day count.
const daysInPeriod = (period: string) => {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return 30;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};
const number = (value: unknown) => Number(value ?? 0);
const fmt = (value: unknown) => number(value).toLocaleString("en-US");
// Whole amounts stay clean; per-piece rates and pro-rata pay keep their paisa.
const money = (value: unknown) => {
  const amount = number(value);
  return `Rs ${amount.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
};
const round2 = (value: number) => Math.round(value * 100) / 100;
const formatDate = (value: unknown, withTime = false) => {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", withTime ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

const nav = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Issue Lot", icon: ClipboardPlus },
  { label: "Lot Progress", icon: Route },
  { label: "Embroidery", icon: Flower2 },
  { label: "Cutting", icon: Scissors },
  { label: "Stitching", icon: Shirt },
  { label: "Finishing", icon: Sparkles },
  { label: "Packing", icon: PackageCheck },
  { label: "Gatepass", icon: DoorOpen },
  { label: "Warehouse", icon: WarehouseIcon },
  { label: "Customer Dispatch", icon: Truck },
  { section: "TRADE" },
  { label: "Purchase", icon: ShoppingBag },
  { label: "Shops", icon: Store },
  { section: "MASTER DATA" },
  { label: "Designs", icon: Palette },
  { label: "Customers", icon: Users },
  { label: "Inventory", icon: Boxes },
  { label: "Reports", icon: FileBarChart },
  { section: "ADMINISTRATION" },
  { label: "Employees", icon: UserCog },
  { label: "Attendance", icon: CalendarCheck },
  { label: "Salary", icon: Wallet },
  { label: "Users & Permissions", icon: ShieldCheck },
  { label: "Audit Logs", icon: FileText },
  { label: "Settings", icon: Settings },
];

function cx(...classes: Array<string | false | null | undefined>) { return classes.filter(Boolean).join(" "); }

function StatusBadge({ status }: { status: unknown }) {
  const value = String(status || "Waiting");
  const tone = /completed|delivered|in stock|dispatched/i.test(value) && !/partially/i.test(value) ? "success" : /running|progress|received|warehouse|ready/i.test(value) ? "info" : /hold|delay|rejected|error/i.test(value) ? "danger" : /partial|rework|packing/i.test(value) ? "warning" : "neutral";
  return <span className={`status status-${tone}`}><span className="status-dot" />{value}</span>;
}

function Progress({ value, compact = false }: { value: number; compact?: boolean }) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  return <div className={cx("progress-wrap", compact && "compact")}><div className="progress-track"><span style={{ width: `${safe}%` }} /></div><b>{safe}%</b></div>;
}

function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={cx("modal", wide && "modal-wide")} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header className="modal-header"><div><h2 id="modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog" title="Close"><X size={19} /></button></header>
      <div className="modal-body">{children}</div>
    </section>
  </div>;
}

function Field({ label, error, children, span = false }: { label: string; error?: string; children: ReactNode; span?: boolean }) {
  return <label className={cx("field", span && "field-span")}><span>{label}</span>{children}{error && <small className="field-error"><AlertTriangle size={13} />{error}</small>}</label>;
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><div><PackageOpen size={27} /></div><h3>{title}</h3><p>{detail}</p></div>;
}

export function Login({ onSignedIn }: { onSignedIn: (user: SessionUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) return setError("Enter your username and password.");
    setBusy(true);
    try {
      const response = await apiFetch("/api/factory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", username: username.trim(), password }) });
      const data = await response.json() as { error?: string; user?: SessionUser };
      if (!response.ok || !data.user) throw new Error(data.error || "Incorrect username or password.");
      onSignedIn(data.user);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to sign in."); }
    finally { setBusy(false); }
  };
  return <main className="login-page">
    <section className="login-brand">
      <div className="brand-pill"><span className="logo-mark">MS</span><span>MS Boutique</span></div>
      <div className="login-copy"><span className="eyebrow light">FACTORY OPERATIONS, CONNECTED</span><h1>One design.<br />Every department.<br /><em>Complete control.</em></h1><p>Track every production lot from issue to customer dispatch without losing a single piece.</p></div>
      <div className="workflow-ribbon">{workflow.slice(0, 8).map((item, index) => <span key={item}>{item}{index < 7 && <ArrowRight size={14} />}</span>)}</div>
    </section>
    <section className="login-panel">
      <form className="login-card" onSubmit={submit}>
        <div className="mobile-login-brand"><span className="logo-mark">MS</span><b>MS Boutique</b></div>
        <span className="eyebrow">WELCOME BACK</span><h2>Sign in</h2><p className="muted">Factory staff and shop counters sign in with the account the owner set up.</p>
        <Field label="Username"><div className="input-icon"><UserCog size={17} /><input autoComplete="username" placeholder="Your username" value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }} /></div></Field>
        <Field label="Password"><div className="input-icon"><LockKeyhole size={17} /><input type="password" autoComplete="current-password" placeholder="Your password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} /></div></Field>
        {error && <div className="login-error"><AlertTriangle size={16} />{error}</div>}
        <button className="button primary login-button" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : null} Sign in <ArrowRight size={17} /></button>
      </form>
      <p className="login-footer">MS Boutique © 2026 – Factory Management System</p>
    </section>
  </main>;
}

type ModalState = { type: string; lot?: Row; department?: string; record?: Row; customer?: Row; receipt?: Row; gatepass?: Row; employee?: Row } | null;
type Alert = { id: number; title: string; message: string; level: string; category: string; actor: string; link: string };

export default function FactoryApp({ user, onSignOut }: { user: SessionUser; onSignOut: () => void }) {
  const isOwner = user.role === "Owner";
  // Staff only see the pages the owner ticked for them.
  const visibleNav = useMemo(() => {
    if (isOwner) return nav;
    const allowed = new Set(user.permissions);
    return nav.filter((item) => item.section ? true : allowed.has(String(item.label)))
      .filter((item, index, list) => !item.section || list.slice(index + 1).some((next) => !next.section));
  }, [isOwner, user.permissions]);
  const landing = isOwner ? "Dashboard" : String(visibleNav.find((item) => !item.section)?.label ?? "Dashboard");
  const [page, setPage] = useState(landing);
  const [state, setState] = useState<FactoryState>(emptyState);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [inbox, setInbox] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const seenAlerts = useRef<Set<number>>(new Set());

  // Any unread alert the owner has not been shown yet is raised as a banner.
  const raiseAlerts = useCallback((rows: Row[]) => {
    const fresh = rows.filter((row) => !number(row.read) && !seenAlerts.current.has(number(row.id)));
    if (!fresh.length) return;
    fresh.forEach((row) => seenAlerts.current.add(number(row.id)));
    setAlerts((current) => [...fresh.slice(0, 3).map((row) => ({
      id: number(row.id), title: String(row.title), message: String(row.message),
      level: String(row.level || "info"), category: String(row.category || "Factory"),
      actor: String(row.actor_name || "System"), link: String(row.link || ""),
    })), ...current].slice(0, 3));
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await apiFetch("/api/factory");
      const data = await response.json() as FactoryState & { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to load data.");
      setState(data);
      raiseAlerts(data.notifications || []);
    } catch (error) { if (!silent) setToast({ type: "error", text: error instanceof Error ? error.message : "Unable to load data." }); }
    finally { if (!silent) setLoading(false); }
  }, [raiseAlerts]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 3600); return () => clearTimeout(id); }, [toast]);
  // Alerts stay live without a page refresh — but a background tab does no work.
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 45000);
    return () => clearInterval(id);
  }, [load]);
  // Banners clear themselves quickly so they never sit on top of page actions.
  useEffect(() => { if (!alerts.length) return; const id = setTimeout(() => setAlerts((current) => current.slice(0, -1)), 6000); return () => clearTimeout(id); }, [alerts]);

  const post = async (payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      const response = await apiFetch("/api/factory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string; message?: string; state?: FactoryState };
      if (!response.ok) throw new Error(data.error || "Unable to save this change.");
      if (data.state) { setState(data.state); raiseAlerts(data.state.notifications || []); }
      setToast({ type: "success", text: data.message || "Saved successfully." });
      setModal(null);
      return true;
    } catch (error) { setToast({ type: "error", text: error instanceof Error ? error.message : "Unable to save this change." }); return false; }
    finally { setSaving(false); }
  };

  const filteredGlobal = useMemo(() => {
    if (!globalSearch.trim()) return [];
    const query = globalSearch.toLowerCase();
    return state.lots.filter((lot) => String(lot.lot_no).toLowerCase().includes(query) || String(lot.design_no).toLowerCase().includes(query)).slice(0, 5);
  }, [globalSearch, state.lots]);

  const unread = state.notifications.filter((item) => !number(item.read)).length;
  const scrollTop = (behavior: ScrollBehavior = "smooth") => scroller.current?.scrollTo({ top: 0, behavior });
  const openPage = (value: string) => { setPage(value); setSidebar(false); setGlobalSearch(""); scrollTop(); };
  const pageProps = { state, post, saving, setModal, openPage, user };

  return <div className="app-shell">
    <aside className={cx("sidebar", sidebar && "sidebar-open")}>
      <div className="sidebar-brand"><span className="logo-mark">MS</span><div><b>MS Boutique</b><small>Factory Management</small></div><button className="sidebar-close" onClick={() => setSidebar(false)} aria-label="Close navigation"><X size={19} /></button></div>
      <nav className="nav-list">
        {visibleNav.map((item, index) => item.section ? <div className="nav-section" key={`${item.section}-${index}`}>{item.section}</div> : <button key={item.label} className={cx("nav-item", page === item.label && "active")} onClick={() => openPage(String(item.label))}>{item.icon && <item.icon size={18} strokeWidth={1.8} />}<span>{item.label}</span>{page === item.label && <span className="active-notch" />}</button>)}
      </nav>
      <div className="sidebar-user"><div className="avatar">{initials(user.name)}</div><div><b>{user.name}</b><span>{isOwner ? "Owner" : "Staff"}</span></div><button title="Sign out" aria-label="Sign out" onClick={onSignOut}><LogOut size={18} /></button></div>
    </aside>
    {sidebar && <button className="sidebar-scrim" onClick={() => setSidebar(false)} aria-label="Close navigation" />}
    <div className="main-shell">
      <header className="topbar">
        <div className="topbar-left"><button className="menu-button" onClick={() => setSidebar(true)} aria-label="Open navigation"><Menu /></button><div><h1>{page}</h1><p>{pageSubtitle(page)}</p></div></div>
        <div className="topbar-actions">
          <div className="global-search"><Search size={17} /><input aria-label="Search lot or design" placeholder="Search lot or design…" value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} />{globalSearch && <button onClick={() => setGlobalSearch("")} aria-label="Clear search"><X size={15} /></button>}
            {globalSearch && <div className="search-results">{filteredGlobal.length ? filteredGlobal.map((lot) => <button key={String(lot.id)} onClick={() => { setGlobalSearch(""); setModal({ type: "detail", lot }); }}><span><b>{String(lot.design_no)}</b><small>{String(lot.lot_no)} · {String(lot.fabrication)}</small></span><StatusBadge status={lot.current_department} /></button>) : <p>No matching lots</p>}</div>}
          </div>
          <div className="notification-dock">
            <button className={cx("icon-button notification-button", unread > 0 && "ringing")} title="Notifications" aria-label={`Notifications, ${unread} unread`} aria-expanded={inbox} onClick={() => setInbox((open) => !open)}>{unread > 0 ? <BellRing size={19} /> : <Bell size={19} />}{unread > 0 && <span>{unread}</span>}</button>
            {inbox && <NotificationInbox state={state} post={post} saving={saving} onClose={() => setInbox(false)} />}
          </div>
          <button className="profile-button" onClick={() => isOwner && openPage("Users & Permissions")}><span className="avatar">{initials(user.name)}</span><span><b>{user.name}</b><small>{isOwner ? "Owner" : "Staff"}</small></span><ChevronDown size={15} /></button>
        </div>
      </header>
      <div className="scroll-area" ref={scroller} onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 320)}>
        <main className="content">
          {loading ? <LoadingView /> : <div className="page-transition" key={page}>
            {page === "Dashboard" && <Dashboard {...pageProps} />}
            {page === "Issue Lot" && <IssueLot {...pageProps} />}
            {page === "Lot Progress" && <LotProgress {...pageProps} />}
            {departmentPages.includes(page) && <DepartmentPage {...pageProps} department={page} />}
            {page === "Gatepass" && <GatepassPage {...pageProps} />}
            {page === "Warehouse" && <WarehousePage {...pageProps} />}
            {page === "Customer Dispatch" && <DispatchPage {...pageProps} />}
            {page === "Reports" && <ReportsPage {...pageProps} />}
            {["Designs", "Customers", "Inventory"].includes(page) && <MasterDataPage {...pageProps} page={page} />}
            {page === "Purchase" && <PurchasePage {...pageProps} />}
            {page === "Shops" && <ShopsPage {...pageProps} />}
            {page === "Employees" && <EmployeesPage {...pageProps} />}
            {page === "Attendance" && <AttendancePage {...pageProps} />}
            {page === "Salary" && <SalaryPage {...pageProps} />}
            {["Users & Permissions", "Audit Logs", "Settings"].includes(page) && <AdminPage {...pageProps} page={page} />}
          </div>}
        </main>
        <footer>MS Boutique © 2026 – Factory Management System</footer>
      </div>
      <button className={cx("scroll-top", scrolled && "visible")} onClick={() => scrollTop()} aria-label="Back to top" title="Back to top"><ArrowUp size={17} /></button>
    </div>
    <div className="alert-stack" role="status" aria-live="polite">
      {alerts.map((alert) => <article key={alert.id} className={`alert-banner alert-${alert.level}`}>
        <span className="alert-icon">{alert.level === "success" ? <CheckCircle2 size={17} /> : alert.level === "warning" ? <AlertTriangle size={17} /> : alert.level === "critical" ? <AlertTriangle size={17} /> : <Info size={17} />}</span>
        <div><b>{alert.title}</b><p>{alert.message}</p><small>{alert.category} · {alert.actor}</small></div>
        <div className="alert-actions">
          <button onClick={() => { setAlerts((current) => current.filter((item) => item.id !== alert.id)); openPage(alert.link && nav.some((item) => item.label === alert.link) ? alert.link : "Notifications"); }}>View</button>
          <button aria-label="Dismiss alert" onClick={() => setAlerts((current) => current.filter((item) => item.id !== alert.id))}><X size={14} /></button>
        </div>
      </article>)}
    </div>
    {toast && <div className={cx("toast", toast.type)}>{toast.type === "success" ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}<span>{toast.text}</span><button onClick={() => setToast(null)} aria-label="Dismiss notification"><X size={15} /></button></div>}
    {modal?.type === "new-lot" && <NewLotModal onClose={() => setModal(null)} onSave={post} saving={saving} state={state} />}
    {modal?.type === "detail" && modal.lot && <LotDetail lot={modal.lot} state={state} onClose={() => setModal(null)} setModal={setModal} />}
    {modal?.type === "edit-lot" && modal.lot && <EditLotModal lot={modal.lot} state={state} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "production" && modal.lot && modal.department && <ProductionModal lot={modal.lot} department={modal.department} state={state} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "transfer" && modal.lot && modal.department && <TransferModal lot={modal.lot} department={modal.department} state={state} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "remark" && modal.lot && <RemarkModal lot={modal.lot} department={modal.department || String(modal.lot.current_department)} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "dispatch" && modal.lot && <DispatchModal lot={modal.lot} state={state} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "gatepass" && modal.lot && modal.gatepass && <GatepassModal lot={modal.lot} gatepass={modal.gatepass} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "gatepass-release" && modal.lot && modal.gatepass && <GatepassReleaseModal lot={modal.lot} gatepass={modal.gatepass} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "warehouse-receive" && modal.lot && modal.receipt && <WarehouseReceiveModal lot={modal.lot} receipt={modal.receipt} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "dispatch-detail" && modal.record && <DispatchDetailModal dispatch={modal.record} settings={state.settings} onClose={() => setModal(null)} />}
    {modal?.type === "customer" && <CustomerModal customer={modal.customer} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "delete-customer" && modal.customer && <DeleteCustomerModal customer={modal.customer} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "employee" && <EmployeeModal employee={modal.employee} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "delete-employee" && modal.employee && <DeleteEmployeeModal employee={modal.employee} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "attendance" && <AttendanceModal record={modal.record} state={state} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "salary" && <SalaryModal record={modal.record} state={state} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "advance" && <AdvanceModal state={state} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "purchase" && <PurchaseModal record={modal.record} state={state} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "shop" && <ShopModal record={modal.record} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "ship-shop" && <ShipToShopModal state={state} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "user" && <UserModal record={modal.record} state={state} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "delete-gatepass" && modal.gatepass && <DeleteGatepassModal gatepass={modal.gatepass} onClose={() => setModal(null)} onSave={post} saving={saving} />}
    {modal?.type === "delete-lot" && modal.lot && <DeleteLotModal lot={modal.lot} state={state} onClose={() => setModal(null)} onSave={post} saving={saving} />}
  </div>;
}

function pageSubtitle(page: string) {
  if (page === "Dashboard") return "Lot & Production Tracking System";
  if (page === "Lot Progress") return "Track every piece across the factory floor";
  if (page === "Gatepass") return "Packing releases to Warehouse under a signed gate pass";
  if (page === "Attendance") return "Daily attendance for monthly and theka staff";
  if (page === "Salary") return "Monthly and per-piece payroll";
  return `MS Boutique • ${page}`;
}

type PageProps = { state: FactoryState; post: (payload: Record<string, unknown>) => Promise<boolean>; saving: boolean; setModal: (value: ModalState) => void; openPage: (page: string) => void; user: SessionUser };

function LoadingView() { return <div className="loading-view"><LoaderCircle className="spin" size={30} /><h2>Preparing the factory floor…</h2><p>Loading live lots, quantities and department activity.</p></div>; }

type Card = { label: string; value: string | number; detail: string; icon: typeof Route; tone: string };

// The dashboard is assembled from the areas this account actually works in, so a
// warehouse user opens straight onto their own stock rather than the whole factory.
function Dashboard({ state, setModal, openPage, user }: PageProps) {
  const owner = user.role === "Owner";
  const can = (page: string) => owner || user.permissions.includes(page);
  const myDepartments = departmentPages.filter(can);
  const seesProduction = myDepartments.length > 0 || can("Lot Progress") || can("Issue Lot");
  const seesWarehouse = can("Warehouse");
  const seesGatepass = can("Gatepass");
  const seesDispatch = can("Customer Dispatch");
  const seesInventory = can("Inventory");
  const seesPurchase = can("Purchase");
  const seesShops = can("Shops");
  const seesPayroll = can("Salary") || can("Attendance") || can("Employees");

  const cards: Card[] = [];
  if (seesProduction) {
    const totalQty = state.lots.reduce((sum, lot) => sum + number(lot.quantity), 0);
    const active = state.lots.filter((lot) => !/Delivered|Dispatched/i.test(String(lot.status))).length;
    const delayed = state.lots.filter((lot) => String(lot.required_delivery_date) < today && !/Delivered|Dispatched/i.test(String(lot.status))).length;
    cards.push(
      { label: "Active Lots", value: active, detail: `${state.lots.length} total issued`, icon: Route, tone: "green" },
      { label: "Production QTY", value: fmt(totalQty), detail: "Across active orders", icon: Factory, tone: "blue" },
      { label: "Delayed Lots", value: delayed, detail: delayed ? "Needs attention" : "All on schedule", icon: AlertTriangle, tone: "red" },
    );
  }
  // A department user gets their own received / pending / completed figures.
  for (const department of myDepartments) {
    const records = state.records[department] || [];
    const received = records.reduce((sum, row) => sum + number(row.received_qty), 0);
    const completed = records.reduce((sum, row) => sum + number(row.completed_qty), 0);
    cards.push({ label: `${department} Pending`, value: fmt(Math.max(0, received - completed)), detail: `${fmt(completed)} of ${fmt(received)} PCS done`, icon: departmentCardIcon(department), tone: "purple" });
  }
  if (seesGatepass) {
    const pending = state.gatepasses.filter((row) => row.status === "Pending");
    cards.push({ label: "Gate Passes Pending", value: pending.length, detail: `${fmt(pending.reduce((sum, row) => sum + number(row.quantity), 0))} PCS awaiting issue`, icon: DoorOpen, tone: "orange" });
  }
  if (seesWarehouse || seesInventory) {
    const stock = state.warehouse.reduce((sum, row) => sum + number(row.balance_qty), 0);
    const nonReceivable = state.receipts.reduce((sum, row) => sum + number(row.non_receivable_qty), 0);
    const expected = state.receipts.filter((row) => String(row.status) === "Expected");
    cards.push(
      { label: "Warehouse Stock", value: fmt(stock), detail: "Finished goods PCS on hand", icon: WarehouseIcon, tone: "teal" },
      { label: "Awaiting Receipt", value: fmt(expected.reduce((sum, row) => sum + number(row.received_qty), 0)), detail: `${expected.length} gate pass${expected.length === 1 ? "" : "es"} in transit`, icon: PackageOpen, tone: "orange" },
      { label: "Non-Receivable", value: fmt(nonReceivable), detail: nonReceivable ? "Held out of stock" : "None reported", icon: AlertTriangle, tone: "red" },
    );
  }
  if (seesDispatch) {
    cards.push({ label: "Ready to Dispatch", value: state.warehouse.filter((row) => number(row.balance_qty) > 0).length, detail: `${state.dispatches.length} shipments recorded`, icon: Truck, tone: "orange" });
  }
  if (seesPurchase) {
    const outstanding = state.purchases.reduce((sum, row) => sum + number(row.balance_amount), 0);
    cards.push({ label: "Purchase Outstanding", value: money(outstanding), detail: `${state.purchases.filter((row) => !/Received/i.test(String(row.status))).length} awaiting delivery`, icon: ShoppingBag, tone: "blue" });
  }
  if (seesPayroll) {
    const unpaid = state.salaries.filter((row) => String(row.period) === currentPeriod && row.payment_status !== "Paid");
    cards.push({ label: "Payroll Outstanding", value: money(unpaid.reduce((sum, row) => sum + number(row.net_payable), 0)), detail: `${unpaid.length} unpaid this month`, icon: Wallet, tone: "purple" });
  }

  const chartDepartments = myDepartments.length ? myDepartments : workflow.slice(1, 7);
  const deptData = chartDepartments.map((department) => ({ department, count: state.lots.filter((lot) => lot.current_department === department).length, qty: state.lots.filter((lot) => lot.current_department === department).reduce((sum, lot) => sum + number(lot.quantity), 0) }));
  const maxQty = Math.max(...deptData.map((item) => item.qty), 1);
  const chartTotal = deptData.reduce((sum, item) => sum + item.qty, 0);

  // Activity is filtered to the areas this account can actually see.
  const myAreas = new Set([...myDepartments, ...(seesWarehouse ? ["Warehouse"] : []), ...(seesGatepass ? ["Gatepass"] : []), ...(seesDispatch ? ["Customer Dispatch"] : []), ...(seesProduction ? ["Issue Lot"] : [])]);
  const activity = owner ? state.history : state.history.filter((row) => myAreas.has(String(row.department)));
  const myLots = owner || !myDepartments.length ? state.lots : state.lots.filter((lot) => myDepartments.includes(String(lot.current_department)));

  const focus = owner ? "Here’s what’s moving across your factory today."
    : myDepartments.length === 1 && !seesWarehouse ? `Your ${myDepartments[0]} department at a glance.`
    : seesWarehouse && myDepartments.length === 0 ? "Your warehouse stock at a glance."
    : "Everything you have access to, at a glance.";

  return <div className="page-stack">
    <section className="dashboard-hero"><div><span className="eyebrow light">{formatDate(today).toUpperCase()}</span><h2>Good afternoon, {user.name.split(" ")[0]}.</h2><p>{focus}</p></div>{can("Issue Lot") && <button className="button light" onClick={() => setModal({ type: "new-lot" })}><Plus size={17} /> Issue New Lot</button>}</section>

    {cards.length > 0 && <section className="metric-grid">{cards.map((card) => <article className="metric-card" key={card.label}><div className={`metric-icon ${card.tone}`}><card.icon size={20} /></div><div><span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}</small></div></article>)}</section>}

    {seesProduction && <section className="dashboard-grid">
      <article className="panel chart-panel"><div className="panel-head"><div><span className="eyebrow">PRODUCTION OVERVIEW</span><h3>{myDepartments.length ? "Your department load" : "Department-wise production"}</h3></div><span className="live-indicator"><i /> Live</span></div>
        <div className="bar-chart">{deptData.map((item) => <div className="bar-group" key={item.department}><div className="bar-value">{item.qty ? `${Math.round(item.qty / 100) / 10}k` : "0"}</div><div className="bar-track"><span style={{ height: `${Math.max(7, item.qty / maxQty * 100)}%` }} /></div><small>{item.department.slice(0, 4)}</small></div>)}</div>
        <div className="chart-legend"><span><i className="legend-green" />Active production qty</span><b>{fmt(chartTotal)} PCS</b></div>
      </article>
      <article className="panel location-panel"><div className="panel-head"><div><span className="eyebrow">LIVE LOCATION</span><h3>Current lot location</h3></div>{can("Lot Progress") && <button className="link-button" onClick={() => openPage("Lot Progress")}>View all <ArrowRight size={14} /></button>}</div>
        <div className="donut-row"><div className="donut" style={{ background: donutGradient(deptData) }}><span><b>{myLots.length}</b><small>LOTS</small></span></div><div className="donut-legend">{deptData.filter((item) => item.count).map((item, index) => <div key={item.department}><i className={`dot dot-${index % 5}`} /><span>{item.department}</span><b>{item.count}</b></div>)}</div></div>
      </article>
    </section>}

    {(seesWarehouse || seesInventory) && <WarehouseSnapshot state={state} openPage={openPage} canOpen={can("Warehouse")} />}
    {seesShops && <ShopPerformance state={state} openPage={openPage} />}

    <section className="dashboard-grid lower">
      <article className="panel live-panel"><div className="panel-head"><div><span className="eyebrow">{myDepartments.length ? "YOUR DEPARTMENT" : "FACTORY FLOOR"}</span><h3>Live lot progress</h3></div><span className="live-indicator"><i /> Live</span></div>
        <div className="live-lots">{myLots.slice(0, 4).map((lot) => <button key={String(lot.id)} onClick={() => setModal({ type: "detail", lot })}><div className="lot-monogram">{String(lot.design_no).slice(-2)}</div><div className="live-lot-copy"><b>{String(lot.design_no)} <span>/ {String(lot.lot_no)}</span></b><small>{fmt(lot.quantity)} PCS · Current: {String(lot.current_department)}</small><Progress value={lotProgress(lot)} compact /></div><ChevronRight size={18} /></button>)}</div>
        {!myLots.length && <Empty title="Nothing on your floor" detail="Lots appear here once they are transferred into your department." />}
      </article>
      <article className="panel activity-panel"><div className="panel-head"><div><span className="eyebrow">ACTIVITY</span><h3>Recent movements</h3></div></div>
        <ActivityList rows={activity.slice(0, 5)} />
        {!activity.length && <Empty title="No activity yet" detail="Movements in your areas show up here." />}
      </article>
    </section>
  </div>;
}

const departmentCardIcon = (department: string) => department === "Embroidery" ? Flower2 : department === "Cutting" ? Scissors : department === "Stitching" ? Shirt : department === "Finishing" ? Sparkles : PackageCheck;
const donutTones = ["#2f9e44", "#3569df", "#7753c7", "#d98516", "#15858a"];
function donutGradient(data: Array<{ count: number }>) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  if (!total) return "conic-gradient(#dde5e0 0 100%)";
  let cursor = 0;
  const stops = data.filter((item) => item.count).map((item, index) => {
    const start = cursor;
    cursor += item.count / total * 100;
    return `${donutTones[index % donutTones.length]} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function WarehouseSnapshot({ state, openPage, canOpen }: { state: FactoryState; openPage: (page: string) => void; canOpen: boolean }) {
  const rows = [...state.warehouse].sort((a, b) => number(b.balance_qty) - number(a.balance_qty)).slice(0, 6);
  const received = state.warehouse.reduce((sum, row) => sum + number(row.available_qty), 0);
  const dispatched = state.warehouse.reduce((sum, row) => sum + number(row.dispatched_qty), 0);
  const balance = state.warehouse.reduce((sum, row) => sum + number(row.balance_qty), 0);
  const nonReceivable = state.warehouse.reduce((sum, row) => sum + number(row.non_receivable_qty), 0);
  const max = Math.max(...rows.map((row) => number(row.available_qty)), 1);
  return <section className="panel warehouse-snapshot">
    <div className="panel-head"><div><span className="eyebrow">YOUR WAREHOUSE</span><h3>Stock on hand</h3></div>{canOpen && <button className="link-button" onClick={() => openPage("Warehouse")}>Open warehouse <ArrowRight size={14} /></button>}</div>
    <div className="shop-perf-strip">
      <article><span className="status-chip tone-active"><WarehouseIcon size={16} /></span><div><small>Receivable received</small><b>{fmt(received)}</b></div></article>
      <article><span className="status-chip tone-in-transit"><Truck size={16} /></span><div><small>Dispatched out</small><b>{fmt(dispatched)}</b></div></article>
      <article><span className="status-chip tone-shipped"><Boxes size={16} /></span><div><small>Balance on hand</small><b>{fmt(balance)}</b></div></article>
      <article><span className="status-chip tone-delivered"><AlertTriangle size={16} /></span><div><small>Non-receivable</small><b>{fmt(nonReceivable)}</b></div></article>
    </div>
    <div className="payroll-bars">{rows.map((row) => <div className="payroll-bar" key={String(row.id)}>
      <div className="payroll-bar-head"><b>{String(row.design_no)} <span style={{ color: "var(--muted)", fontWeight: 400 }}>/ {String(row.lot_no)}</span></b><span>{String(row.customer)}</span></div>
      <div className="payroll-track"><i className="fill green" style={{ width: `${Math.max(3, Math.min(100, number(row.balance_qty) / max * 100))}%` }} /><i className="advance" style={{ width: `${Math.min(100, number(row.dispatched_qty) / max * 100)}%` }} /></div>
      <div className="payroll-bar-foot"><span>On hand <b>{fmt(row.balance_qty)} PCS</b></span><span>Dispatched <b className="red-text">{fmt(row.dispatched_qty)}</b></span><span>Status <b>{String(row.dispatch_status || "Active")}</b></span></div>
    </div>)}</div>
    {!rows.length && <Empty title="No stock yet" detail="Received gate passes add finished goods to your warehouse." />}
  </section>;
}

function ShopPerformance({ state, openPage }: { state: FactoryState; openPage: (page: string) => void }) {
  if (!state.shops.length) return null;
  const rows = state.shops.map((shop) => {
    const sales = state.shopSales.filter((row) => number(row.shop_id) === number(shop.id));
    const stock = state.shopInventory.filter((row) => number(row.shop_id) === number(shop.id));
    const revenue = sales.reduce((sum, row) => sum + number(row.total_amount), 0);
    const todayRevenue = sales.filter((row) => String(row.sale_date) === today).reduce((sum, row) => sum + number(row.total_amount), 0);
    const sold = stock.reduce((sum, row) => sum + number(row.sold_qty), 0);
    const remaining = stock.reduce((sum, row) => sum + number(row.remaining_qty), 0);
    const expenses = state.shopExpenses.filter((row) => number(row.shop_id) === number(shop.id)).reduce((sum, row) => sum + number(row.amount), 0);
    return { shop, sales, revenue, todayRevenue, sold, remaining, expenses, cash: sales.filter((row) => row.payment_method === "Cash").reduce((sum, row) => sum + number(row.total_amount), 0) };
  });
  // Scale against whichever is larger so a shop with costs but no sales yet still
  // reads correctly instead of showing a full-width expense bar.
  const max = Math.max(...rows.flatMap((row) => [row.revenue, row.expenses]), 1);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalToday = rows.reduce((sum, row) => sum + row.todayRevenue, 0);
  const totalSold = rows.reduce((sum, row) => sum + row.sold, 0);
  const totalRemaining = rows.reduce((sum, row) => sum + row.remaining, 0);

  return <section className="panel shop-performance">
    <div className="panel-head"><div><span className="eyebrow">RETAIL NETWORK</span><h3>Shop sales performance</h3></div><button className="link-button" onClick={() => openPage("Shops")}>Manage shops <ArrowRight size={14} /></button></div>
    <div className="shop-perf-strip">
      <article><span className="status-chip tone-active"><Store size={16} /></span><div><small>Shops trading</small><b>{rows.filter((row) => row.shop.status === "Active").length}</b></div></article>
      <article><span className="status-chip tone-in-transit"><TrendingUp size={16} /></span><div><small>Total retail sales</small><b>{money(totalRevenue)}</b></div></article>
      <article><span className="status-chip tone-shipped"><Receipt size={16} /></span><div><small>Sales today</small><b>{money(totalToday)}</b></div></article>
      <article><span className="status-chip tone-delivered"><Boxes size={16} /></span><div><small>PCS sold / remaining</small><b>{fmt(totalSold)} / {fmt(totalRemaining)}</b></div></article>
    </div>
    <div className="payroll-bars">{rows.map((row) => <div className="payroll-bar" key={String(row.shop.id)}>
      <div className="payroll-bar-head"><b>{String(row.shop.name)}</b><span>{row.sales.length} invoices · {fmt(row.sold)} PCS sold</span></div>
      <div className="payroll-track"><i className="fill green" style={{ width: `${row.revenue > 0 ? Math.max(3, Math.min(100, row.revenue / max * 100)) : 0}%` }} /><i className="advance" style={{ width: `${Math.min(100, row.expenses / max * 100)}%` }} /></div>
      <div className="payroll-bar-foot"><span>Revenue <b>{money(row.revenue)}</b></span><span>Today <b className="green-text">{money(row.todayRevenue)}</b></span><span>Expenses <b className="red-text">{money(row.expenses)}</b></span><span>Stock left <b>{fmt(row.remaining)} PCS</b></span></div>
    </div>)}</div>
  </section>;
}

function ActivityList({ rows }: { rows: Row[] }) { return <div className="activity-list">{rows.map((row, index) => <div className="activity-item" key={`${row.id}-${index}`}><span className={cx("activity-mark", index === 0 && "active")}><Check size={12} /></span><div><b>{String(row.action)}</b><p>{String(row.remarks || row.department || "Factory activity")}</p><small>{formatDate(row.created_at, true)} · {String(row.user_name || "Ayesha Khan")}</small></div>{number(row.quantity) > 0 && <em>{fmt(row.quantity)} PCS</em>}</div>)}</div>; }

function SectionHead({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail: string; action?: ReactNode }) { return <div className="section-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2><p>{detail}</p></div>{action}</div>; }

function lotBreakdownRows(lot: Row, state: FactoryState) { return state.sizes.filter((item) => number(item.lot_id) === number(lot.id)); }
function lotBreakdownText(lot: Row, state: FactoryState) {
  const rows = lotBreakdownRows(lot, state); if (!rows.length) return `Sizes ${String(lot.size_range)}`;
  const colours = [...new Set(rows.map((item) => String(item.colour || "General")))];
  return colours.map((colour) => `${colour}: ${rows.filter((item) => String(item.colour || "General") === colour).map((item) => `${String(item.size)} ${fmt(item.quantity)}`).join(" / ")}`).join(" · ");
}

function printLotBook(lots: Row[], state: FactoryState, documentTitle: string) {
  if (!lots.length) { window.alert("There are no lots to print."); return; }
  const settings = state.settings; const logo = settings.logo_url ? `<img src="${escapeHtml(settings.logo_url)}" alt="Company logo">` : `<div class="mark">MS</div>`;
  const pages = lots.map((lot) => {
    const breakdown = lotBreakdownRows(lot, state);
    const remarks = state.remarks.filter((item) => number(item.lot_id) === number(lot.id));
    const history = state.history.filter((item) => number(item.lot_id) === number(lot.id));
    const production = departmentPages.map((department) => ({ department, record: state.records[department]?.find((item) => number(item.lot_id) === number(lot.id)) }));
    const gatepasses = state.gatepasses.filter((item) => number(item.lot_id) === number(lot.id));
    const stock = state.warehouse.find((item) => number(item.lot_id) === number(lot.id));
    const dispatches = state.dispatches.filter((item) => number(item.lot_id) === number(lot.id));
    const colourRows = breakdown.length ? breakdown.map((item) => `<tr><td>${escapeHtml(item.colour || "General")}</td><td>${escapeHtml(item.size || "ALL")}</td><td class="num">${escapeHtml(fmt(item.quantity))}</td></tr>`).join("") : `<tr><td>General</td><td>${escapeHtml(lot.size_range)}</td><td class="num">${escapeHtml(fmt(lot.quantity))}</td></tr>`;
    const progressRows = [
      `<tr><td>Issue Lot</td><td>${escapeHtml(fmt(lot.quantity))}</td><td>${escapeHtml(fmt(lot.quantity))}</td><td>0</td><td>${escapeHtml(lot.current_department === "Issue Lot" ? lot.status : "Completed")}</td></tr>`,
      ...production.map(({ department, record }) => `<tr><td>${escapeHtml(department)}</td><td>${escapeHtml(fmt(record?.received_qty))}</td><td>${escapeHtml(fmt(record?.completed_qty))}</td><td>${escapeHtml(fmt(Math.max(0, number(record?.received_qty) - number(record?.completed_qty))))}</td><td>${escapeHtml(record?.status || "Pending")}</td></tr>`),
      `<tr><td>Gatepass</td><td>${escapeHtml(fmt(gatepasses.reduce((sum, item) => sum + number(item.quantity), 0)))}</td><td>${escapeHtml(fmt(gatepasses.filter((item) => item.status === "Released").reduce((sum, item) => sum + number(item.quantity), 0)))}</td><td>—</td><td>${escapeHtml(gatepasses[0]?.status || "Pending")}</td></tr>`,
      `<tr><td>Warehouse</td><td>${escapeHtml(fmt(stock?.available_qty))}</td><td>${escapeHtml(fmt(stock?.dispatched_qty))}</td><td>${escapeHtml(fmt(stock ? Math.max(0, number(stock.available_qty) - number(stock.dispatched_qty)) : 0))}</td><td>${escapeHtml(stock?.status || "Pending")}</td></tr>`,
      `<tr><td>Customer Dispatch</td><td>${escapeHtml(fmt(dispatches.reduce((sum, item) => sum + number(item.dispatch_qty), 0)))}</td><td>${escapeHtml(fmt(dispatches.filter((item) => /Delivered/i.test(String(item.delivery_status))).reduce((sum, item) => sum + number(item.dispatch_qty), 0)))}</td><td>—</td><td>${escapeHtml(dispatches[0]?.delivery_status || "Pending")}</td></tr>`,
    ].join("");
    const remarkRows = remarks.length ? remarks.map((item) => `<article><p>${escapeHtml(item.remark)}</p><small>${escapeHtml(formatDate(item.created_at, true))} · ${escapeHtml(item.department || "Issue Lot")} · ${escapeHtml(item.user_name || "System")}</small></article>`).join("") : `<article><p>${escapeHtml(lot.remarks || "No remarks entered.")}</p><small>Current lot remark</small></article>`;
    const historyRows = history.length ? history.map((item) => `<tr><td>${escapeHtml(formatDate(item.created_at, true))}</td><td>${escapeHtml(item.department || "Issue Lot")}</td><td>${escapeHtml(item.action)}</td><td class="num">${number(item.quantity) ? escapeHtml(fmt(item.quantity)) : "—"}</td><td>${escapeHtml(item.remarks || "—")}</td></tr>`).join("") : `<tr><td colspan="5">No activity history yet.</td></tr>`;
    return `<main class="lot-page"><header><div class="brand">${logo}<div><h1>${escapeHtml(settings.company_name || "MS Boutique")}</h1><p>${escapeHtml(settings.address || "Factory Management System")}</p><small>${escapeHtml(settings.phone || "")}${settings.website ? ` · ${escapeHtml(settings.website)}` : ""}</small></div></div><div class="doc-type"><span>${escapeHtml(documentTitle)}</span><b>${escapeHtml(lot.lot_no)}</b><small>Printed ${escapeHtml(formatDate(new Date().toISOString(), true))}</small></div></header><section class="hero"><div><small>DESIGN</small><b>${escapeHtml(lot.design_no)}</b></div><div><small>TOTAL QTY</small><b>${escapeHtml(fmt(lot.quantity))} PCS</b></div><div><small>PROGRESS</small><b>${Math.round(lotProgress(lot))}%</b></div><div><small>STATUS</small><b>${escapeHtml(lot.status)}</b></div></section><section class="meta"><div><small>Fabrication</small><b>${escapeHtml(lot.fabrication)}</b></div><div><small>Customer</small><b>${escapeHtml(lot.customer)}</b></div><div><small>Size Range</small><b>${escapeHtml(lot.size_range)}</b></div><div><small>Priority</small><b>${escapeHtml(lot.priority)}</b></div><div><small>Order Date</small><b>${escapeHtml(formatDate(lot.order_date))}</b></div><div><small>Issue Date</small><b>${escapeHtml(formatDate(lot.issue_date))}</b></div><div><small>Required Date</small><b>${escapeHtml(formatDate(lot.required_delivery_date))}</b></div><div><small>Current Department</small><b>${escapeHtml(lot.current_department)}</b></div></section><section class="workflow">${workflow.map((item, index) => `<span class="${index < workflow.indexOf(String(lot.current_department)) ? "done" : index === workflow.indexOf(String(lot.current_department)) ? "current" : ""}">${index + 1}<b>${escapeHtml(item === "Customer Dispatch" ? "Customer" : item)}</b></span>`).join("")}</section><section class="columns"><div><h2>Colour / Size Breakdown</h2><table><thead><tr><th>Colour</th><th>Size</th><th class="num">Quantity</th></tr></thead><tbody>${colourRows}</tbody><tfoot><tr><td colspan="2">Total</td><td class="num">${escapeHtml(fmt(lot.quantity))}</td></tr></tfoot></table></div><div><h2>Complete Lot Progress</h2><table><thead><tr><th>Department</th><th class="num">Received</th><th class="num">Completed</th><th class="num">Pending</th><th>Status</th></tr></thead><tbody>${progressRows}</tbody></table></div></section><section class="remarks"><h2>Remarks</h2><div>${remarkRows}</div></section><section class="history"><h2>Activity / Transfer History</h2><table><thead><tr><th>Date</th><th>Department</th><th>Activity</th><th class="num">QTY</th><th>Remarks</th></tr></thead><tbody>${historyRows}</tbody></table></section><section class="signatures"><span>Issued By</span><span>Production Manager</span><span>Quality Approval</span><span>Authorized Signature</span></section><footer>${escapeHtml(settings.footer_note || "Computer generated full lot production sheet.")}</footer></main>`;
  }).join("");
  printDocument(documentTitle, `@page{size:A4 landscape;margin:7mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172333;margin:0;background:#fff;font-size:9px}.lot-page{min-height:195mm;border:1px solid #cbd5dc;padding:7mm;page-break-after:always;position:relative}.lot-page:last-child{page-break-after:auto}header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #118969;padding-bottom:9px}.brand{display:flex;align-items:center;gap:10px}.brand img,.mark{width:46px;height:46px;object-fit:contain;border-radius:7px}.mark{display:grid;place-items:center;background:#118969;color:#fff;font-size:17px;font-weight:800}.brand h1{font-size:18px;margin:0 0 3px}.brand p,.brand small{display:block;margin:0;color:#657383}.doc-type{text-align:right}.doc-type span{display:block;color:#118969;font-size:8px;font-weight:800;letter-spacing:1px}.doc-type b{display:block;font-size:16px;margin:4px 0}.doc-type small{color:#657383}.hero{display:grid;grid-template-columns:repeat(4,1fr);background:#172b3f;color:#fff;margin:10px 0}.hero div{padding:8px 12px;border-right:1px solid #43576b}.hero div:last-child{border:0}.hero small,.meta small{display:block;font-size:7px;text-transform:uppercase;letter-spacing:.5px;opacity:.75}.hero b{display:block;font-size:12px;margin-top:3px}.meta{display:grid;grid-template-columns:repeat(8,1fr);border:1px solid #dbe1e6}.meta div{padding:7px;border-right:1px solid #dbe1e6}.meta div:last-child{border:0}.meta b{display:block;margin-top:3px;font-size:8px}.workflow{display:grid;grid-template-columns:repeat(9,1fr);gap:4px;margin:8px 0}.workflow span{background:#eef2f5;border-radius:4px;padding:5px;text-align:center;color:#82909c;font-size:7px}.workflow span b{display:block;margin-top:2px}.workflow .done{background:#dff4ed;color:#08795d}.workflow .current{background:#118969;color:#fff}.columns{display:grid;grid-template-columns:.78fr 1.22fr;gap:9px}h2{font-size:9px;margin:7px 0 5px;text-transform:uppercase;letter-spacing:.5px;color:#526171}table{width:100%;border-collapse:collapse}th{background:#edf2f4;text-align:left;font-size:7px;padding:4px 5px;border:1px solid #dbe1e6}td{padding:4px 5px;border:1px solid #dbe1e6;vertical-align:top}tfoot td{font-weight:800;background:#e7f5f0}.num{text-align:right}.remarks>div{display:grid;grid-template-columns:repeat(2,1fr);gap:5px}.remarks article{border-left:3px solid #118969;background:#f2f7f5;padding:5px 7px}.remarks p{margin:0 0 2px;line-height:1.35}.remarks small{color:#6d7987;font-size:7px}.history tbody tr:nth-child(n+9){display:none}.signatures{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin:18px 0 8px}.signatures span{border-top:1px solid #637181;padding-top:5px;text-align:center;font-size:7px}footer{text-align:center;border-top:1px solid #dbe1e6;padding-top:5px;color:#6d7987;font-size:7px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`, pages);
}

function IssueLot({ state, setModal, user }: PageProps) {
  const issueLots = state.lots.filter((lot) => lot.current_department === "Issue Lot" || state.transfers.some((transfer) => number(transfer.lot_id) === number(lot.id) && number(transfer.from_department_id) === 1));
  return <div className="page-stack"><SectionHead eyebrow="PRODUCTION START" title="Issue Lot" detail="Every factory order begins here with a controlled, traceable lot." action={<div className="action-group"><button className="button secondary" onClick={() => exportRows(issueLots, "MS-Boutique-Issue-Lots")}><Download size={16} /> Excel</button><button className="button secondary" onClick={() => printLotBook(issueLots, state, "Issued Lot Full Sheets")}><FileText size={16} /> PDF</button><button className="button secondary" onClick={() => printLotBook(issueLots, state, "Issued Lot Full Sheets")}><Printer size={16} /> Print</button><button className="button primary" onClick={() => setModal({ type: "new-lot" })}><Plus size={17} /> Issue New Lot</button></div>} />
    <div className="workflow-banner"><div className="workflow-label"><ClipboardPlus size={20} /><span><b>Strict factory workflow</b><small>Lots move only after an authorized transfer.</small></span></div><div className="mini-flow">{workflow.map((item, index) => <span key={item} className={index === 0 ? "active" : ""}>{index + 1}. {item}{index < workflow.length - 1 && <ChevronRight size={13} />}</span>)}</div></div>
    <article className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">ISSUED LOTS</span><h3>Lot register</h3></div><span className="record-count">{issueLots.length} records</span></div><div className="table-scroll"><table><thead><tr><th>Lot / Design</th><th>Fabrication</th><th>Customer</th><th>QTY</th><th>Issue Date</th><th>Priority</th><th>Status</th><th className="right">Action</th></tr></thead><tbody>{issueLots.map((lot) => <tr key={String(lot.id)}><td><button className="table-primary" onClick={() => setModal({ type: "detail", lot })}>{String(lot.lot_no)}<small>{String(lot.design_no)}</small></button></td><td>{String(lot.fabrication)}<small className="cell-sub colour-size-summary">{lotBreakdownText(lot, state)}</small></td><td>{String(lot.customer)}</td><td><b>{fmt(lot.quantity)}</b> PCS</td><td>{formatDate(lot.issue_date)}</td><td><span className={`priority ${String(lot.priority).toLowerCase()}`}>{String(lot.priority)}</span></td><td><StatusBadge status={lot.status} /></td><td className="right"><div className="row-actions"><button title="Print full lot sheet" aria-label="Print full lot sheet" onClick={() => printLotBook([lot], state, "Issued Lot Full Sheet")}><Printer size={16} /></button><button title="Edit lot" aria-label="Edit lot" onClick={() => setModal({ type: "edit-lot", lot })}><Pencil size={16} /></button>{user.role === "Owner" && <button title="Delete lot" aria-label="Delete lot" onClick={() => setModal({ type: "delete-lot", lot })}><Trash2 size={16} /></button>}{lot.current_department === "Issue Lot" && <button className="table-action" onClick={() => setModal({ type: "transfer", lot, department: "Issue Lot" })}>To Embroidery <ArrowRight size={14} /></button>}</div></td></tr>)}</tbody></table></div></article>
  </div>;
}

function FilterBar({ search, setSearch, department, setDepartment, status, setStatus, customer, setCustomer, state }: { search: string; setSearch: (v: string) => void; department: string; setDepartment: (v: string) => void; status: string; setStatus: (v: string) => void; customer: string; setCustomer: (v: string) => void; state: FactoryState }) {
  return <div className="filter-bar"><div className="filter-search"><Search size={17} /><input placeholder="Search Design No. or Lot No." value={search} onChange={(e) => setSearch(e.target.value)} /></div><div className="select-wrap"><Filter size={15} /><select value={department} onChange={(e) => setDepartment(e.target.value)}><option value="">All departments</option>{workflow.map((item) => <option key={item}>{item}</option>)}</select></div><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{["Waiting","In Progress","Running","Partially Completed","Completed","Hold","Rework","Ready for Dispatch","Dispatched"].map((item) => <option key={item}>{item}</option>)}</select><select value={customer} onChange={(e) => setCustomer(e.target.value)}><option value="">All customers</option>{state.customers.map((item) => <option key={String(item.id)}>{String(item.name)}</option>)}</select>{(search || department || status || customer) && <button className="clear-filters" onClick={() => { setSearch(""); setDepartment(""); setStatus(""); setCustomer(""); }}><X size={14} /> Clear</button>}</div>;
}

function LotProgress({ state, setModal }: PageProps) {
  const [search, setSearch] = useState(""); const [department, setDepartment] = useState(""); const [status, setStatus] = useState(""); const [customer, setCustomer] = useState("");
  const rows = state.lots.filter((lot) => (!search || `${lot.lot_no} ${lot.design_no} ${lot.fabrication}`.toLowerCase().includes(search.toLowerCase())) && (!department || lot.current_department === department) && (!status || String(lot.status).includes(status)) && (!customer || lot.customer === customer));
  return <div className="page-stack"><SectionHead eyebrow="CONTROL TOWER" title="Lot Progress / Production Tracking" detail="One live view of every design, quantity and department handoff." action={<div className="action-group"><button className="button secondary" onClick={() => exportRows(rows, "MS-Boutique-Lot-Progress")}><Download size={16} /> Excel</button><button className="button secondary" onClick={() => printLotBook(rows, state, "Lot Progress Full Sheets")}><FileText size={16} /> PDF</button><button className="button secondary" onClick={() => printLotBook(rows, state, "Lot Progress Full Sheets")}><Printer size={16} /> Print</button></div>} />
    <FilterBar {...{ search, setSearch, department, setDepartment, status, setStatus, customer, setCustomer, state }} />
    <article className="panel table-panel tracking-table"><div className="panel-head compact"><span><b>{rows.length}</b> production lots</span><span className="updated-label"><span className="live-dot" /> Live quantities · Updated just now</span></div><div className="table-scroll"><table><thead><tr><th>Lot / Design</th><th>Fabrication</th><th>QTY</th><th>Current Department</th><th>Status</th><th>Completed / Pending</th><th>Progress</th><th>Required Date</th><th>Remarks</th><th>Actions</th></tr></thead><tbody>{rows.map((lot) => <tr key={String(lot.id)}><td><button className="table-primary" onClick={() => setModal({ type: "detail", lot })}>{String(lot.lot_no)}<small>{String(lot.design_no)} · {String(lot.size_range)}</small></button></td><td>{String(lot.fabrication)}<small className="cell-sub">{String(lot.customer)}</small><small className="cell-sub colour-size-summary">{lotBreakdownText(lot, state)}</small></td><td><b>{fmt(lot.quantity)}</b><small className="cell-sub">PCS</small></td><td><span className="department-chip">{departmentIcon(String(lot.current_department))}{String(lot.current_department)}</span></td><td><StatusBadge status={lot.status} /></td><td><b>{fmt(lot.completed_qty)}</b><small className="cell-sub">{fmt(Math.max(0, number(lot.quantity) - number(lot.completed_qty)))} pending</small></td><td><Progress value={lotProgress(lot)} compact /></td><td>{formatDate(lot.required_delivery_date)}</td><td><span className="remarks-cell" title={String(lot.remarks)}>{String(lot.remarks)}</span></td><td><div className="row-actions"><button title="Print full progress sheet" aria-label="Print full progress sheet" onClick={() => printLotBook([lot], state, "Lot Progress Full Sheet")}><Printer size={16} /></button><button title="View full history" aria-label="View full history" onClick={() => setModal({ type: "detail", lot })}><Eye size={16} /></button><button title="Edit lot" aria-label="Edit lot" onClick={() => setModal({ type: "edit-lot", lot })}><Pencil size={16} /></button><button title="Add remark" aria-label="Add remark" onClick={() => setModal({ type: "remark", lot })}><FileText size={16} /></button></div></td></tr>)}</tbody></table></div>{!rows.length && <Empty title="No production lots found" detail="Try clearing a filter or search for a different Design No." />}</article>
  </div>;
}

function departmentIcon(department: string) { const Icon = department === "Embroidery" ? Flower2 : department === "Cutting" ? Scissors : department === "Stitching" ? Shirt : department === "Finishing" ? Sparkles : department === "Packing" ? PackageCheck : department === "Gatepass" ? DoorOpen : department === "Warehouse" ? WarehouseIcon : department === "Customer Dispatch" ? Truck : department === "Administration" ? ShieldCheck : ClipboardPlus; return <Icon size={15} />; }
function lotProgress(lot: Row) { const index = Math.max(0, workflow.indexOf(String(lot.current_department))); const phase = index / (workflow.length - 1) * 100; const within = number(lot.quantity) ? number(lot.completed_qty) / number(lot.quantity) * (100 / (workflow.length - 1)) : 0; return Math.min(100, phase + within); }

function DepartmentPage({ state, department, setModal }: PageProps & { department: string }) {
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("");
  const records = (state.records[department] || []).map((record) => ({ ...record, lot: state.lots.find((lot) => number(lot.id) === number(record.lot_id)) }) as Row & { lot?: Row }).filter((item) => item.lot && (!search || `${item.lot.lot_no} ${item.lot.design_no}`.toLowerCase().includes(search.toLowerCase())) && (!status || item.status === status));
  const received = records.reduce((sum, item) => sum + number(item.received_qty), 0); const completed = records.reduce((sum, item) => sum + number(item.completed_qty), 0); const pending = Math.max(0, received - completed);
  const next = workflow[workflow.indexOf(department) + 1];
  return <div className="page-stack"><SectionHead eyebrow="DEPARTMENT WORKBENCH" title={`${department} Department`} detail={`Receive incoming lots, record production and transfer verified quantities to ${next}.`} action={<div className="department-kpi"><span>{records.length}<small>LOTS</small></span><span>{fmt(pending)}<small>PENDING PCS</small></span></div>} />
    <section className="dept-summary"><article><span>Received quantity</span><b>{fmt(received)} <small>PCS</small></b><div className="micro-line blue"><i style={{ width: "100%" }} /></div></article><article><span>Completed quantity</span><b>{fmt(completed)} <small>PCS</small></b><div className="micro-line green"><i style={{ width: `${received ? completed / received * 100 : 0}%` }} /></div></article><article><span>Pending production</span><b>{fmt(pending)} <small>PCS</small></b><div className="micro-line orange"><i style={{ width: `${received ? pending / received * 100 : 0}%` }} /></div></article><article><span>Efficiency / yield</span><b>{received ? Math.round(completed / received * 100) : 0}<small>%</small></b><Progress value={received ? completed / received * 100 : 0} compact /></article></section>
    <div className="filter-bar department-filter"><div className="filter-search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lot or design…" /></div><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{["Waiting","Received","In Progress","Running","Partially Completed","Completed","Hold","Rework"].map((item) => <option key={item}>{item}</option>)}</select></div>
    <div className="department-records">{records.map((item) => { const lot = item.lot as Row; const available = number(item.completed_qty) - number(item.transferred_qty); return <article className="dept-card" key={String(item.id)}><div className="dept-card-head"><div className="lot-monogram">{String(lot.design_no).slice(-2)}</div><div><button onClick={() => setModal({ type: "detail", lot })}>{String(lot.design_no)} <span>/ {String(lot.lot_no)}</span></button><p>{String(lot.fabrication)} · {String(lot.size_range)} · {String(lot.customer)}</p></div><StatusBadge status={item.status} /></div><div className="quantity-grid"><span><small>Received</small><b>{fmt(item.received_qty)}</b></span><span><small>{department === "Finishing" || department === "Cutting" ? "Passed" : department === "Packing" ? "Packed" : "Completed"}</small><b>{fmt(item.completed_qty)}</b></span><span><small>Rejected</small><b className="red-text">{fmt(item.rejected_qty)}</b></span><span><small>Rework</small><b className="orange-text">{fmt(item.rework_qty)}</b></span><span><small>Pending</small><b>{fmt(Math.max(0, number(item.received_qty) - number(item.completed_qty)))}</b></span><span><small>Available to transfer</small><b className="green-text">{fmt(available)}</b></span></div><div className="dept-progress"><div><span>Production progress</span><b>{Math.round(number(item.completed_qty) / Math.max(1, number(item.received_qty)) * 100)}%</b></div><Progress value={number(item.completed_qty) / Math.max(1, number(item.received_qty)) * 100} /></div>{item.remarks && <p className="dept-remark"><FileText size={14} />{String(item.remarks)}</p>}<div className="dept-card-actions"><button className="button ghost" onClick={() => setModal({ type: "remark", lot, department })}><FileText size={15} /> Add Remark</button>{item.status === "Waiting" && <button className="button secondary" onClick={() => setModal({ type: "production", lot, department })}>Receive & Update</button>}{item.status !== "Waiting" && <button className="button secondary" onClick={() => setModal({ type: "production", lot, department })}><Pencil size={15} /> Update Production</button>}<button className="button primary" disabled={available <= 0} onClick={() => setModal({ type: "transfer", lot, department })}>Transfer to {next} <ArrowRight size={15} /></button></div></article>; })}{!records.length && <Empty title={`No ${department.toLowerCase()} lots`} detail="Incoming lots will appear here automatically after the previous department transfers them." />}</div>
  </div>;
}

function GatepassPage({ state, setModal, user }: PageProps) {
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("");
  // Several gate passes can be billed together on one invoice.
  const [selected, setSelected] = useState<number[]>([]);
  const rows = state.gatepasses.filter((item) => (!search || `${item.gatepass_no} ${item.lot_no} ${item.design_no} ${item.vehicle_no}`.toLowerCase().includes(search.toLowerCase())) && (!status || item.status === status));
  const pending = state.gatepasses.filter((item) => item.status === "Pending"); const issued = state.gatepasses.filter((item) => item.status === "Issued"); const released = state.gatepasses.filter((item) => item.status === "Released");
  const lotFor = (item: Row) => state.lots.find((lot) => number(lot.id) === number(item.lot_id));
  // The invoice format prices the movement from the shop rate already set for
  // this lot; with no rate the value columns print blank for hand completion.
  const rateFor = (lotId: unknown) => number(state.shopShipments.find((row) => number(row.lot_id) === number(lotId))?.sale_rate
    ?? state.shopInventory.find((row) => number(row.lot_id) === number(lotId))?.sale_rate);
  const toggle = (id: number) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const chosen = state.gatepasses.filter((item) => selected.includes(number(item.id)));
  const chosenQty = chosen.reduce((sum, item) => sum + number(item.quantity), 0);
  const chosenValue = chosen.reduce((sum, item) => sum + number(item.quantity) * rateFor(item.lot_id), 0);
  return <div className="page-stack"><SectionHead eyebrow="PACKING TO WAREHOUSE" title="Gatepass" detail="Every lot leaving Packing needs an issued gate pass before it can be shipped to the Warehouse." action={<div className="action-group"><button className="button secondary" onClick={() => exportRows(state.gatepasses, "MS-Boutique-Gatepass-Register")}><Download size={16} /> Excel</button><button className="button secondary" onClick={() => window.print()}><FileText size={16} /> PDF</button><button className="button secondary" onClick={() => window.print()}><Printer size={16} /> Print</button></div>} />
    <section className="warehouse-strip"><article><ClipboardList /><span>Awaiting gate pass<b>{fmt(pending.reduce((sum, item) => sum + number(item.quantity), 0))} PCS</b></span></article><article><DoorOpen /><span>Issued, not released<b>{fmt(issued.reduce((sum, item) => sum + number(item.quantity), 0))} PCS</b></span></article><article><Truck /><span>Released to Warehouse<b>{fmt(released.reduce((sum, item) => sum + number(item.quantity), 0))} PCS</b></span></article><article><CheckCircle2 /><span>Total gate passes<b>{state.gatepasses.length}</b></span></article></section>
    <div className="stage-flow"><span className="done">{departmentIcon("Packing")}<b>Packing</b><small>Cartons closed</small></span><ArrowRight size={16} /><span className="current"><DoorOpen size={15} /><b>Gatepass</b><small>Issue &amp; release</small></span><ArrowRight size={16} /><span className="pending">{departmentIcon("Warehouse")}<b>Warehouse</b><small>Receive &amp; count</small></span></div>
    <div className="filter-bar"><div className="filter-search"><Search size={17} /><input placeholder="Search gate pass, lot, design or vehicle…" value={search} onChange={(e) => setSearch(e.target.value)} /></div><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All gate pass statuses</option>{["Pending", "Issued", "Released"].map((item) => <option key={item}>{item}</option>)}</select>{(search || status) && <button className="clear-filters" onClick={() => { setSearch(""); setStatus(""); }}><X size={14} /> Clear</button>}</div>
    {selected.length > 0 && <div className="combine-bar">
      <div><b>{selected.length} gate pass{selected.length === 1 ? "" : "es"} selected</b><small>{fmt(chosenQty)} PCS across {new Set(chosen.map((item) => String(item.lot_no))).size} lot{new Set(chosen.map((item) => String(item.lot_no))).size === 1 ? "" : "s"}{chosenValue > 0 ? ` · ${money(chosenValue)} declared value` : " · no rates set, values print blank"}</small></div>
      <div className="action-group">
        <button className="button ghost" onClick={() => setSelected([])}><X size={15} /> Clear</button>
        <button className="button primary" onClick={() => printCombinedInvoice(chosen, state.settings, rateFor)}><ReceiptText size={16} /> Generate Combined Invoice</button>
      </div>
    </div>}
    <article className="panel table-panel gatepass-table"><div className="panel-head"><div><span className="eyebrow">GATE PASS REGISTER</span><h3>Warehouse shipment gate passes</h3></div><span className="record-count">{pending.length} pending · {issued.length} issued · {released.length} released</span></div>
      <div className="table-scroll"><table><thead><tr><th className="tick-col"><input type="checkbox" aria-label="Select all gate passes" checked={rows.length > 0 && rows.every((item) => selected.includes(number(item.id)))} onChange={(event) => setSelected(event.target.checked ? rows.map((item) => number(item.id)) : [])} /></th><th>Gate Pass No.</th><th>Lot / Design</th><th>Customer</th><th>QTY</th><th>Cartons</th><th>Route</th><th>Vehicle / Driver</th><th>Issued / Approved</th><th>Gate Pass Date</th><th>Security</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{rows.map((item) => { const lot = lotFor(item); return <tr key={String(item.id)} className={cx(selected.includes(number(item.id)) && "row-selected")}><td className="tick-col"><input type="checkbox" aria-label={`Select ${String(item.gatepass_no)}`} checked={selected.includes(number(item.id))} onChange={() => toggle(number(item.id))} /></td><td><button className="table-primary" onClick={() => lot && setModal({ type: "detail", lot })}>{String(item.gatepass_no)}<small>{String(item.purpose)}</small></button></td><td>{String(item.lot_no)}<small className="cell-sub">{String(item.design_no)} · {String(item.size_range)}</small></td><td>{String(item.customer)}</td><td><b>{fmt(item.quantity)}</b> PCS</td><td>{fmt(item.cartons)}</td><td><span className="route-cell">{String(item.from_department)} <ArrowRight size={11} /> {String(item.to_department)}</span></td><td>{String(item.vehicle_no || "—")}<small className="cell-sub">{String(item.driver_name || "Driver not assigned")}</small></td><td>{String(item.issued_by || "—")}<small className="cell-sub">{String(item.approved_by || "Awaiting approval")}</small></td><td>{formatDate(item.gatepass_date)}<small className="cell-sub">{item.release_date ? `Released ${formatDate(item.release_date)}` : "Not released"}</small></td><td><StatusBadge status={item.security_check} /></td><td><StatusBadge status={item.status} /></td>
          <td><div className="row-actions">
            {String(item.status) !== "Pending" && <select className="print-select" aria-label={`Print ${String(item.gatepass_no)}`} value="" onChange={(event) => { const choice = event.target.value; event.target.value = ""; if (choice === "gatepass") printMovementGatepass(item, state.settings); if (choice === "invoice") printInvoiceGatepass(item, state.settings, rateFor(item.lot_id)); }}>
              <option value="">Print…</option>
              <option value="gatepass">Gate Pass</option>
              <option value="invoice">Invoice Gate Pass</option>
            </select>}
            {String(item.status) === "Pending" && <button className="table-action" onClick={() => lot && setModal({ type: "gatepass", lot, gatepass: item })}>Issue Gate Pass <DoorOpen size={14} /></button>}
            {String(item.status) === "Issued" && <button className="table-action" onClick={() => lot && setModal({ type: "gatepass-release", lot, gatepass: item })}>Release to Warehouse <Truck size={14} /></button>}
            {String(item.status) === "Released" && <button className="button ghost small" onClick={() => lot && setModal({ type: "detail", lot })}><Eye size={14} /> Full status</button>}
            {user.role === "Owner" && <button title="Delete gate pass" aria-label="Delete gate pass" onClick={() => setModal({ type: "delete-gatepass", gatepass: item })}><Trash2 size={15} /></button>}
          </div></td></tr>; })}</tbody></table></div>
      {!rows.length && <Empty title="No gate passes yet" detail="Transfer a packed lot from the Packing department and its gate pass will be raised here automatically." />}
    </article>
  </div>;
}

function WarehousePage({ state, setModal }: PageProps) {
  const total = state.warehouse.reduce((sum, item) => sum + number(item.available_qty), 0); const dispatched = state.warehouse.reduce((sum, item) => sum + number(item.dispatched_qty), 0); const balance = state.warehouse.reduce((sum, item) => sum + number(item.balance_qty), 0); const expected = state.receipts.filter((item) => String(item.status) === "Expected");
  const nonReceivable = state.receipts.reduce((sum, item) => sum + number(item.non_receivable_qty), 0);
  return <div className="page-stack"><SectionHead eyebrow="FINISHED GOODS" title="Warehouse" detail="Confirm gate pass arrivals, split receivable from non-receivable pieces, and control every piece of finished-goods stock." action={<div className="action-group"><button className="button secondary" onClick={() => exportRows(state.receipts, "MS-Boutique-Warehouse-Receipts")}><Download size={16} /> Excel</button><button className="button secondary" onClick={() => window.print()}><FileText size={16} /> PDF</button><button className="button secondary" onClick={() => window.print()}><Printer size={16} /> Print</button></div>} />
    <section className="warehouse-strip"><article><PackageOpen /><span>Pending receipt<b>{fmt(expected.reduce((sum, item) => sum + number(item.received_qty), 0))} PCS</b></span></article><article><WarehouseIcon /><span>Receivable in stock<b>{fmt(total)} PCS</b></span></article><article><AlertTriangle /><span>Non-receivable<b>{fmt(nonReceivable)} PCS</b></span></article><article><Truck /><span>Dispatched stock<b>{fmt(dispatched)} PCS</b></span></article><article><CheckCircle2 /><span>Live balance<b>{fmt(balance)} PCS</b></span></article></section>
    <article className="panel table-panel warehouse-incoming"><div className="panel-head"><div><span className="eyebrow">GATE PASS TO WAREHOUSE</span><h3>Warehouse receipt status report</h3></div><span className="record-count">{expected.length} pending · {state.receipts.length - expected.length} received</span></div><div className="table-scroll"><table><thead><tr><th>Receipt No.</th><th>Gate Pass</th><th>Lot / Design</th><th>Customer</th><th>Gate Pass QTY</th><th>Receivable</th><th>Non-Receivable</th><th>Cartons</th><th>Received By</th><th>Location / Rack</th><th>Receipt Status</th><th>Action</th></tr></thead><tbody>{state.receipts.map((receipt) => { const lot = state.lots.find((row) => number(row.id) === number(receipt.lot_id)); const pendingReceipt = String(receipt.status) === "Expected"; return <tr key={String(receipt.id)}><td><b>{String(receipt.receipt_no)}</b><small className="cell-sub">{formatDate(receipt.created_at)}</small></td><td>{String(receipt.gatepass_no || "—")}</td><td><button className="table-primary" onClick={() => lot && setModal({ type: "detail", lot })}>{String(receipt.lot_no)}<small>{String(receipt.design_no)} · {String(receipt.size_range)}</small></button></td><td>{String(receipt.customer)}</td><td><b>{fmt(receipt.received_qty)}</b> PCS</td><td>{pendingReceipt ? <span className="muted-cell">Awaiting count</span> : <b className="green-text">{fmt(receipt.receivable_qty)}</b>}</td><td>{pendingReceipt ? <span className="muted-cell">—</span> : <span title={String(receipt.non_receivable_reason || "")}><b className={number(receipt.non_receivable_qty) ? "red-text" : ""}>{fmt(receipt.non_receivable_qty)}</b>{number(receipt.non_receivable_qty) > 0 && <small className="cell-sub">{String(receipt.non_receivable_reason)}</small>}</span>}</td><td>{fmt(receipt.cartons)}</td><td>{String(receipt.received_by || "Pending confirmation")}</td><td>{String(receipt.location || "Receiving Bay")}<small className="cell-sub">Rack {String(receipt.rack_no || "Unassigned")}</small></td><td><StatusBadge status={receipt.status} /></td><td>{pendingReceipt ? <button className="table-action" onClick={() => lot && setModal({ type: "warehouse-receive", lot, receipt })}>Received <ClipboardCheck size={14} /></button> : <button className="button ghost small" onClick={() => lot && setModal({ type: "detail", lot })}><Eye size={14} /> Full status</button>}</td></tr>; })}</tbody></table></div>{!state.receipts.length && <Empty title="No warehouse receipts" detail="A released gate pass creates an Expected receipt here until Warehouse confirms it." />}</article>
    <article className="panel table-panel warehouse-stock"><div className="panel-head"><div><span className="eyebrow">FULL STOCK REPORT</span><h3>Finished goods inventory</h3></div><span className="live-indicator"><i /> Live stock</span></div><div className="table-scroll"><table><thead><tr><th>Receipt / Lot</th><th>Design</th><th>Fabrication & Sizes</th><th>Receivable Added</th><th>Non-Receivable</th><th>Reserved</th><th>Dispatched</th><th>Balance</th><th>Location</th><th>Dispatch Status</th><th>Stock Status</th><th>Action</th></tr></thead><tbody>{state.warehouse.map((item) => { const lot = state.lots.find((row) => number(row.id) === number(item.lot_id)); const receipt = state.receipts.find((row) => number(row.lot_id) === number(item.lot_id) && String(row.status) !== "Expected"); return <tr key={String(item.id)}><td><button className="table-primary" onClick={() => lot && setModal({ type: "detail", lot })}>{String(receipt?.receipt_no || "WHR") }<small>{String(item.lot_no)}</small></button></td><td><b>{String(item.design_no)}</b><small className="cell-sub">{String(item.customer)}</small></td><td>{String(item.fabrication)}<small className="cell-sub">{String(item.size_range)}</small></td><td><b className="green-text">{fmt(item.available_qty)}</b></td><td><b className={number(item.non_receivable_qty) ? "red-text" : ""}>{fmt(item.non_receivable_qty)}</b></td><td>{fmt(item.reserved_qty)}</td><td>{fmt(item.dispatched_qty)}</td><td><b>{fmt(item.balance_qty)}</b></td><td>{String(receipt?.location || "Finished Goods")}<small className="cell-sub">Rack {String(receipt?.rack_no || "—")}</small></td><td><StatusBadge status={item.dispatch_status} /></td><td><StatusBadge status={item.status} /></td><td><div className="row-actions"><button title="View full lot status" aria-label="View full lot status" onClick={() => lot && setModal({ type: "detail", lot })}><Eye size={15} /></button><button className="table-action" disabled={number(item.balance_qty) <= 0} onClick={() => lot && setModal({ type: "dispatch", lot })}>Dispatch <Truck size={14} /></button></div></td></tr>; })}</tbody></table></div>{!state.warehouse.length && <Empty title="Warehouse stock is empty" detail="Stock appears after an Expected gate pass receipt is received and counted." />}</article>
  </div>;
}

function DispatchPage({ state, post, saving, setModal }: PageProps) {
  const ready = state.warehouse.filter((item) => number(item.balance_qty) > 0);
  return <div className="page-stack"><SectionHead eyebrow="FINAL MILE" title="Customer Dispatch" detail="Dispatch finished goods from Warehouse with invoice, transporter, gatepass and delivery tracking." action={<div className="action-group"><button className="button secondary" onClick={() => exportRows(state.dispatches, "MS-Boutique-Dispatch-Report")}><Download size={16} /> Excel</button><button className="button secondary" onClick={() => window.print()}><FileText size={16} /> PDF</button><button className="button secondary" onClick={() => window.print()}><Printer size={16} /> Print</button><button className="button primary" disabled={!ready.length} onClick={() => { const lot = state.lots.find((row) => number(row.id) === number(ready[0]?.lot_id)); if (lot) setModal({ type: "dispatch", lot }); }}><Send size={16} /> New Dispatch</button></div>} />
    <section className="dispatch-callout"><div><Truck size={25} /><span><b>{ready.length} order{ready.length === 1 ? "" : "s"} ready for dispatch</b><small>{fmt(ready.reduce((sum, item) => sum + number(item.balance_qty), 0))} PCS available in finished-goods stock.</small></span></div><div className="ready-chips">{ready.map((item) => <button key={String(item.id)} onClick={() => { const lot = state.lots.find((row) => number(row.id) === number(item.lot_id)); if (lot) setModal({ type: "dispatch", lot }); }}>{String(item.design_no)} · {fmt(item.balance_qty)} PCS <ArrowRight size={14} /></button>)}</div></section>
    <article className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">DISPATCH REGISTER</span><h3>Customer shipments & gatepasses</h3></div><span className="record-count">{state.dispatches.length} shipments</span></div><div className="table-scroll"><table><thead><tr><th>Dispatch No.</th><th>Lot / Design</th><th>Customer</th><th>Dispatch QTY</th><th>Invoice / Challan</th><th>Transport</th><th>Dispatch Date</th><th>Status</th><th>Delivery</th><th>Action</th></tr></thead><tbody>{state.dispatches.map((item) => <tr key={String(item.id)}><td><button className="table-primary" onClick={() => setModal({ type: "dispatch-detail", record: item })}>{String(item.dispatch_no)}<small>{String(item.tracking_no || "No tracking")}</small></button></td><td>{String(item.lot_no)}<small className="cell-sub">{String(item.design_no)}</small></td><td>{String(item.customer)}<small className="cell-sub">{String(item.destination)}</small></td><td><b>{fmt(item.dispatch_qty)}</b> PCS</td><td>{String(item.invoice_no)}<small className="cell-sub">{String(item.challan_no)}</small></td><td>{String(item.transporter || "—")}<small className="cell-sub">{String(item.vehicle_no || "—")}</small></td><td>{formatDate(item.dispatch_date)}</td><td><select className="status-select" aria-label={`Dispatch status for ${String(item.dispatch_no)}`} value={dispatchStatuses.includes(String(item.dispatch_status)) ? String(item.dispatch_status) : "In Transit"} disabled={saving} onChange={(e) => void post({ action: "update-dispatch-status", lotId: item.lot_id, dispatchStatus: e.target.value })}>{dispatchStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></td><td><StatusBadge status={item.delivery_status} /></td><td><button className="table-action" onClick={() => setModal({ type: "dispatch-detail", record: item })}>Details & Gatepass <ReceiptText size={14} /></button></td></tr>)}</tbody></table></div>{!state.dispatches.length && <Empty title="No customer dispatches yet" detail="Choose an available warehouse lot to create the first dispatch." />}</article>
  </div>;
}

function ReportsPage({ state }: PageProps) {
  const reports = ["Issue Lot Report", "Embroidery Report", "Cutting Report", "Stitching Report", "Finishing Report", "Packing Report", "Gatepass Register Report", "Warehouse Receipt Status Report", "Receivable & Non-Receivable Report", "Warehouse Stock Report", "Full Stock Movement Report", "Customer Dispatch Report", "Dispatch Status Report", "Lot Progress Report", "Design-wise Production Report", "Department-wise Production Report", "Pending Lot Report", "Delayed Lot Report", "Daily Production Report", "Monthly Production Report", "Employee Directory Report", "Attendance Report", "Theka Piece Work Report", "Salary Advance Report", "Salary & Theka Report"];
  const [selected, setSelected] = useState("Lot Progress Report");
  const reportRows = selected.includes("Gatepass") ? state.gatepasses
    : selected.includes("Receipt") || selected.includes("Receivable") ? state.receipts
    : selected.includes("Warehouse") || selected.includes("Stock") || selected.includes("Dispatch Status") ? state.warehouse
    : selected.includes("Dispatch") ? state.dispatches
    : selected.includes("Attendance") ? state.attendance
    : selected.includes("Piece Work") ? state.pieceWork
    : selected.includes("Advance") ? state.advances
    : selected.includes("Salary") ? state.salaries
    : selected.includes("Employee") ? state.employees
    : selected.includes("Audit") ? state.audits : state.lots;
  const reportColumns: string[][] = selected.includes("Gatepass") ? [["gatepass_no","Gate Pass"],["lot_no","Lot"],["design_no","Design"],["quantity","QTY"],["cartons","Cartons"],["vehicle_no","Vehicle"],["issued_by","Issued By"],["status","Status"]]
    : selected.includes("Receivable") ? [["receipt_no","Receipt"],["gatepass_no","Gate Pass"],["lot_no","Lot"],["received_qty","Gate Pass QTY"],["receivable_qty","Receivable"],["non_receivable_qty","Non-Receivable"],["non_receivable_reason","Reason"],["status","Status"]]
    : selected.includes("Receipt") ? [["receipt_no","Receipt"],["lot_no","Lot"],["design_no","Design"],["received_qty","Gate Pass QTY"],["cartons","Cartons"],["status","Receipt Status"],["received_by","Received By"]]
    : selected.includes("Dispatch Status") ? [["lot_no","Lot"],["design_no","Design"],["customer","Customer"],["available_qty","Receivable"],["dispatched_qty","Dispatched"],["balance_qty","Balance"],["dispatch_status","Dispatch Status"],["status","Stock Status"]]
    : selected.includes("Warehouse") || selected.includes("Stock") ? [["lot_no","Lot"],["design_no","Design"],["customer","Customer"],["available_qty","Receivable"],["non_receivable_qty","Non-Receivable"],["reserved_qty","Reserved"],["dispatched_qty","Dispatched"],["balance_qty","Balance"],["dispatch_status","Dispatch Status"]]
    : selected.includes("Dispatch") ? [["dispatch_no","Dispatch"],["lot_no","Lot"],["design_no","Design"],["customer","Customer"],["dispatch_qty","QTY"],["invoice_no","Invoice"],["dispatch_status","Status"]]
    : selected.includes("Attendance") ? [["attendance_date","Date"],["employee_code","Code"],["employee_name","Employee"],["department","Department"],["status","Status"],["overtime_hours","Overtime"],["pieces_done","Pieces"],["lot_no","Lot"]]
    : selected.includes("Piece Work") ? [["period","Period"],["employee_code","Code"],["employee_name","Employee"],["item","Item / Work"],["lot_no","Lot"],["pcs_qty","PCS Qty"],["rate_per_piece","Rate"],["total_amount","Total Amount"]]
    : selected.includes("Advance") ? [["period","Period"],["employee_code","Code"],["employee_name","Employee"],["department","Department"],["advance_date","Date"],["amount","Amount"],["remarks","Remarks"]]
    : selected.includes("Salary") ? [["period","Period"],["employee_code","Code"],["employee_name","Employee"],["salary_type","Type"],["present_days","Days"],["total_pieces","Pieces"],["base_amount","Base"],["advance","Advance"],["net_payable","Net Payable"],["payment_status","Status"]]
    : selected.includes("Employee") ? [["employee_code","Code"],["name","Employee"],["department","Department"],["designation","Designation"],["salary_type","Salary Type"],["monthly_salary","Monthly"],["rate_per_piece","Per Piece"],["status","Status"]]
    : [["lot_no","Lot"],["design_no","Design"],["customer","Customer"],["quantity","QTY"],["current_department","Department"],["status","Status"],["required_delivery_date","Required Date"]];
  return <div className="page-stack"><SectionHead eyebrow="ANALYTICS & EXPORTS" title="Reports" detail="Filter factory performance and export management-ready reports." />
    <section className="report-layout"><aside className="report-menu">{reports.map((item) => <button key={item} className={selected === item ? "active" : ""} onClick={() => setSelected(item)}><FileBarChart size={16} />{item}<ChevronRight size={15} /></button>)}</aside><article className="panel report-builder"><div className="report-title"><span className="report-icon"><FileBarChart /></span><div><h3>{selected}</h3><p>{reportRows.length} records available · Generated from live factory data</p></div></div><div className="report-filters"><Field label="Date Range"><select><option>01 Aug 2026 — 09 Aug 2026</option><option>This month</option><option>Last month</option></select></Field><Field label="Department"><select><option>All Departments</option>{workflow.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Status"><select><option>All Statuses</option><option>Expected</option><option>Received</option><option>In Progress</option><option>Completed</option><option>Hold</option></select></Field><Field label="Customer"><select><option>All Customers</option>{state.customers.map((item) => <option key={String(item.id)}>{String(item.name)}</option>)}</select></Field></div><div className="report-preview"><div className="report-stat"><span>Total records</span><b>{reportRows.length}</b></div><div className="report-stat"><span>{selected.includes("Salary") ? "Total payable" : "Total quantity"}</span><b>{selected.includes("Salary") ? money(reportRows.reduce((sum, item) => sum + number(item.net_payable), 0)) : fmt(reportRows.reduce((sum, item) => sum + number(item.quantity || item.dispatch_qty || item.available_qty || item.received_qty || item.pieces_done), 0))}</b></div><div className="report-stat"><span>Generated on</span><b>{formatDate(today)}</b></div></div><div className="report-table table-scroll"><table><thead><tr>{reportColumns.map(([key,label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{reportRows.slice(0, 10).map((row, index) => <tr key={`${row.id}-${index}`}>{reportColumns.map(([key]) => <td key={key}>{/qty|quantity/i.test(key) ? fmt(row[key]) : String(row[key] || "—")}</td>)}</tr>)}</tbody></table>{!reportRows.length && <Empty title="No report records" detail="Records will appear as factory activity is entered." />}</div><div className="report-actions"><button className="button primary" onClick={() => exportRows(reportRows, selected.replaceAll(" ", "-"))}><Download size={16} /> Export Excel</button><button className="button secondary" onClick={() => window.print()}><FileText size={16} /> Export PDF</button><button className="button secondary" onClick={() => window.print()}><Printer size={16} /> Print Report</button></div></article></section>
  </div>;
}

function InventoryTable({ state, post, saving, setModal }: PageProps) {
  const [status, setStatus] = useState(""); const [search, setSearch] = useState("");
  const rows = state.warehouse.filter((item) => (!status || String(item.dispatch_status || "Active") === status) && (!search || `${item.lot_no} ${item.design_no} ${item.customer}`.toLowerCase().includes(search.toLowerCase())));
  const counts = dispatchStatuses.map((value) => ({ value, count: state.warehouse.filter((item) => String(item.dispatch_status || "Active") === value).length, qty: state.warehouse.filter((item) => String(item.dispatch_status || "Active") === value).reduce((sum, item) => sum + number(value === "Active" ? item.balance_qty : item.dispatched_qty), 0) }));
  return <>
    <section className="status-cards field-span">{counts.map((item) => <button key={item.value} className={cx("status-card", status === item.value && "active")} onClick={() => setStatus(status === item.value ? "" : item.value)}><span className={`status-chip tone-${item.value.replace(" ", "-").toLowerCase()}`}>{item.value === "Active" ? <Boxes size={16} /> : item.value === "In Transit" ? <Truck size={16} /> : item.value === "Shipped" ? <Send size={16} /> : <CheckCircle2 size={16} />}</span><div><small>{item.value}</small><b>{item.count}</b><em>{fmt(item.qty)} PCS</em></div></button>)}</section>
    <article className="panel table-panel field-span">
      <div className="panel-head"><div><span className="eyebrow">STOCK &amp; DISPATCH STATUS</span><h3>Inventory register</h3></div><div className="inline-filters"><div className="filter-search"><Search size={16} /><input placeholder="Search lot, design or customer…" value={search} onChange={(e) => setSearch(e.target.value)} /></div><select aria-label="Filter dispatch status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{dispatchStatuses.map((item) => <option key={item}>{item}</option>)}</select></div></div>
      <div className="table-scroll"><table><thead><tr><th>Design</th><th>Lot No.</th><th>Customer</th><th>Receivable</th><th>Non-Receivable</th><th>Reserved</th><th>Dispatched</th><th>Balance</th><th>Stock Status</th><th>Dispatch Status</th><th className="right">Action</th></tr></thead>
        <tbody>{rows.map((item) => { const lot = state.lots.find((row) => number(row.id) === number(item.lot_id)); const current = String(item.dispatch_status || "Active"); return <tr key={String(item.id)}><td><b>{String(item.design_no)}</b><small className="cell-sub">{String(item.fabrication)}</small></td><td>{String(item.lot_no)}</td><td>{String(item.customer)}</td><td><b className="green-text">{fmt(item.available_qty)}</b></td><td><b className={number(item.non_receivable_qty) ? "red-text" : ""}>{fmt(item.non_receivable_qty)}</b></td><td>{fmt(item.reserved_qty)}</td><td>{fmt(item.dispatched_qty)}</td><td><b>{fmt(item.balance_qty)}</b></td><td><StatusBadge status={item.status} /></td>
          <td><select className="status-select" aria-label={`Dispatch status for ${String(item.lot_no)}`} value={current} disabled={saving} onChange={(e) => { if (e.target.value !== current) void post({ action: "update-dispatch-status", lotId: item.lot_id, dispatchStatus: e.target.value }); }}>{dispatchStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></td>
          <td className="right"><div className="row-actions"><button title="View full lot status" aria-label="View full lot status" onClick={() => lot && setModal({ type: "detail", lot })}><Eye size={15} /></button><button className="table-action" disabled={number(item.balance_qty) <= 0} onClick={() => lot && setModal({ type: "dispatch", lot })}>Dispatch <Truck size={14} /></button></div></td></tr>; })}</tbody></table></div>
      {!rows.length && <Empty title="No inventory rows" detail="Stock appears after Warehouse receives a released gate pass." />}
    </article>
  </>;
}

function MasterDataPage({ state, page, post, saving, setModal, openPage, user }: PageProps & { page: string }) {
  const rows = page === "Designs" ? state.designs : page === "Customers" ? state.customers : state.warehouse;
  return <div className="page-stack"><SectionHead eyebrow="MASTER DATA" title={page} detail={page === "Designs" ? "Design master with fabrication, sizes and production lots." : page === "Customers" ? "Add, edit and manage customers connected to factory orders." : "Live finished-goods stock with Active, In Transit, Shipped and Delivered status control."} action={<div className="action-group">{page === "Customers" && <button className="button primary" onClick={() => setModal({ type: "customer" })}><Plus size={16} /> Add Customer</button>}<button className="button secondary" onClick={() => exportRows(rows, `MS-Boutique-${page}`)}><Download size={16} /> Excel</button><button className="button secondary" onClick={() => window.print()}><FileText size={16} /> PDF</button><button className="button secondary" onClick={() => window.print()}><Printer size={16} /> Print</button></div>} />
    <section className="master-grid">{page === "Designs" && rows.map((item) => { const lots = state.lots.filter((lot) => number(lot.design_id) === number(item.id)); return <article className="master-card" key={String(item.id)}><div className="design-swatch"><Palette /></div><div><span>DESIGN</span><h3>{String(item.design_no)}</h3><p>{String(item.fabrication)} · {String(item.size_range)}</p></div><dl><div><dt>Production lots</dt><dd>{lots.length}</dd></div><div><dt>Total quantity</dt><dd>{fmt(lots.reduce((sum, lot) => sum + number(lot.quantity), 0))} PCS</dd></div></dl>{lots[0] && <button className="link-button" onClick={() => setModal({ type: "detail", lot: lots[0] })}>View production <ArrowRight size={14} /></button>}</article>; })}
      {page === "Customers" && rows.map((item) => { const lots = state.lots.filter((lot) => number(lot.customer_id) === number(item.id)); return <article className="master-card customer-card" key={String(item.id)}><div className="avatar large">{String(item.name).split(" ").map((word) => word[0]).slice(0,2).join("")}</div><div><span>CUSTOMER</span><h3>{String(item.name)}</h3><p>{String(item.contact || "No contact")} · {String(item.destination || "Pakistan")}</p></div><dl><div><dt>Orders</dt><dd>{lots.length}</dd></div><div><dt>Total ordered</dt><dd>{fmt(lots.reduce((sum, lot) => sum + number(lot.quantity), 0))} PCS</dd></div></dl><div className="customer-actions"><button className="button secondary small" onClick={() => setModal({ type: "customer", customer: item })}><Pencil size={14} /> Edit</button><button className="button danger small" disabled={lots.length > 0} title={lots.length ? "Customers with linked lots cannot be deleted" : "Delete customer"} onClick={() => setModal({ type: "delete-customer", customer: item })}><Trash2 size={14} /> Delete</button></div></article>; })}
      {page === "Inventory" && <InventoryTable state={state} post={post} saving={saving} setModal={setModal} openPage={openPage} user={user} />}
    </section>
  </div>;
}

const grantablePages = nav.filter((item) => !item.section && item.label !== "Users & Permissions").map((item) => String(item.label));

function UsersPage({ state, post, saving, setModal, user }: { state: FactoryState; post: PageProps["post"]; saving: boolean; setModal: (value: ModalState) => void; user: SessionUser }) {
  if (user.role !== "Owner") return <Empty title="Owner access only" detail="Ask the owner if you need to manage logins and access." />;
  const owners = state.users.filter((row) => row.role === "Owner");
  const staff = state.users.filter((row) => row.role === "Staff");
  const shopUsers = state.users.filter((row) => row.role === "Shop");
  const shopName = (id: unknown) => String(state.shops.find((shop) => number(shop.id) === number(id))?.name ?? "—");

  return <div className="page-stack">
    <SectionHead eyebrow="ACCESS CONTROL" title="Users & Permissions" detail="You decide who can sign in, what they can open, and which shop counter they run." action={<div className="action-group wrap">
      <button className="button secondary" onClick={() => exportRows(state.users as unknown as Row[], "MS-Boutique-Users")}><Download size={16} /> Excel</button>
      <button className="button primary" onClick={() => setModal({ type: "user" })}><UserPlus size={16} /> Create User</button>
    </div>} />

    <div className="auto-note"><ShieldCheck size={19} /><span><b>Two kinds of login.</b> A <em>Staff</em> account opens the factory system and sees only the pages you tick. A <em>Shop</em> account is tied to one shop and opens that shop&apos;s point of sale and nothing else — no factory pages, and it cannot read another shop&apos;s data.</span></div>

    <section className="dept-summary">
      <article><span>Total logins</span><b>{state.users.length}</b><div className="micro-line blue"><i style={{ width: "100%" }} /></div></article>
      <article><span>Owner</span><b>{owners.length}</b><div className="micro-line green"><i style={{ width: "100%" }} /></div></article>
      <article><span>Factory staff</span><b>{staff.length}</b><div className="micro-line green"><i style={{ width: "100%" }} /></div></article>
      <article><span>Shop counters</span><b>{shopUsers.length}</b><div className="micro-line orange"><i style={{ width: "100%" }} /></div></article>
      <article><span>Disabled</span><b>{state.users.filter((row) => !row.active).length}</b><div className="micro-line blue"><i style={{ width: "100%" }} /></div></article>
    </section>

    <article className="panel table-panel">
      <div className="panel-head"><div><span className="eyebrow">LOGIN REGISTER</span><h3>Who can sign in</h3></div><span className="record-count">{state.users.length} accounts</span></div>
      <div className="table-scroll"><table><thead><tr><th>User</th><th>Username</th><th>Role</th><th>Shop</th><th>Access</th><th>Status</th><th className="right">Action</th></tr></thead>
        <tbody>{state.users.map((row) => <tr key={String(row.id)}>
          <td><div className="user-cell"><span className="avatar small">{initials(String(row.name))}</span><div><b>{String(row.name)}</b><small className="cell-sub">{String(row.email)}</small></div></div></td>
          <td><code className="username-chip">{String(row.username)}</code></td>
          <td><span className={cx("role-tag", String(row.role).toLowerCase())}>{row.role === "Owner" ? <ShieldCheck size={12} /> : row.role === "Shop" ? <Store size={12} /> : <UserCog size={12} />}{String(row.role)}</span></td>
          <td>{row.role === "Shop" ? shopName(row.shopId) : <span className="muted-cell">—</span>}</td>
          <td>{row.role === "Owner" ? <b className="green-text">Everything</b> : row.role === "Shop" ? "Point of sale only" : <span title={(row.permissions as string[]).join(", ")}>{(row.permissions as string[]).length} page{(row.permissions as string[]).length === 1 ? "" : "s"}</span>}</td>
          <td><StatusBadge status={row.active ? "Active" : "Disabled"} /></td>
          <td className="right"><div className="row-actions">
            <button title="Edit access" aria-label="Edit access" onClick={() => setModal({ type: "user", record: row as unknown as Row })}><Pencil size={16} /></button>
            {row.role !== "Owner" && <button title="Remove login" aria-label="Remove login" disabled={saving} onClick={() => void post({ action: "delete-user", userId: row.id })}><Trash2 size={16} /></button>}
          </div></td>
        </tr>)}</tbody></table></div>
    </article>
  </div>;
}

function UserModal({ record, state, onClose, onSave, saving }: { record?: Row; state: FactoryState; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  const editing = Boolean(record);
  const [form, setForm] = useState({
    name: String(record?.name || ""), username: String(record?.username || ""), email: String(record?.email || ""),
    role: String(record?.role || "Staff"), shopId: String(record?.shopId || ""), password: "",
    active: record ? Boolean(record.active) : true,
  });
  const [permissions, setPermissions] = useState<string[]>(() => {
    const current = record?.permissions;
    return Array.isArray(current) ? (current as unknown as string[]).map(String) : [];
  });
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string | boolean) => { setForm((current) => ({ ...current, [key]: value })); setError(""); };
  const toggle = (label: string) => { setPermissions((current) => current.includes(label) ? current.filter((item) => item !== label) : [...current, label]); setError(""); };
  const isShop = form.role === "Shop";
  const isOwnerRecord = String(record?.role) === "Owner";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return setError("Full Name is required.");
    if (!/^[A-Za-z0-9._-]{3,}$/.test(form.username.trim())) return setError("Username must be at least 3 characters and use only letters, numbers, dot, dash or underscore.");
    if (!editing && form.password.length < 6) return setError("Set a password of at least 6 characters.");
    if (editing && form.password && form.password.length < 6) return setError("The new password must be at least 6 characters.");
    if (isShop && !form.shopId) return setError("Choose which shop this login belongs to.");
    if (form.role === "Staff" && !permissions.length) return setError("Tick at least one page this user may open.");
    await onSave({ action: "save-user", userId: record?.id, ...form, shopId: isShop ? number(form.shopId) : 0, permissions: isShop ? [] : permissions, active: form.active ? 1 : 0 });
  };

  return <Modal title={editing ? `Edit ${String(record?.name)}` : "Create User"} subtitle="You choose the role, the shop and exactly which pages they can open." onClose={onClose} wide><form onSubmit={submit}>
    <div className="form-grid three">
      <Field label="Full Name *"><input value={form.name} onChange={(event) => set("name", event.target.value)} /></Field>
      <Field label="Username *"><input placeholder="e.g. gulberg.counter" value={form.username} onChange={(event) => set("username", event.target.value)} disabled={isOwnerRecord} /></Field>
      <Field label={editing ? "New Password (leave blank to keep)" : "Password *"}><input type="password" autoComplete="new-password" placeholder={editing ? "Unchanged" : "At least 6 characters"} value={form.password} onChange={(event) => set("password", event.target.value)} /></Field>
      <Field label="Email (optional)"><input value={form.email} onChange={(event) => set("email", event.target.value)} /></Field>
      <Field label="Account Status"><select value={form.active ? "Active" : "Disabled"} onChange={(event) => set("active", event.target.value === "Active")} disabled={isOwnerRecord}><option>Active</option><option>Disabled</option></select></Field>
    </div>

    <div className="salary-mode">
      <div><span className="eyebrow">WHAT THIS LOGIN OPENS</span><p>A shop account never sees the factory; a staff account never sees a shop counter.</p></div>
      <div className="mode-toggle">
        {(isOwnerRecord ? ["Owner"] : ["Staff", "Shop"]).map((item) => <button key={item} type="button" className={cx(form.role === item && "active")} onClick={() => set("role", item)}>
          {item === "Owner" ? <ShieldCheck size={15} /> : item === "Shop" ? <Store size={15} /> : <UserCog size={15} />}
          {item === "Owner" ? "Owner — everything" : item === "Shop" ? "Shop — point of sale only" : "Staff — chosen factory pages"}
        </button>)}
      </div>

      {isShop ? <div className="form-grid">
        <Field label="Which Shop *"><select value={form.shopId} onChange={(event) => set("shopId", event.target.value)}><option value="">Select shop…</option>{state.shops.map((shop) => <option key={String(shop.id)} value={String(shop.id)}>{String(shop.name)} · {String(shop.shop_code)}</option>)}</select></Field>
        <div className="theka-hint"><Store size={18} /><span>Signing in with this account opens <b>{state.shops.find((shop) => number(shop.id) === number(form.shopId))?.name ?? "the chosen shop"}</b> straight to POS Billing. It cannot open the factory or any other shop.</span></div>
      </div> : isOwnerRecord ? <div className="theka-hint"><ShieldCheck size={18} /><span>The owner account always has full access and cannot be limited or removed.</span></div> : <>
        <div className="permission-picker">
          {grantablePages.map((label) => <label key={label} className={cx("permission-chip", permissions.includes(label) && "on")}>
            <input type="checkbox" checked={permissions.includes(label)} onChange={() => toggle(label)} />
            <span>{permissions.includes(label) ? <Check size={13} /> : <Circle size={11} />}{label}</span>
          </label>)}
        </div>
        <div className="permission-actions">
          <button type="button" className="link-button" onClick={() => setPermissions(grantablePages)}>Select all</button>
          <button type="button" className="link-button" onClick={() => setPermissions([])}>Clear</button>
          <span>{permissions.length} of {grantablePages.length} pages granted</span>
        </div>
      </>}
    </div>

    {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />} {editing ? "Save Access" : "Create User"}</button></div>
  </form></Modal>;
}

function NotificationInbox({ state, post, saving, onClose }: { state: FactoryState; post: PageProps["post"]; saving: boolean; onClose: () => void }) {
  const [onlyUnread, setOnlyUnread] = useState(false);
  const rows = state.notifications.filter((item) => !onlyUnread || !number(item.read)).slice(0, 40);
  const unread = state.notifications.filter((item) => !number(item.read)).length;
  const icon = (level: string) => level === "success" ? <CheckCircle2 size={15} /> : level === "warning" || level === "critical" ? <AlertTriangle size={15} /> : <Info size={15} />;
  return <>
    <button className="inbox-scrim" onClick={onClose} aria-label="Close notifications" />
    <section className="inbox" role="dialog" aria-label="Notifications">
      <header><div><b>Notifications</b><small>{unread} unread · every department action reported to the owner</small></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
      <div className="inbox-tools">
        <label className="toggle-field"><input type="checkbox" checked={onlyUnread} onChange={(event) => setOnlyUnread(event.target.checked)} /><span>Unread only</span></label>
        <button className="link-button" disabled={saving || !unread} onClick={() => void post({ action: "mark-notifications-read" })}><Check size={14} /> Mark all read</button>
      </div>
      <div className="inbox-list">
        {rows.map((item) => <article key={String(item.id)} className={cx(!number(item.read) && "unread", `level-${String(item.level || "info")}`)}>
          <span className="inbox-icon">{icon(String(item.level || "info"))}</span>
          <div><b>{String(item.title)}</b><p>{String(item.message)}</p><small>{formatDate(item.created_at, true)} · {String(item.actor_name || "System")} · {String(item.category || "Factory")}</small></div>
          {!number(item.read) && <button className="inbox-read" title="Mark read" aria-label="Mark read" disabled={saving} onClick={() => void post({ action: "mark-notifications-read", notificationId: item.id })}><Check size={14} /></button>}
        </article>)}
        {!rows.length && <p className="inbox-empty">Nothing here yet. Alerts appear as departments and shops record activity.</p>}
      </div>
    </section>
  </>;
}

function PurchasePage({ state, post, saving, setModal }: PageProps) {
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("");
  const rows = state.purchases.filter((item) => (!search || `${item.purchase_no} ${item.item} ${item.supplier} ${item.invoice_no}`.toLowerCase().includes(search.toLowerCase())) && (!status || item.status === status));
  const total = state.purchases.reduce((sum, item) => sum + number(item.total_amount), 0);
  const paid = state.purchases.reduce((sum, item) => sum + number(item.paid_amount), 0);
  const outstanding = total - paid;
  const pending = state.purchases.filter((item) => !/Received/i.test(String(item.status)));
  return <div className="page-stack">
    <SectionHead eyebrow="SUPPLY CHAIN" title="Purchase" detail="Raw material and accessory purchase orders with payment and delivery status." action={<div className="action-group wrap">
      <button className="button secondary" onClick={() => exportRows(state.purchases, "MS-Boutique-Purchases")}><Download size={16} /> Excel</button>
      <button className="button secondary" onClick={() => window.print()}><FileText size={16} /> PDF</button>
      <button className="button secondary" onClick={() => window.print()}><Printer size={16} /> Print</button>
      <button className="button primary" onClick={() => setModal({ type: "purchase" })}><Plus size={16} /> New Purchase</button>
    </div>} />

    <section className="dept-summary">
      <article><span>Purchase orders</span><b>{state.purchases.length}</b><div className="micro-line blue"><i style={{ width: "100%" }} /></div></article>
      <article><span>Total purchase value</span><b>{money(total)}</b><div className="micro-line green"><i style={{ width: "100%" }} /></div></article>
      <article><span>Paid to suppliers</span><b>{money(paid)}</b><div className="micro-line green"><i style={{ width: `${total ? paid / total * 100 : 0}%` }} /></div></article>
      <article><span>Outstanding balance</span><b>{money(outstanding)}</b><div className="micro-line orange"><i style={{ width: `${total ? outstanding / total * 100 : 0}%` }} /></div></article>
      <article><span>Awaiting delivery</span><b>{pending.length}</b><div className="micro-line blue"><i style={{ width: "100%" }} /></div></article>
    </section>

    <div className="filter-bar">
      <div className="filter-search"><Search size={17} /><input placeholder="Search purchase, item, supplier or invoice…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <div className="select-wrap"><Filter size={15} /><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{["Ordered", "In Transit", "Received", "Partially Paid", "Paid", "Cancelled"].map((item) => <option key={item}>{item}</option>)}</select></div>
      {(search || status) && <button className="clear-filters" onClick={() => { setSearch(""); setStatus(""); }}><X size={14} /> Clear</button>}
    </div>

    <article className="panel table-panel purchase-table">
      <div className="panel-head"><div><span className="eyebrow">PURCHASE REGISTER</span><h3>Full purchase status report</h3></div><span className="record-count">{rows.length} records</span></div>
      <div className="table-scroll"><table><thead><tr><th>Purchase No.</th><th>Supplier</th><th>Item</th><th>Category</th><th>Quantity</th><th>Rate</th><th>Total</th><th>Paid</th><th>Balance</th><th>Method</th><th>Purchase Date</th><th>Received</th><th>Status</th><th className="right">Action</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={String(item.id)}>
          <td><button className="table-primary" onClick={() => setModal({ type: "purchase", record: item })}>{String(item.purchase_no)}<small>{String(item.invoice_no || "No invoice")}</small></button></td>
          <td>{String(item.supplier)}<small className="cell-sub">{String(item.supplier_contact || "")}</small></td>
          <td>{String(item.item)}</td><td>{String(item.category)}</td>
          <td><b>{fmt(item.quantity)}</b><small className="cell-sub">{String(item.unit)}</small></td>
          <td>{money(item.rate)}</td><td><b>{money(item.total_amount)}</b></td>
          <td className="green-text">{money(item.paid_amount)}</td>
          <td><b className={number(item.balance_amount) > 0 ? "red-text" : "green-text"}>{money(item.balance_amount)}</b></td>
          <td><StatusBadge status={item.payment_method} /></td>
          <td>{formatDate(item.purchase_date)}</td>
          <td>{item.received_date ? formatDate(item.received_date) : <span className="muted-cell">Pending</span>}</td>
          <td><StatusBadge status={item.status} /></td>
          <td className="right"><div className="row-actions"><button title="Edit purchase" aria-label="Edit purchase" onClick={() => setModal({ type: "purchase", record: item })}><Pencil size={16} /></button><button title="Delete purchase" aria-label="Delete purchase" disabled={saving} onClick={() => void post({ action: "delete-purchase", purchaseId: item.id })}><Trash2 size={16} /></button></div></td>
        </tr>)}</tbody></table></div>
      {!rows.length && <Empty title="No purchase orders" detail="Raise the first purchase order to start tracking supplier deliveries and payments." />}
    </article>
  </div>;
}

function ShopsPage({ state, post, saving, setModal }: PageProps) {
  const openShop = (shop: Row) => window.open(`/?shop=${number(shop.id)}`, "_blank", "noopener");
  const salesFor = (shop: Row) => state.shopSales.filter((row) => number(row.shop_id) === number(shop.id));
  const stockFor = (shop: Row) => state.shopInventory.filter((row) => number(row.shop_id) === number(shop.id));
  const pendingFor = (shop: Row) => state.shopShipments.filter((row) => number(row.shop_id) === number(shop.id) && String(row.status) !== "Received");
  const totalSales = state.shopSales.reduce((sum, row) => sum + number(row.total_amount), 0);
  const totalStock = state.shopInventory.reduce((sum, row) => sum + number(row.remaining_qty), 0);
  const totalSold = state.shopInventory.reduce((sum, row) => sum + number(row.sold_qty), 0);

  return <div className="page-stack">
    <SectionHead eyebrow="RETAIL NETWORK" title="Shops" detail="Create a shop, ship stock to it from the warehouse, and open its point-of-sale in a new tab." action={<div className="action-group wrap">
      <button className="button secondary" onClick={() => exportRows(state.shopInventory, "MS-Boutique-Shop-Stock")}><Download size={16} /> Export Shop Stock</button>
      <button className="button secondary" onClick={() => setModal({ type: "ship-shop" })}><Truck size={16} /> Ship to Shop</button>
      <button className="button primary" onClick={() => setModal({ type: "shop" })}><Plus size={16} /> Create Shop</button>
    </div>} />

    <section className="dept-summary">
      <article><span>Shops open</span><b>{state.shops.filter((row) => row.status === "Active").length}</b><div className="micro-line green"><i style={{ width: "100%" }} /></div></article>
      <article><span>Retail sales</span><b>{money(totalSales)}</b><div className="micro-line green"><i style={{ width: "100%" }} /></div></article>
      <article><span>PCS sold out</span><b>{fmt(totalSold)}</b><div className="micro-line blue"><i style={{ width: "100%" }} /></div></article>
      <article><span>PCS remaining</span><b>{fmt(totalStock)}</b><div className="micro-line orange"><i style={{ width: "100%" }} /></div></article>
      <article><span>Shipments in transit</span><b>{state.shopShipments.filter((row) => String(row.status) !== "Received").length}</b><div className="micro-line blue"><i style={{ width: "100%" }} /></div></article>
    </section>

    <section className="shop-grid">{state.shops.map((shop) => {
      const sales = salesFor(shop); const stock = stockFor(shop); const pending = pendingFor(shop);
      const revenue = sales.reduce((sum, row) => sum + number(row.total_amount), 0);
      const sold = stock.reduce((sum, row) => sum + number(row.sold_qty), 0);
      const remaining = stock.reduce((sum, row) => sum + number(row.remaining_qty), 0);
      const received = sold + remaining;
      return <article className="shop-card" key={String(shop.id)}>
        <div className="shop-card-head">
          {shop.logo_url ? <img className="shop-logo" src={String(shop.logo_url)} alt="" /> : <span className="logo-mark">{String(shop.shop_code).slice(-2)}</span>}
          <div><h3>{String(shop.name)}</h3><p>{String(shop.shop_code)} · {String(shop.manager)}</p><small>{String(shop.address)}</small></div>
          <StatusBadge status={shop.status} />
        </div>
        <dl className="shop-stats">
          <div><dt>Revenue</dt><dd>{money(revenue)}</dd></div>
          <div><dt>Invoices</dt><dd>{sales.length}</dd></div>
          <div><dt>Sold out</dt><dd className="green-text">{fmt(sold)}</dd></div>
          <div><dt>Remaining</dt><dd>{fmt(remaining)}</dd></div>
        </dl>
        <div className="shop-progress"><div><span>Sell-through</span><b>{fmt(sold)} of {fmt(received)} PCS</b></div><Progress value={received ? sold / received * 100 : 0} compact /></div>
        {pending.length > 0 && <p className="shop-pending"><Truck size={14} />{pending.length} shipment{pending.length === 1 ? "" : "s"} awaiting the shop&apos;s confirmation</p>}
        <div className="shop-card-actions">
          <button className="button ghost" onClick={() => setModal({ type: "shop", record: shop })}><Pencil size={15} /> Edit</button>
          <button className="button secondary" disabled={saving} onClick={() => void post({ action: "delete-shop", shopId: shop.id })}><Trash2 size={15} /> Delete</button>
          <button className="button primary" onClick={() => openShop(shop)}><Store size={15} /> Open POS</button>
        </div>
      </article>;
    })}</section>
    {!state.shops.length && <Empty title="No shops yet" detail="Create your first retail shop; opening it launches a full point-of-sale system in a new tab." />}

    <article className="panel table-panel">
      <div className="panel-head"><div><span className="eyebrow">WAREHOUSE TO SHOP</span><h3>Shipment status report</h3></div><span className="record-count">{state.shopShipments.length} shipments</span></div>
      <div className="table-scroll"><table><thead><tr><th>Shipment</th><th>Shop</th><th>Product</th><th>Lot / Design</th><th>Sent QTY</th><th>Receivable</th><th>Non-Receivable</th><th>Sale Rate</th><th>Sent</th><th>Received</th><th>Received By</th><th>Status</th></tr></thead>
        <tbody>{state.shopShipments.map((row) => <tr key={String(row.id)}>
          <td><b>{String(row.shipment_no)}</b></td><td>{String(row.shop)}<small className="cell-sub">{String(row.shop_code)}</small></td>
          <td>{String(row.product_name)}</td><td>{String(row.lot_no)}<small className="cell-sub">{String(row.design_no)}</small></td>
          <td><b>{fmt(row.quantity)}</b></td>
          <td>{String(row.status) === "Received" ? <b className="green-text">{fmt(row.receivable_qty)}</b> : <span className="muted-cell">Awaiting count</span>}</td>
          <td>{String(row.status) === "Received" ? <span title={String(row.non_receivable_reason || "")}><b className={number(row.non_receivable_qty) ? "red-text" : ""}>{fmt(row.non_receivable_qty)}</b>{number(row.non_receivable_qty) > 0 && <small className="cell-sub">{String(row.non_receivable_reason)}</small>}</span> : <span className="muted-cell">—</span>}</td>
          <td>{money(row.sale_rate)}</td><td>{formatDate(row.sent_date)}</td><td>{row.received_date ? formatDate(row.received_date) : <span className="muted-cell">Pending</span>}</td>
          <td>{String(row.received_by || "—")}</td><td><StatusBadge status={row.status} /></td>
        </tr>)}</tbody></table></div>
      {!state.shopShipments.length && <Empty title="No shipments yet" detail="Use Ship to Shop to send finished goods from the warehouse." />}
    </article>

    <article className="panel table-panel">
      <div className="panel-head"><div><span className="eyebrow">SHOP STOCK STATUS</span><h3>Sold out and remaining by shop</h3></div><span className="live-indicator"><i /> Live</span></div>
      <div className="table-scroll"><table><thead><tr><th>Shop</th><th>Product</th><th>SKU / Lot</th><th>Received</th><th>Sold Out</th><th>Remaining</th><th>Non-Receivable</th><th>Sale Rate</th><th>Stock Value</th><th>Status</th></tr></thead>
        <tbody>{state.shopInventory.map((row) => <tr key={String(row.id)}>
          <td><b>{String(row.shop)}</b><small className="cell-sub">{String(row.shop_code)}</small></td>
          <td>{String(row.product_name)}</td><td>{String(row.sku)}<small className="cell-sub">{String(row.lot_no || "—")}</small></td>
          <td>{fmt(row.received_qty)}</td><td><b className="green-text">{fmt(row.sold_qty)}</b></td><td><b>{fmt(row.remaining_qty)}</b></td>
          <td><b className={number(row.non_receivable_qty) ? "red-text" : ""}>{fmt(row.non_receivable_qty)}</b></td>
          <td>{money(row.sale_rate)}</td><td>{money(number(row.remaining_qty) * number(row.sale_rate))}</td>
          <td><StatusBadge status={number(row.remaining_qty) > 0 ? "In Stock" : "Sold Out"} /></td>
        </tr>)}</tbody></table></div>
      {!state.shopInventory.length && <Empty title="No shop stock yet" detail="Ship a lot to a shop and confirm it there; the stock status appears here." />}
    </article>
  </div>;
}

function EmployeesPage({ state, setModal }: PageProps) {
  const [search, setSearch] = useState(""); const [department, setDepartment] = useState(""); const [type, setType] = useState("");
  const rows = state.employees.filter((item) => (!search || `${item.employee_code} ${item.name} ${item.designation} ${item.phone}`.toLowerCase().includes(search.toLowerCase())) && (!department || item.department === department) && (!type || item.salary_type === type));
  const active = state.employees.filter((item) => item.status === "Active");
  const monthly = state.employees.filter((item) => item.salary_type === "Monthly");
  const theka = state.employees.filter((item) => item.salary_type === "Theka");
  const wageBill = monthly.reduce((sum, item) => sum + number(item.monthly_salary), 0);
  return <div className="page-stack"><SectionHead eyebrow="TEAM DIRECTORY" title="Employees" detail="Add or remove staff and set whether they are paid monthly or on theka (per piece)." action={<div className="action-group"><button className="button secondary" onClick={() => exportRows(state.employees, "MS-Boutique-Employees")}><Download size={16} /> Excel</button><button className="button secondary" onClick={() => window.print()}><Printer size={16} /> Print</button><button className="button primary" onClick={() => setModal({ type: "employee" })}><UserPlus size={16} /> Add Employee</button></div>} />
    <section className="dept-summary"><article><span>Total employees</span><b>{state.employees.length}</b><div className="micro-line blue"><i style={{ width: "100%" }} /></div></article><article><span>Active on roll</span><b>{active.length}</b><div className="micro-line green"><i style={{ width: `${state.employees.length ? active.length / state.employees.length * 100 : 0}%` }} /></div></article><article><span>Monthly salary staff</span><b>{monthly.length}</b><div className="micro-line orange"><i style={{ width: `${state.employees.length ? monthly.length / state.employees.length * 100 : 0}%` }} /></div></article><article><span>Theka (per piece) staff</span><b>{theka.length}</b><div className="micro-line green"><i style={{ width: `${state.employees.length ? theka.length / state.employees.length * 100 : 0}%` }} /></div></article><article><span>Monthly wage bill</span><b>{money(wageBill)}</b><div className="micro-line blue"><i style={{ width: "100%" }} /></div></article></section>
    <div className="filter-bar"><div className="filter-search"><Search size={17} /><input placeholder="Search name, code, designation or phone…" value={search} onChange={(e) => setSearch(e.target.value)} /></div><div className="select-wrap"><Filter size={15} /><select value={department} onChange={(e) => setDepartment(e.target.value)}><option value="">All departments</option>{employeeDepartments.map((item) => <option key={item}>{item}</option>)}</select></div><select value={type} onChange={(e) => setType(e.target.value)}><option value="">All salary types</option><option value="Monthly">Monthly</option><option value="Theka">Theka (per piece)</option></select>{(search || department || type) && <button className="clear-filters" onClick={() => { setSearch(""); setDepartment(""); setType(""); }}><X size={14} /> Clear</button>}</div>
    <article className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">EMPLOYEE MASTER</span><h3>Staff records</h3></div><span className="record-count">{rows.length} records</span></div>
      <div className="table-scroll"><table><thead><tr><th>Code / Name</th><th>Department</th><th>Designation</th><th>Contact</th><th>CNIC</th><th>Joined</th><th>Salary Type</th><th>Rate</th><th>Status</th><th className="right">Action</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={String(item.id)}><td><button className="table-primary" onClick={() => setModal({ type: "employee", employee: item })}>{String(item.name)}<small>{String(item.employee_code)}</small></button></td><td><span className="department-chip">{departmentIcon(String(item.department))}{String(item.department)}</span></td><td>{String(item.designation)}</td><td>{String(item.phone || "—")}<small className="cell-sub">{String(item.address || "")}</small></td><td>{String(item.cnic || "—")}</td><td>{formatDate(item.joining_date)}</td><td><span className={cx("salary-tag", item.salary_type === "Theka" && "theka")}>{item.salary_type === "Theka" ? <Banknote size={12} /> : <Wallet size={12} />}{String(item.salary_type)}</span></td><td>{item.salary_type === "Theka" ? <b>{money(item.rate_per_piece)}<small className="cell-sub">per piece</small></b> : <b>{money(item.monthly_salary)}<small className="cell-sub">per month</small></b>}</td><td><StatusBadge status={item.status} /></td>
          <td className="right"><div className="row-actions"><button title="Edit employee" aria-label="Edit employee" onClick={() => setModal({ type: "employee", employee: item })}><Pencil size={16} /></button><button title="Delete employee" aria-label="Delete employee" onClick={() => setModal({ type: "delete-employee", employee: item })}><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div>
      {!rows.length && <Empty title="No employees found" detail="Add your first employee, or clear the filters to see the whole team." />}
    </article>
  </div>;
}

function AttendancePage({ state, post, saving, setModal }: PageProps) {
  const [date, setDate] = useState(today); const [department, setDepartment] = useState("");
  const active = state.employees.filter((item) => item.status === "Active" && (!department || item.department === department));
  const forDate = state.attendance.filter((item) => String(item.attendance_date) === date);
  const recordFor = (employeeId: unknown) => forDate.find((item) => number(item.employee_id) === number(employeeId));
  const counts = attendanceStatuses.map((value) => ({ value, count: forDate.filter((item) => item.status === value).length }));
  const piecesToday = forDate.reduce((sum, item) => sum + number(item.pieces_done), 0);
  const quickMark = (employee: Row, status: string) => void post({ action: "save-attendance", employeeId: employee.id, attendanceDate: date, status, piecesDone: number(recordFor(employee.id)?.pieces_done), overtimeHours: number(recordFor(employee.id)?.overtime_hours), inTime: recordFor(employee.id)?.in_time ?? "09:00", outTime: recordFor(employee.id)?.out_time ?? "18:00", lotNo: recordFor(employee.id)?.lot_no ?? "", remarks: recordFor(employee.id)?.remarks ?? "" });
  return <div className="page-stack"><SectionHead eyebrow="DAILY ATTENDANCE" title="Attendance" detail="Mark the floor present or absent and record theka pieces — the monthly salary recalculates on every mark." action={<div className="action-group"><button className="button secondary" onClick={() => exportRows(state.attendance, "MS-Boutique-Attendance")}><Download size={16} /> Excel</button><button className="button secondary" onClick={() => window.print()}><Printer size={16} /> Print</button><button className="button primary" onClick={() => setModal({ type: "attendance" })}><Plus size={16} /> Detailed Entry</button></div>} />
    <div className="auto-note"><Wallet size={19} /><span><b>Attendance drives payroll.</b> Marking a day here immediately rewrites that employee&apos;s salary for the month — day-rate for monthly staff, piece-rate for theka staff — unless the month is already marked Paid.</span></div>
    <div className="filter-bar"><Field label="Attendance date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field><div className="select-wrap"><Filter size={15} /><select aria-label="Filter by department" value={department} onChange={(e) => setDepartment(e.target.value)}><option value="">All departments</option>{employeeDepartments.map((item) => <option key={item}>{item}</option>)}</select></div><div className="attendance-tally">{counts.filter((item) => item.count).map((item) => <span key={item.value}><b>{item.count}</b>{item.value}</span>)}<span><b>{fmt(piecesToday)}</b>PCS by theka staff</span></div></div>
    <article className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">MARK ATTENDANCE</span><h3>{formatDate(date)}</h3></div><span className="record-count">{forDate.length} of {active.length} marked</span></div>
      <div className="table-scroll"><table><thead><tr><th>Employee</th><th>Department</th><th>Salary Type</th><th>Quick mark</th><th>In / Out</th><th>Overtime</th><th>Pieces Done</th><th>Lot</th><th>Status</th><th className="right">Action</th></tr></thead>
        <tbody>{active.map((employee) => { const record = recordFor(employee.id); return <tr key={String(employee.id)}><td><b>{String(employee.name)}</b><small className="cell-sub">{String(employee.employee_code)} · {String(employee.designation)}</small></td><td><span className="department-chip">{departmentIcon(String(employee.department))}{String(employee.department)}</span></td><td><span className={cx("salary-tag", employee.salary_type === "Theka" && "theka")}>{String(employee.salary_type)}</span></td>
          <td><div className="quick-marks">{["Present", "Absent", "Half Day", "Leave"].map((value) => <button key={value} type="button" disabled={saving} className={cx("quick-mark", record?.status === value && "active", value === "Present" && "ok", value === "Absent" && "no")} onClick={() => quickMark(employee, value)}>{value === "Present" ? "P" : value === "Absent" ? "A" : value === "Half Day" ? "H" : "L"}</button>)}</div></td>
          <td>{record ? `${String(record.in_time || "—")} / ${String(record.out_time || "—")}` : <span className="muted-cell">Not marked</span>}</td><td>{record ? `${number(record.overtime_hours)} hrs` : "—"}</td><td>{employee.salary_type === "Theka" ? <b className="green-text">{fmt(record?.pieces_done)}</b> : <span className="muted-cell">n/a</span>}</td><td>{String(record?.lot_no || "—")}</td><td>{record ? <StatusBadge status={record.status} /> : <span className="status status-neutral"><span className="status-dot" />Unmarked</span>}</td>
          <td className="right"><div className="row-actions"><button title="Detailed entry" aria-label="Detailed entry" onClick={() => setModal({ type: "attendance", record: { ...(record || {}), employee_id: employee.id, attendance_date: date } })}><Pencil size={16} /></button>{record && <button title="Delete attendance" aria-label="Delete attendance" onClick={() => void post({ action: "delete-attendance", attendanceId: record.id })}><Trash2 size={16} /></button>}</div></td></tr>; })}</tbody></table></div>
      {!active.length && <Empty title="No active employees" detail="Add employees in the Employees page before marking attendance." />}
    </article>
    <article className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">ATTENDANCE HISTORY</span><h3>Recent attendance records</h3></div><span className="record-count">{state.attendance.length} records</span></div>
      <div className="table-scroll"><table><thead><tr><th>Date</th><th>Employee</th><th>Department</th><th>Status</th><th>In / Out</th><th>Overtime</th><th>Pieces</th><th>Lot</th><th>Remarks</th></tr></thead>
        <tbody>{state.attendance.slice(0, 40).map((item) => <tr key={String(item.id)}><td>{formatDate(item.attendance_date)}</td><td><b>{String(item.employee_name)}</b><small className="cell-sub">{String(item.employee_code)}</small></td><td>{String(item.department)}</td><td><StatusBadge status={item.status} /></td><td>{String(item.in_time || "—")} / {String(item.out_time || "—")}</td><td>{number(item.overtime_hours)} hrs</td><td>{fmt(item.pieces_done)}</td><td>{String(item.lot_no || "—")}</td><td><span className="remarks-cell">{String(item.remarks || "—")}</span></td></tr>)}</tbody></table></div>
      {!state.attendance.length && <Empty title="No attendance recorded yet" detail="Use the quick marks above to build the daily attendance register." />}
    </article>
  </div>;
}

function SalaryPage({ state, post, saving, setModal }: PageProps) {
  const [period, setPeriod] = useState(currentPeriod); const [type, setType] = useState("");
  const rows = state.salaries.filter((item) => (!period || String(item.period) === period) && (!type || item.salary_type === type));
  const payable = rows.reduce((sum, item) => sum + number(item.net_payable), 0);
  const paid = rows.filter((item) => item.payment_status === "Paid").reduce((sum, item) => sum + number(item.net_payable), 0);
  const pieces = rows.reduce((sum, item) => sum + number(item.total_pieces), 0);
  const periods = [...new Set([currentPeriod, ...state.salaries.map((item) => String(item.period))])].sort().reverse();
  const payroll = useMemo(() => buildPayroll(state, period), [state, period]);
  return <div className="page-stack"><SectionHead eyebrow="PAYROLL" title="Salary" detail="Salary lines build themselves from Attendance — monthly staff per attended day, theka staff per piece." action={<div className="action-group wrap">
      <button className="button secondary" onClick={() => exportMonthlySalary(payroll, state.settings)}><Download size={16} /> Export Monthly Salary</button>
      <button className="button secondary" onClick={() => printMonthlySalary(payroll, state.settings)}><FileText size={16} /> PDF</button>
      <button className="button secondary" onClick={() => printMonthlySalary(payroll, state.settings)}><Printer size={16} /> Print</button>
      <button className="button secondary" onClick={() => setModal({ type: "advance" })}><Banknote size={16} /> Add Advance</button>
      <button className="button secondary" disabled={saving} onClick={() => void post({ action: "recalculate-period", period })}><LoaderCircle size={16} className={saving ? "spin" : undefined} /> Recalculate {period}</button>
      <button className="button primary" onClick={() => setModal({ type: "salary" })}><Plus size={16} /> Calculate Salary</button>
    </div>} />
    <PayrollChart payroll={payroll} />
    <div className="auto-note"><CalendarCheck size={19} /><span><b>Auto-calculated from recorded work.</b> Monthly staff earn <em>monthly salary ÷ the number of days in that month</em> per attended day — {period} has <em>{daysInPeriod(period)} days</em>, so Rs 55,000 pays <em>{money(round2(55000 / daysInPeriod(period)))} per day</em> (a half day counts as 0.5). Theka staff earn the total of their <em>item × PCS × rate</em> entries below, less any advance. Bonus, overtime and deductions you enter are kept. Marking a salary <b>Paid</b> freezes it. Use <b>Recalculate</b> to bring older unpaid records onto this formula.</span></div>
    <section className="dept-summary"><article><span>Records this period</span><b>{rows.length}</b><div className="micro-line blue"><i style={{ width: "100%" }} /></div></article><article><span>Total payable</span><b>{money(payable)}</b><div className="micro-line green"><i style={{ width: "100%" }} /></div></article><article><span>Already paid</span><b>{money(paid)}</b><div className="micro-line green"><i style={{ width: `${payable ? paid / payable * 100 : 0}%` }} /></div></article><article><span>Outstanding</span><b>{money(payable - paid)}</b><div className="micro-line orange"><i style={{ width: `${payable ? (payable - paid) / payable * 100 : 0}%` }} /></div></article><article><span>Theka pieces paid</span><b>{fmt(pieces)}</b><div className="micro-line blue"><i style={{ width: "100%" }} /></div></article></section>
    <div className="filter-bar"><Field label="Salary period"><select value={period} onChange={(e) => setPeriod(e.target.value)}>{periods.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field><select aria-label="Filter salary type" value={type} onChange={(e) => setType(e.target.value)}><option value="">All salary types</option><option value="Monthly">Monthly</option><option value="Theka">Theka (per piece)</option></select>{(type) && <button className="clear-filters" onClick={() => setType("")}><X size={14} /> Clear</button>}</div>
    <ThekaSalary state={state} post={post} saving={saving} period={period} payroll={payroll} />
    <article className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">SALARY REGISTER</span><h3>{period} payroll</h3></div><span className="record-count">{rows.filter((item) => item.payment_status === "Paid").length} paid · {rows.filter((item) => item.payment_status !== "Paid").length} unpaid</span></div>
      <div className="table-scroll"><table><thead><tr><th>Employee</th><th>Type</th><th>Days P / A</th><th>Pieces × Rate</th><th>Base</th><th>Overtime</th><th>Bonus</th><th>Advance</th><th>Deduction</th><th>Net Payable</th><th>Status</th><th className="right">Action</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={String(item.id)}><td><b>{String(item.employee_name)}</b><small className="cell-sub">{String(item.employee_code)} · {String(item.department)}</small></td><td><span className={cx("salary-tag", item.salary_type === "Theka" && "theka")}>{String(item.salary_type)}</span></td><td>{fmt(item.present_days)} / {fmt(item.absent_days)}</td><td>{item.salary_type === "Theka" ? <span>{fmt(item.total_pieces)} × {money(item.rate_per_piece)}</span> : <span className="muted-cell">Monthly</span>}</td><td>{money(item.base_amount)}</td><td>{money(item.overtime_amount)}</td><td>{money(item.bonus)}</td><td className="red-text">{money(item.advance)}</td><td className="red-text">{money(item.deduction)}</td><td><b className="green-text">{money(item.net_payable)}</b></td><td><StatusBadge status={item.payment_status} /><small className="cell-sub">{item.paid_date ? formatDate(item.paid_date) : "Not paid"}</small></td>
          <td className="right"><div className="row-actions">{item.payment_status !== "Paid" && <button className="table-action" disabled={saving} onClick={() => void post({ action: "save-salary", employeeId: item.employee_id, period: item.period, presentDays: item.present_days, absentDays: item.absent_days, totalPieces: item.total_pieces, ratePerPiece: item.rate_per_piece, overtimeAmount: item.overtime_amount, bonus: item.bonus, advance: item.advance, deduction: item.deduction, remarks: item.remarks, paymentStatus: "Paid" })}>Mark Paid <Banknote size={14} /></button>}<button title="Edit salary" aria-label="Edit salary" onClick={() => setModal({ type: "salary", record: item })}><Pencil size={16} /></button><button title="Delete salary" aria-label="Delete salary" onClick={() => void post({ action: "delete-salary", salaryId: item.id })}><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div>
      {!rows.length && <Empty title={`No salary records for ${period}`} detail="Use Calculate Salary to build a record from the attendance already marked for this month." />}
    </article>
  </div>;
}

function PayrollChart({ payroll }: { payroll: ReturnType<typeof buildPayroll> }) {
  const bars = [
    { label: "Monthly staff", people: payroll.monthlyTotals.people, gross: payroll.monthlyTotals.gross, advance: payroll.monthlyTotals.advance, net: payroll.monthlyTotals.net, tone: "blue" },
    { label: "Theka staff", people: payroll.thekaTotals.people, gross: payroll.thekaTotals.gross, advance: payroll.thekaTotals.advance, net: payroll.thekaTotals.net, tone: "green" },
  ];
  const max = Math.max(...bars.flatMap((bar) => [bar.gross, bar.advance]), 1);
  return <section className="panel payroll-chart">
    <div className="panel-head"><div><span className="eyebrow">PAYROLL BREAKDOWN</span><h3>{payroll.period} salary split</h3></div><span className="live-indicator"><i /> Live from attendance &amp; piece work</span></div>
    <div className="payroll-bars">
      {bars.map((bar) => <div className="payroll-bar" key={bar.label}>
        <div className="payroll-bar-head"><b>{bar.label}</b><span>{bar.people} staff</span></div>
        <div className="payroll-track" title={`${cash(bar.gross)} gross`}>
          <i className={`fill ${bar.tone}`} style={{ width: `${bar.gross > 0 ? Math.max(2, Math.min(100, bar.gross / max * 100)) : 0}%` }} />
          <i className="advance" style={{ width: `${Math.min(100, bar.advance / max * 100)}%` }} />
        </div>
        <div className="payroll-bar-foot"><span>Gross <b>{cash(bar.gross)}</b></span><span>Advance <b className="red-text">{cash(bar.advance)}</b></span><span>Net <b className="green-text">{cash(bar.net)}</b></span></div>
      </div>)}
    </div>
    <div className="payroll-total"><span>Total salary payable for {payroll.period}</span><b>{cash(payroll.allTotals.net)}</b><small>{cash(payroll.allTotals.gross)} gross less {cash(payroll.allTotals.advance)} advance · {payroll.allTotals.people} staff</small></div>
  </section>;
}

function ThekaSalary({ state, post, saving, period, payroll }: { state: FactoryState; post: PageProps["post"]; saving: boolean; period: string; payroll: ReturnType<typeof buildPayroll> }) {
  const [tab, setTab] = useState<"work" | "advance">("work");
  const theka = state.employees.filter((item) => item.status === "Active" && item.salary_type === "Theka");
  const blank = { employeeId: "", workFrom: today, workTo: today, item: "", lotNo: "", pcsQty: "", ratePerPiece: "", remarks: "" };
  const [work, setWork] = useState(blank);
  const [advance, setAdvance] = useState({ employeeId: "", advanceDate: today, amount: "", remarks: "" });
  const [error, setError] = useState("");
  const total = number(work.pcsQty) * number(work.ratePerPiece);

  const entries = state.pieceWork.filter((item) => String(item.period) === period);
  const periodAdvances = state.advances.filter((item) => String(item.period) === period);
  const grossTotal = entries.reduce((sum, item) => sum + number(item.total_amount), 0);
  const advanceTotal = periodAdvances.reduce((sum, item) => sum + number(item.amount), 0);
  const pcsTotal = entries.reduce((sum, item) => sum + number(item.pcs_qty), 0);
  const staffCount = new Set(entries.map((item) => number(item.employee_id))).size;

  // One row per worker, rolled up from every item they were paid for this month.
  const perPerson = state.employees.filter((employee) => entries.some((item) => number(item.employee_id) === number(employee.id))).map((employee) => {
    const own = entries.filter((item) => number(item.employee_id) === number(employee.id));
    const gross = own.reduce((sum, item) => sum + number(item.total_amount), 0);
    const taken = periodAdvances.filter((item) => number(item.employee_id) === number(employee.id)).reduce((sum, item) => sum + number(item.amount), 0);
    return { employee, items: own.length, pcs: own.reduce((sum, item) => sum + number(item.pcs_qty), 0), gross, advance: taken, net: gross - taken };
  });

  const submitWork = async (event: FormEvent) => {
    event.preventDefault();
    if (!work.employeeId) return setError("Choose a staff member.");
    if (!work.item.trim()) return setError("Item / Work is required.");
    if (work.workTo < work.workFrom) return setError("Work To cannot be before Work From.");
    if (number(work.pcsQty) <= 0) return setError("PCS Qty. must be greater than zero.");
    if (number(work.ratePerPiece) <= 0) return setError("Per Piece Rate must be greater than zero.");
    const saved = await post({ action: "save-piece-work", ...work, employeeId: number(work.employeeId), pcsQty: number(work.pcsQty), ratePerPiece: number(work.ratePerPiece) });
    if (saved) { setWork({ ...blank, workFrom: work.workFrom, workTo: work.workTo }); setError(""); }
  };
  const submitAdvance = async (event: FormEvent) => {
    event.preventDefault();
    if (!advance.employeeId) return setError("Choose a staff member.");
    if (number(advance.amount) <= 0) return setError("Advance Amount must be greater than zero.");
    const saved = await post({ action: "save-advance", ...advance, employeeId: number(advance.employeeId), amount: number(advance.amount) });
    if (saved) { setAdvance({ employeeId: "", advanceDate: advance.advanceDate, amount: "", remarks: "" }); setError(""); }
  };

  return <section className="theka-block">
    <div className="theka-head">
      <div><h3>Theka / Piece-Rate Salary</h3><p>Calculate contract wages using PCS quantity multiplied by the per-piece rate.</p></div>
      <div className="action-group wrap">
        <button className="button secondary" onClick={() => exportThekaSalary(payroll, state.settings)}><Download size={16} /> Export Theka Salary</button>
        <button className="button secondary" onClick={() => printThekaSalary(payroll, state.settings)}><FileText size={16} /> PDF</button>
        <button className="button secondary" onClick={() => printThekaSalary(payroll, state.settings)}><Printer size={16} /> Print</button>
        <button className="button primary" onClick={() => { setTab("advance"); setError(""); }}><Banknote size={16} /> Add Advance</button>
      </div>
    </div>
    <div className="theka-tabs"><button className={cx(tab === "work" && "active")} onClick={() => { setTab("work"); setError(""); }}>Piece Work</button><button className={cx(tab === "advance" && "active")} onClick={() => { setTab("advance"); setError(""); }}>Advances</button></div>

    {tab === "work" ? <form className="theka-form" onSubmit={submitWork}>
      <div className="theka-grid">
        <Field label="Staff Member"><select value={work.employeeId} onChange={(e) => { setWork({ ...work, employeeId: e.target.value }); setError(""); }}><option value="">Select theka staff…</option>{theka.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)} · {String(item.employee_code)}</option>)}</select></Field>
        <Field label="Work From"><input type="date" value={work.workFrom} onChange={(e) => setWork({ ...work, workFrom: e.target.value })} /></Field>
        <Field label="Work To"><input type="date" value={work.workTo} onChange={(e) => setWork({ ...work, workTo: e.target.value })} /></Field>
        <Field label="Item / Work"><input placeholder="e.g. Shirt stitching" value={work.item} onChange={(e) => { setWork({ ...work, item: e.target.value }); setError(""); }} /></Field>
      </div>
      <div className="theka-grid lower">
        <Field label="PCS Qty."><input type="number" min="0" placeholder="0" value={work.pcsQty} onChange={(e) => { setWork({ ...work, pcsQty: e.target.value }); setError(""); }} /></Field>
        <Field label="Per Piece Rate"><input type="number" min="0" step="0.25" placeholder="0" value={work.ratePerPiece} onChange={(e) => { setWork({ ...work, ratePerPiece: e.target.value }); setError(""); }} /></Field>
        <Field label="Lot No. (optional)"><input list="theka-lots" placeholder="LOT-00001" value={work.lotNo} onChange={(e) => setWork({ ...work, lotNo: e.target.value.toUpperCase() })} /><datalist id="theka-lots">{state.lots.map((item) => <option key={String(item.id)} value={String(item.lot_no)} />)}</datalist></Field>
        <div className="theka-total"><small>Total Amount</small><b>{money(total)}</b><span>PCS × Rate</span></div>
        <button className="button primary theka-add" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Plus size={17} />} Add Piece-Rate Salary</button>
      </div>
      {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
    </form> : <form className="theka-form" onSubmit={submitAdvance}>
      <div className="theka-grid">
        <Field label="Staff Member"><select value={advance.employeeId} onChange={(e) => { setAdvance({ ...advance, employeeId: e.target.value }); setError(""); }}><option value="">Select staff…</option>{state.employees.filter((item) => item.status === "Active").map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)} · {String(item.salary_type)}</option>)}</select></Field>
        <Field label="Advance Date"><input type="date" value={advance.advanceDate} onChange={(e) => setAdvance({ ...advance, advanceDate: e.target.value })} /></Field>
        <Field label="Advance Amount (Rs)"><input type="number" min="0" placeholder="0" value={advance.amount} onChange={(e) => { setAdvance({ ...advance, amount: e.target.value }); setError(""); }} /></Field>
        <Field label="Remarks"><input placeholder="e.g. Eid advance" value={advance.remarks} onChange={(e) => setAdvance({ ...advance, remarks: e.target.value })} /></Field>
      </div>
      <div className="theka-grid lower">
        <div className="theka-total"><small>Advance Total This Month</small><b>{money(advanceTotal)}</b><span>Deducted from net payable</span></div>
        <button className="button primary theka-add" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Plus size={17} />} Add Advance</button>
      </div>
      {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
    </form>}

    <div className="theka-summary"><span>{staffCount} staff</span><span>{entries.length} entries in {period}</span><span>{periodAdvances.length} advances</span><b>{fmt(pcsTotal)} PCS</b><b>{money(grossTotal)} gross</b><span>{money(advanceTotal)} advance</span><em>{money(grossTotal - advanceTotal)} net</em></div>

    <article className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">PER PERSON THEKA SALARY</span><h3>Each staff member&apos;s total is calculated from all of their item entries for the selected month.</h3></div></div>
      <div className="table-scroll"><table><thead><tr><th>Staff ID</th><th>Employee</th><th>Department</th><th>Items</th><th>Total PCS</th><th>Gross Salary</th><th>Advance</th><th>Net Payable</th></tr></thead>
        <tbody>{perPerson.map((row) => <tr key={String(row.employee.id)}><td><b>{String(row.employee.employee_code)}</b></td><td>{String(row.employee.name)}<small className="cell-sub">{String(row.employee.designation)}</small></td><td><span className="department-chip">{departmentIcon(String(row.employee.department))}{String(row.employee.department)}</span></td><td>{row.items}</td><td><b>{fmt(row.pcs)}</b></td><td>{money(row.gross)}</td><td className="red-text">{money(row.advance)}</td><td><b className="green-text">{money(row.net)}</b></td></tr>)}</tbody></table></div>
      {!perPerson.length && <Empty title="No records found." detail="Add a piece-work entry above and each worker's monthly theka total builds here automatically." />}
    </article>

    <article className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">{tab === "work" ? "PIECE WORK ENTRIES" : "ADVANCE ENTRIES"}</span><h3>{period} {tab === "work" ? "item register" : "advance register"}</h3></div><span className="record-count">{(tab === "work" ? entries : periodAdvances).length} records</span></div>
      <div className="table-scroll">{tab === "work"
        ? <table><thead><tr><th>Employee</th><th>Item / Work</th><th>Lot</th><th>Work From</th><th>Work To</th><th>PCS Qty.</th><th>Per Piece Rate</th><th>Total Amount</th><th className="right">Action</th></tr></thead>
          <tbody>{entries.map((item) => <tr key={String(item.id)}><td><b>{String(item.employee_name)}</b><small className="cell-sub">{String(item.employee_code)} · {String(item.department)}</small></td><td>{String(item.item)}</td><td>{String(item.lot_no || "—")}</td><td>{formatDate(item.work_from)}</td><td>{formatDate(item.work_to)}</td><td><b>{fmt(item.pcs_qty)}</b></td><td>{money(item.rate_per_piece)}</td><td><b className="green-text">{money(item.total_amount)}</b></td><td className="right"><div className="row-actions"><button title="Delete entry" aria-label="Delete entry" disabled={saving} onClick={() => void post({ action: "delete-piece-work", entryId: item.id })}><Trash2 size={16} /></button></div></td></tr>)}</tbody></table>
        : <table><thead><tr><th>Employee</th><th>Advance Date</th><th>Amount</th><th>Remarks</th><th className="right">Action</th></tr></thead>
          <tbody>{periodAdvances.map((item) => <tr key={String(item.id)}><td><b>{String(item.employee_name)}</b><small className="cell-sub">{String(item.employee_code)} · {String(item.department)}</small></td><td>{formatDate(item.advance_date)}</td><td><b className="red-text">{money(item.amount)}</b></td><td>{String(item.remarks || "—")}</td><td className="right"><div className="row-actions"><button title="Delete advance" aria-label="Delete advance" disabled={saving} onClick={() => void post({ action: "delete-advance", advanceId: item.id })}><Trash2 size={16} /></button></div></td></tr>)}</tbody></table>}
      </div>
      {!(tab === "work" ? entries : periodAdvances).length && <Empty title="No records found." detail={tab === "work" ? "Piece-work entries for this month appear here." : "Advances paid during this month appear here."} />}
    </article>
  </section>;
}

function AdminPage({ state, page, post, saving, setModal, user }: PageProps & { page: string }) {
  if (page === "Audit Logs") return <div className="page-stack"><SectionHead eyebrow="IMMUTABLE RECORD" title="Audit Logs" detail="Every quantity, transfer and record change is preserved and cannot be deleted." action={<div className="action-group"><button className="button secondary" onClick={() => exportRows(state.audits, "MS-Boutique-Audit-Logs")}><Download size={16} /> Excel</button><button className="button secondary" onClick={() => window.print()}><FileText size={16} /> PDF</button><button className="button secondary" onClick={() => window.print()}><Printer size={16} /> Print</button></div>} /><article className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Date & Time</th><th>User</th><th>Department</th><th>Lot / Design</th><th>Action</th><th>Previous</th><th>New</th><th>Quantity</th><th>Remarks</th></tr></thead><tbody>{state.audits.map((item) => <tr key={String(item.id)}><td>{formatDate(item.created_at, true)}</td><td><b>{String(item.user_name || "Ayesha Khan")}</b></td><td>{String(item.department || "System")}</td><td>{String(item.lot_no || "—")}<small className="cell-sub">{String(item.design_no || "—")}</small></td><td><StatusBadge status={item.action} /></td><td><span className="audit-value">{String(item.previous_value || "—").slice(0, 38)}</span></td><td><span className="audit-value new">{String(item.new_value || "—").slice(0, 38)}</span></td><td>{fmt(item.quantity)}</td><td>{String(item.remarks || "—")}</td></tr>)}</tbody></table></div></article></div>;
  if (page === "Notifications") return <NotificationsPage state={state} post={post} saving={saving} />;
  if (page === "Users & Permissions") return <UsersPage state={state} post={post} saving={saving} setModal={setModal} user={user} />;
  return <><SettingsPage settings={state.settings} onSave={post} saving={saving} />{user.role === "Owner" && <ResetSystem state={state} post={post} saving={saving} />}</>;
}

function ResetSystem({ state, post, saving }: { state: FactoryState; post: PageProps["post"]; saving: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const counts = [
    { label: "Lots", value: state.lots.length }, { label: "Designs", value: state.designs.length },
    { label: "Customers", value: state.customers.length }, { label: "Gate passes", value: state.gatepasses.length },
    { label: "Employees", value: state.employees.length }, { label: "Purchases", value: state.purchases.length },
    { label: "Shops", value: state.shops.length }, { label: "Shop sales", value: state.shopSales.length },
    { label: "Other logins", value: Math.max(0, state.users.length - 1) },
  ].filter((item) => item.value > 0);
  const total = counts.reduce((sum, item) => sum + item.value, 0);
  return <section className="panel danger-zone">
    <div className="panel-head"><div><span className="eyebrow danger">DANGER ZONE</span><h3>Clear all data and start fresh</h3></div></div>
    <div className="danger-body">
      <p>Removes every lot, gate pass, employee, purchase, shop and sale so the system looks brand new. Your owner login, the company profile and the fixed workflow departments are kept so you can sign straight back in. <b>This cannot be undone.</b></p>
      {counts.length > 0 ? <div className="delete-list">{counts.map((item) => <span key={item.label}><b>{item.value}</b>{item.label}</span>)}</div> : <p className="muted">The system is already empty.</p>}
      {!open ? <button className="button danger" disabled={!total} onClick={() => setOpen(true)}><Trash2 size={16} /> Clear All Data</button> : <div className="danger-confirm">
        <Field label="Type RESET to confirm"><input value={confirm} onChange={(event) => setConfirm(event.target.value.toUpperCase())} placeholder="RESET" /></Field>
        <div className="action-group"><button className="button secondary" onClick={() => { setOpen(false); setConfirm(""); }}>Cancel</button><button className="button danger" disabled={saving || confirm !== "RESET"} onClick={() => void post({ action: "reset-system", confirm })}>{saving && <LoaderCircle className="spin" size={16} />} Clear {total} records permanently</button></div>
      </div>}
    </div>
  </section>;
}

function NotificationsPage({ state, post, saving }: { state: FactoryState; post: PageProps["post"]; saving: boolean }) {
  const [category, setCategory] = useState(""); const [onlyUnread, setOnlyUnread] = useState(false);
  const categories = [...new Set(state.notifications.map((item) => String(item.category || "Factory")))];
  const rows = state.notifications.filter((item) => (!category || String(item.category) === category) && (!onlyUnread || !number(item.read)));
  const unread = state.notifications.filter((item) => !number(item.read)).length;
  const icon = (level: string) => level === "success" ? <CheckCircle2 /> : level === "warning" || level === "critical" ? <AlertTriangle /> : level === "Delivery" ? <CalendarDays /> : <Info />;
  return <div className="page-stack"><SectionHead eyebrow="OWNER ALERT INBOX" title="Notifications" detail="Every department action reported to the owner and admin in one place, with live banner alerts on new activity." action={<div className="action-group"><button className="button secondary" onClick={() => exportRows(state.notifications, "MS-Boutique-Notifications")}><Download size={16} /> Excel</button><button className="button primary" disabled={saving || !unread} onClick={() => void post({ action: "mark-notifications-read" })}><Check size={16} /> Mark all read</button></div>} />
    <section className="alert-summary"><article className="unread-card"><span className="notification-icon"><BellRing /></span><div><small>Unread alerts</small><b>{unread}</b></div></article>{["Warehouse", "Gatepass", "Dispatch", "Payroll"].map((item) => <article key={item}><span className="notification-icon">{item === "Warehouse" ? <WarehouseIcon /> : item === "Gatepass" ? <DoorOpen /> : item === "Dispatch" ? <Truck /> : <Wallet />}</span><div><small>{item}</small><b>{state.notifications.filter((row) => row.category === item).length}</b></div></article>)}</section>
    <div className="filter-bar"><div className="select-wrap"><Filter size={15} /><select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></div><label className="toggle-field"><input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /><span>Unread only</span></label>{(category || onlyUnread) && <button className="clear-filters" onClick={() => { setCategory(""); setOnlyUnread(false); }}><X size={14} /> Clear</button>}</div>
    <div className="notification-list">{rows.map((item) => <article key={String(item.id)} className={cx(!number(item.read) && "unread", `level-${String(item.level || "info")}`)}>
      <div className="notification-icon">{icon(String(item.level || "info"))}</div>
      <div><h3>{String(item.title)}</h3><p>{String(item.message)}</p><small>{formatDate(item.created_at, true)} · reported by {String(item.actor_name || "System")} · to {String(item.audience || "Owner")}</small></div>
      <div className="notification-actions"><span>{String(item.category || "Factory")}</span>{!number(item.read) && <button className="button ghost small" disabled={saving} onClick={() => void post({ action: "mark-notifications-read", notificationId: item.id })}><Check size={14} /> Mark read</button>}</div>
    </article>)}</div>
    {!rows.length && <Empty title="No notifications" detail="Alerts appear as departments transfer lots, issue gate passes, receive stock and settle payroll." />}
  </div>;
}

function SettingsPage({ settings, onSave, saving }: { settings: Row; onSave: PageProps["post"]; saving: boolean }) {
  const [form, setForm] = useState({ companyName: String(settings.company_name || "MS Boutique"), address: String(settings.address || ""), phone: String(settings.phone || ""), website: String(settings.website || ""), logoUrl: String(settings.logo_url || ""), invoicePrefix: String(settings.invoice_prefix || "INV"), challanPrefix: String(settings.challan_prefix || "DC"), footerNote: String(settings.footer_note || "") });
  const [error, setError] = useState("");
  const logoInput = useRef<HTMLInputElement | null>(null);
  const set = (key: keyof typeof form, value: string) => { setForm((current) => ({ ...current, [key]: value })); setError(""); };

  // The picked file is inlined as a data URI so the logo travels with the record
  // and prints on gate passes and invoices without any external hosting.
  const pickLogo = (file?: File | null) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|webp|gif|svg\+xml)$/.test(file.type)) return setError("Choose a PNG, JPG, WEBP, GIF or SVG image.");
    if (file.size > 400 * 1024) return setError(`That image is ${Math.round(file.size / 1024)} KB. Please choose a logo under 400 KB.`);
    const reader = new FileReader();
    reader.onload = () => set("logoUrl", String(reader.result || ""));
    reader.onerror = () => setError("That image could not be read. Try a different file.");
    reader.readAsDataURL(file);
  };

  const submit = async (event: FormEvent) => { event.preventDefault(); if (!form.companyName.trim()) return setError("Company Name is required."); if (!form.address.trim()) return setError("Company Address is required."); if (!form.phone.trim()) return setError("Company Phone is required."); await onSave({ action: "save-settings", ...form }); };
  return <div className="page-stack"><SectionHead eyebrow="SYSTEM PREFERENCES" title="Settings" detail="Control the company identity printed on invoices, delivery challans and gatepasses." /><form className="panel settings-panel" onSubmit={submit}><div className="settings-section"><div><h3>Company profile</h3><p>This identity appears at the top of every dispatch document and stock report.</p></div><div className="company-settings"><div className="company-logo-preview">{form.logoUrl ? <img src={form.logoUrl} alt="Company logo preview" /> : <span className="logo-mark">MS</span>}<small><Image size={14} /> Logo preview</small></div><div className="form-grid"><Field label="Company Name *"><input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} /></Field><Field label="Phone Number *"><div className="input-icon"><Phone size={16} /><input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div></Field><Field label="Company Address *" span><div className="input-icon"><MapPin size={16} /><input value={form.address} onChange={(e) => set("address", e.target.value)} /></div></Field><Field label="Website (optional)"><div className="input-icon"><Globe2 size={16} /><input placeholder="www.example.com" value={form.website} onChange={(e) => set("website", e.target.value)} /></div></Field>
      <Field label="Company Logo" span>
        <div className="logo-upload">
          <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ""; }} hidden />
          <button type="button" className="button secondary" onClick={() => logoInput.current?.click()}><Upload size={15} /> Upload from computer</button>
          {form.logoUrl && <button type="button" className="button danger small" onClick={() => set("logoUrl", "")}><Trash2 size={14} /> Remove logo</button>}
          <small>PNG, JPG, WEBP, GIF or SVG up to 400 KB. The uploaded logo is stored with your company profile and printed on gate passes, invoices and delivery challans.</small>
        </div>
        <input placeholder="…or paste an image address: https://…/logo.png" value={hasUploadedLogo(form.logoUrl) ? "" : form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} disabled={hasUploadedLogo(form.logoUrl)} />
        {hasUploadedLogo(form.logoUrl) && <small className="field-note">Uploaded image in use — remove it to paste a web address instead.</small>}
      </Field></div></div></div><div className="settings-section"><div><h3>Invoice & gatepass settings</h3><p>Set numbering prefixes and the note printed on customer dispatch documents.</p></div><div className="form-grid"><Field label="Invoice Prefix *"><input value={form.invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value.toUpperCase())} /></Field><Field label="Delivery Challan Prefix *"><input value={form.challanPrefix} onChange={(e) => set("challanPrefix", e.target.value.toUpperCase())} /></Field><Field label="Document Footer Note" span><textarea rows={3} value={form.footerNote} onChange={(e) => set("footerNote", e.target.value)} /></Field><div className="document-preview field-span"><ReceiptText /><div><b>{form.companyName || "Company Name"}</b><span>{form.invoicePrefix || "INV"}-2026-001 · {form.challanPrefix || "DC"}-2026-001</span><small>{form.address || "Company address"} · {form.phone || "Phone number"}</small></div></div></div></div><div className="settings-section"><div><h3>Workflow control</h3><p>The official eight-step production sequence remains locked.</p></div><div className="settings-flow">{workflow.map((item, index) => <span key={item}><b>{index + 1}</b>{item}{index < workflow.length - 1 && <ArrowRight size={15} />}</span>)}</div></div>{error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}<div className="settings-save"><button className="button primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} Save Invoice Settings</button></div></form></div>;
}

function NewLotModal({ onClose, onSave, saving, state }: { onClose: () => void; onSave: PageProps["post"]; saving: boolean; state: FactoryState }) {
  const [form, setForm] = useState({ designNo: "", fabrication: "", quantity: "", sizeRange: "S-XL", customer: "Noor Fashion House", orderDate: today, deliveryDate: "2026-08-25", priority: "Normal", remarks: "Production approved." });
  const [sizes, setSizes] = useState([{ colour: "", size: "S", quantity: "" },{ colour: "", size: "M", quantity: "" },{ colour: "", size: "L", quantity: "" },{ colour: "", size: "XL", quantity: "" }]); const [errors, setErrors] = useState<Record<string,string>>({});
  const set = (key: string, value: string) => { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: "" })); };
  const submit = async (event: FormEvent) => { event.preventDefault(); const next: Record<string,string> = {}; if (!form.designNo.trim()) next.designNo = "Design No. is required."; if (!form.fabrication.trim()) next.fabrication = "Fabrication is required."; if (number(form.quantity) <= 0) next.quantity = "QTY must be greater than zero."; if (!form.sizeRange.trim()) next.sizeRange = "Size Range is required."; if (form.deliveryDate < form.orderDate) next.deliveryDate = "Delivery Date cannot be before Order Date."; const sizeTotal = sizes.reduce((sum, item) => sum + number(item.quantity), 0); if (sizeTotal && sizeTotal !== number(form.quantity)) next.sizes = "Total colour / size quantity must equal lot quantity."; setErrors(next); if (Object.keys(next).length) return; await onSave({ action: "create-lot", ...form, quantity: number(form.quantity), sizes: sizes.filter((item) => number(item.quantity) > 0).map((item) => ({ colour: item.colour || "General", size: item.size || "ALL", quantity: number(item.quantity) })) }); };
  return <Modal title="Issue New Production Lot" subtitle="Lot No. will be generated automatically after validation." onClose={onClose} wide><form onSubmit={submit}><div className="form-grid three"><Field label="Lot No."><input value="Auto-generated" disabled /></Field><Field label="Design No. *" error={errors.designNo}><input placeholder="e.g. MS-1006" value={form.designNo} onChange={(e) => set("designNo", e.target.value.toUpperCase())} /></Field><Field label="Fabrication *" error={errors.fabrication}><input list="fabrications" placeholder="e.g. Cotton Lawn" value={form.fabrication} onChange={(e) => set("fabrication", e.target.value)} /><datalist id="fabrications">{state.designs.map((item) => <option key={String(item.id)} value={String(item.fabrication)} />)}</datalist></Field><Field label="Total QTY *" error={errors.quantity}><input type="number" min="1" placeholder="5,000" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} /></Field><Field label="Size Range *" error={errors.sizeRange}><input placeholder="S-XL" value={form.sizeRange} onChange={(e) => set("sizeRange", e.target.value)} /></Field><Field label="Customer *"><input list="customers" value={form.customer} onChange={(e) => set("customer", e.target.value)} /><datalist id="customers">{state.customers.map((item) => <option key={String(item.id)} value={String(item.name)} />)}</datalist></Field><Field label="Order Date"><input type="date" value={form.orderDate} onChange={(e) => set("orderDate", e.target.value)} /></Field><Field label="Required Delivery Date" error={errors.deliveryDate}><input type="date" value={form.deliveryDate} onChange={(e) => set("deliveryDate", e.target.value)} /></Field><Field label="Priority"><select value={form.priority} onChange={(e) => set("priority", e.target.value)}><option>Normal</option><option>High</option><option>Urgent</option></select></Field></div><LotBreakdownEditor rows={sizes} setRows={setSizes} total={number(form.quantity)} error={errors.sizes} /><Field label="Initial Remarks" span><textarea rows={3} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field><div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />} Issue Lot <ArrowRight size={16} /></button></div></form></Modal>;
}

type LotBreakdownDraft = { colour: string; size: string; quantity: string };
function LotBreakdownEditor({ rows, setRows, total, error }: { rows: LotBreakdownDraft[]; setRows: Dispatch<SetStateAction<LotBreakdownDraft[]>>; total: number; error?: string }) {
  const entered = rows.reduce((sum, item) => sum + number(item.quantity), 0); const remaining = total - entered;
  const update = (index: number, key: keyof LotBreakdownDraft, value: string) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: key === "size" ? value.toUpperCase() : value } : row));
  return <div className="size-breakdown colour-breakdown"><div><span><span className="eyebrow">COLOUR / SIZE-WISE QUANTITY</span><p>Use size ALL when only a colour total is needed.</p></span><button type="button" className="link-button" onClick={() => setRows((current) => [...current, { colour: "", size: "", quantity: "" }])}><Plus size={14} /> Add row</button></div><div className="breakdown-head"><span>Colour</span><span>Size</span><span>Quantity</span><span /></div><div className="breakdown-rows">{rows.map((item, index) => <div key={index}><input aria-label={`Colour ${index + 1}`} placeholder="e.g. Black" value={item.colour} onChange={(e) => update(index, "colour", e.target.value)} /><input aria-label={`Size ${index + 1}`} placeholder="ALL / S / M" value={item.size} onChange={(e) => update(index, "size", e.target.value)} /><input aria-label={`Quantity ${index + 1}`} type="number" min="0" placeholder="QTY" value={item.quantity} onChange={(e) => update(index, "quantity", e.target.value)} /><button type="button" className="icon-button" aria-label={`Remove breakdown row ${index + 1}`} disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={14} /></button></div>)}</div><div className="breakdown-total"><span>Entered <b>{fmt(entered)}</b></span><span className={remaining === 0 ? "green-text" : remaining < 0 ? "red-text" : "orange-text"}>{remaining >= 0 ? "Remaining" : "Over"} <b>{fmt(Math.abs(remaining))}</b></span><span>Lot Total <b>{fmt(total)}</b></span></div>{error && <small className="field-error"><AlertTriangle size={13} />{error}</small>}</div>;
}

function EditLotModal({ lot, state, onClose, onSave, saving }: { lot: Row; state: FactoryState; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  const [form, setForm] = useState({ fabrication: String(lot.fabrication), quantity: String(lot.quantity), sizeRange: String(lot.size_range), orderDate: String(lot.order_date), deliveryDate: String(lot.required_delivery_date), priority: String(lot.priority), remarks: String(lot.remarks) }); const [error, setError] = useState("");
  const existing = state.sizes.filter((item) => number(item.lot_id) === number(lot.id));
  const [sizes, setSizes] = useState<LotBreakdownDraft[]>(existing.length ? existing.map((item) => ({ colour: String(item.colour || "General"), size: String(item.size || "ALL"), quantity: String(item.quantity) })) : [{ colour: "General", size: String(lot.size_range || "ALL"), quantity: String(lot.quantity) }]);
  const sizeTotal = sizes.reduce((sum, item) => sum + number(item.quantity), 0);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!form.fabrication || !form.sizeRange || number(form.quantity) <= 0) return setError("Complete all required fields with a valid quantity."); if (form.deliveryDate < form.orderDate) return setError("Required Delivery Date cannot be before Order Date."); if (sizeTotal && sizeTotal !== number(form.quantity)) return setError("Total colour / size quantity must equal lot quantity."); await onSave({ action: "update-lot", lotId: lot.id, ...form, quantity: number(form.quantity), sizes: sizes.filter((item) => number(item.quantity) > 0).map((item) => ({ colour: item.colour || "General", size: item.size || "ALL", quantity: number(item.quantity) })) }); };
  return <Modal title={`Edit ${String(lot.lot_no)}`} subtitle={`${String(lot.design_no)} · Changes are recorded in Audit Logs.`} onClose={onClose} wide><form onSubmit={submit}><div className="form-grid three"><Field label="Fabrication"><input value={form.fabrication} onChange={(e) => setForm({ ...form, fabrication: e.target.value })} /></Field><Field label="Total QTY"><input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field><Field label="Size Range"><input value={form.sizeRange} onChange={(e) => setForm({ ...form, sizeRange: e.target.value })} /></Field><Field label="Priority"><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option>Normal</option><option>High</option><option>Urgent</option></select></Field><Field label="Order Date"><input type="date" value={form.orderDate} onChange={(e) => setForm({ ...form, orderDate: e.target.value })} /></Field><Field label="Delivery Date"><input type="date" value={form.deliveryDate} onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })} /></Field></div><LotBreakdownEditor rows={sizes} setRows={setSizes} total={number(form.quantity)} error={sizeTotal && sizeTotal !== number(form.quantity) ? "Total colour / size quantity must equal lot quantity." : undefined} /><Field label="Remarks" span><textarea rows={3} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>{error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>Save Changes</button></div></form></Modal>;
}

function ProductionModal({ lot, department, state, onClose, onSave, saving }: { lot: Row; department: string; state: FactoryState; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  const record = state.records[department]?.find((item) => number(item.lot_id) === number(lot.id)); const received = number(record?.received_qty); const [form, setForm] = useState({ completedQty: String(record?.completed_qty ?? 0), rejectedQty: String(record?.rejected_qty ?? 0), reworkQty: String(record?.rework_qty ?? 0), status: String(record?.status === "Waiting" ? "Received" : record?.status || "Received"), remarks: String(record?.remarks || ""), targetQty: String(record?.target_qty || received), todayProduction: String(record?.today_production || 0), productionLine: String(record?.production_line || "Line 01"), supervisor: String(record?.supervisor || ""), process: String(record?.process || "General Quality Check"), piecesPerCarton: String(record?.pieces_per_carton || 20) }); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); const completed = number(form.completedQty), rejected = number(form.rejectedQty); if ([completed,rejected,number(form.reworkQty)].some((value) => value < 0)) return setError("Incorrect Quantity — quantities cannot be negative."); if (completed > received) return setError("Completed QTY cannot exceed Received QTY."); if (completed + rejected > received) return setError("Completed plus Rejected QTY cannot exceed Received QTY."); await onSave({ action: "update-production", lotId: lot.id, department, ...form, completedQty: completed, rejectedQty: rejected, reworkQty: number(form.reworkQty), targetQty: number(form.targetQty), todayProduction: number(form.todayProduction), piecesPerCarton: number(form.piecesPerCarton) }); };
  const label = department === "Cutting" || department === "Finishing" ? "Passed QTY" : department === "Packing" ? "Packing QTY" : "Completed QTY";
  return <Modal title={`Update ${department} Production`} subtitle={`${String(lot.design_no)} / ${String(lot.lot_no)} · ${fmt(received)} PCS received`} onClose={onClose} wide><form onSubmit={submit}><div className="production-summary"><span><small>Received QTY</small><b>{fmt(received)}</b></span><span><small>Already transferred</small><b>{fmt(record?.transferred_qty)}</b></span><span><small>Calculated pending</small><b>{fmt(Math.max(0, received - number(form.completedQty)))}</b></span>{department === "Packing" && <span><small>Calculated cartons</small><b>{Math.ceil(number(form.completedQty) / Math.max(1, number(form.piecesPerCarton)))}</b></span>}</div><div className="form-grid three"><Field label={label}><input type="number" min="0" max={received} value={form.completedQty} onChange={(e) => { setForm({ ...form, completedQty: e.target.value }); setError(""); }} /></Field><Field label="Rejected QTY"><input type="number" min="0" value={form.rejectedQty} onChange={(e) => setForm({ ...form, rejectedQty: e.target.value })} /></Field><Field label="Rework QTY"><input type="number" min="0" value={form.reworkQty} onChange={(e) => setForm({ ...form, reworkQty: e.target.value })} /></Field>{department === "Stitching" && <><Field label="Target QTY"><input type="number" value={form.targetQty} onChange={(e) => setForm({ ...form, targetQty: e.target.value })} /></Field><Field label="Today's Production"><input type="number" value={form.todayProduction} onChange={(e) => setForm({ ...form, todayProduction: e.target.value })} /></Field><Field label="Production Line"><input value={form.productionLine} onChange={(e) => setForm({ ...form, productionLine: e.target.value })} /></Field></>}{department === "Finishing" && <Field label="Finishing Process"><select value={form.process} onChange={(e) => setForm({ ...form, process: e.target.value })}>{["Thread Cutting","Ironing","Measurement Check","Cleaning","Final Inspection","Button / Accessory Check","Label Check","General Quality Check"].map((item) => <option key={item}>{item}</option>)}</select></Field>}{department === "Packing" && <Field label="Pieces Per Carton"><input type="number" min="1" value={form.piecesPerCarton} onChange={(e) => setForm({ ...form, piecesPerCarton: e.target.value })} /></Field>}<Field label="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{["Received","In Progress","Running","Partially Completed","Completed","Hold","Rework"].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Supervisor"><input value={form.supervisor} onChange={(e) => setForm({ ...form, supervisor: e.target.value })} /></Field><Field label="Timestamped Remarks" span><textarea rows={3} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder={`Add a ${department.toLowerCase()} production note…`} /></Field></div>{error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />} Save Production Update</button></div></form></Modal>;
}

function TransferModal({ lot, department, state, onClose, onSave, saving }: { lot: Row; department: string; state: FactoryState; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  const record = department === "Issue Lot" ? null : state.records[department]?.find((item) => number(item.lot_id) === number(lot.id)); const issueTransferred = department === "Issue Lot" ? state.transfers.filter((item) => number(item.lot_id) === number(lot.id) && number(item.from_department_id) === 1).reduce((sum, item) => sum + number(item.quantity), 0) : 0; const completed = department === "Issue Lot" ? number(lot.quantity) : number(record?.completed_qty); const transferred = department === "Issue Lot" ? issueTransferred : number(record?.transferred_qty); const available = Math.max(0, completed - transferred); const next = workflow[workflow.indexOf(department) + 1]; const [quantity, setQuantity] = useState(String(available)); const [remarks, setRemarks] = useState(`${available.toLocaleString()} PCS verified and ready for ${next}.`); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); if (number(quantity) <= 0) return setError("Transfer QTY must be greater than zero."); if (number(quantity) > available) return setError("Transfer quantity cannot exceed available completed quantity."); await onSave({ action: "transfer", lotId: lot.id, department, quantity: number(quantity), remarks }); };
  return <Modal title={`Transfer to ${next}`} subtitle="Quantity-controlled department handoff" onClose={onClose}><form onSubmit={submit}><div className="transfer-route"><span>{departmentIcon(department)}<b>{department}</b></span><ArrowRight /><span>{departmentIcon(next)}<b>{next}</b></span></div><div className="transfer-lot"><span><small>DESIGN / LOT</small><b>{String(lot.design_no)} / {String(lot.lot_no)}</b></span><span><small>COMPLETED</small><b>{fmt(completed)} PCS</b></span><span><small>ALREADY TRANSFERRED</small><b>{fmt(transferred)} PCS</b></span><span><small>AVAILABLE NOW</small><b className="green-text">{fmt(available)} PCS</b></span></div><Field label="Transfer QTY"><input type="number" min="1" max={available} value={quantity} onChange={(e) => { setQuantity(e.target.value); setError(""); }} /></Field><Field label="Transfer Remarks"><textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>{error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}<div className="confirm-copy"><CheckCircle2 size={18} /><span>Transfer <b>{fmt(quantity)} PCS</b> of Design <b>{String(lot.design_no)} / {String(lot.lot_no)}</b> from {department} to {next}?</span></div><div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving || available <= 0}>{saving && <LoaderCircle className="spin" size={16} />} Confirm Transfer</button></div></form></Modal>;
}

function RemarkModal({ lot, department, onClose, onSave, saving }: { lot: Row; department: string; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) { const [remark, setRemark] = useState(""); const [error, setError] = useState(""); return <Modal title="Add Timestamped Remark" subtitle={`${String(lot.design_no)} / ${String(lot.lot_no)} · ${department}`} onClose={onClose}><form onSubmit={async (event) => { event.preventDefault(); if (!remark.trim()) return setError("Remarks cannot be blank."); await onSave({ action: "add-remark", lotId: lot.id, department, remark }); }}><Field label="Remark" error={error}><textarea rows={5} autoFocus value={remark} onChange={(e) => { setRemark(e.target.value); setError(""); }} placeholder="Describe production progress, quality observations or transfer notes…" /></Field><div className="history-note"><FileText size={17} />This entry will be timestamped and added to the permanent remarks and audit history.</div><div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>Add Remark</button></div></form></Modal>; }

function DispatchModal({ lot, state, onClose, onSave, saving }: { lot: Row; state: FactoryState; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  const inventory = state.warehouse.find((item) => number(item.lot_id) === number(lot.id)); const available = number(inventory?.balance_qty); const invoicePrefix = String(state.settings.invoice_prefix || "INV"); const challanPrefix = String(state.settings.challan_prefix || "DC"); const [form, setForm] = useState({ quantity: String(available), cartonQty: String(Math.ceil(available / 20)), invoiceNo: `${invoicePrefix}-2026-${String(state.dispatches.length + 1).padStart(3,"0")}`, challanNo: `${challanPrefix}-2026-${String(state.dispatches.length + 1).padStart(3,"0")}`, transporter: "MS Logistics", vehicleNo: "LEA-2026", driverName: "Imran Ali", driverContact: "+92 300 000 0000", dispatchDate: "2026-08-09", destination: String(lot.destination || "Lahore"), trackingNo: `TRK-${Date.now().toString().slice(-6)}`, dispatchStatus: "In Transit", remarks: "Finished goods counted and sealed." }); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); if (number(form.quantity) <= 0) return setError("Dispatch QTY must be greater than zero."); if (number(form.quantity) > available) return setError("Dispatch QTY cannot be greater than Warehouse Available QTY."); if (!form.invoiceNo || !form.challanNo) return setError("Invoice No. and Delivery Challan No. are required."); await onSave({ action: "dispatch", lotId: lot.id, ...form, quantity: number(form.quantity), cartonQty: number(form.cartonQty) }); };
  return <Modal title="Create Customer Dispatch" subtitle={`${String(lot.design_no)} / ${String(lot.lot_no)} · ${String(lot.customer)}`} onClose={onClose} wide><form onSubmit={submit}><div className="warehouse-available"><WarehouseIcon /><span><small>WAREHOUSE AVAILABLE QTY</small><b>{fmt(available)} PCS</b></span><span><small>AFTER THIS DISPATCH</small><b>{fmt(Math.max(0, available - number(form.quantity)))} PCS</b></span></div><div className="form-grid three"><Field label="Dispatch QTY *"><input type="number" min="1" max={available} value={form.quantity} onChange={(e) => { setForm({ ...form, quantity: e.target.value }); setError(""); }} /></Field><Field label="Carton QTY"><input type="number" min="0" value={form.cartonQty} onChange={(e) => setForm({ ...form, cartonQty: e.target.value })} /></Field><Field label="Dispatch Date"><input type="date" value={form.dispatchDate} onChange={(e) => setForm({ ...form, dispatchDate: e.target.value })} /></Field><Field label="Invoice No. *"><input value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} /></Field><Field label="Delivery Challan No. *"><input value={form.challanNo} onChange={(e) => setForm({ ...form, challanNo: e.target.value })} /></Field><Field label="Tracking / Reference No."><input value={form.trackingNo} onChange={(e) => setForm({ ...form, trackingNo: e.target.value })} /></Field><Field label="Transporter"><input value={form.transporter} onChange={(e) => setForm({ ...form, transporter: e.target.value })} /></Field><Field label="Vehicle No."><input value={form.vehicleNo} onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })} /></Field><Field label="Destination"><input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></Field><Field label="Driver Name"><input value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} /></Field><Field label="Driver Contact"><input value={form.driverContact} onChange={(e) => setForm({ ...form, driverContact: e.target.value })} /></Field><Field label="Inventory Dispatch Status"><select value={form.dispatchStatus} onChange={(e) => setForm({ ...form, dispatchStatus: e.target.value })}>{dispatchStatuses.filter((item) => item !== "Active").map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Remarks" span><input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field></div>{error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}<div className="confirm-copy"><Truck size={18} /><span>Inventory and every stock report will show this lot as <b>{form.dispatchStatus}</b>. You can move it to Shipped or Delivered later from Inventory.</span></div><div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />} Confirm Customer Dispatch <Truck size={16} /></button></div></form></Modal>;
}

function WarehouseReceiveModal({ lot, receipt, onClose, onSave, saving }: { lot: Row; receipt: Row; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  const gatepassQty = number(receipt.received_qty);
  const [form, setForm] = useState({ receivedBy: "Usman Shah", receivedDate: today, location: "Finished Goods - A", rackNo: `A-${String(lot.id).padStart(2, "0")}`, receivableQty: String(gatepassQty), nonReceivableQty: "0", nonReceivableReason: "", remarks: "Gate pass counted, cartons sealed and quantity verified." });
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string) => { setForm((current) => ({ ...current, [key]: value })); setError(""); };
  const receivable = number(form.receivableQty); const nonReceivable = number(form.nonReceivableQty); const counted = receivable + nonReceivable;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.receivedBy.trim()) return setError("Received By is required.");
    if (!form.location.trim() || !form.rackNo.trim()) return setError("Warehouse Location and Rack No. are required.");
    if (receivable <= 0) return setError("Receivable PCS must be greater than zero.");
    if (nonReceivable < 0) return setError("Non-receivable PCS cannot be negative.");
    if (counted !== gatepassQty) return setError(`Receivable plus non-receivable PCS must equal the ${fmt(gatepassQty)} PCS on this gate pass.`);
    if (nonReceivable > 0 && !form.nonReceivableReason.trim()) return setError("Add a reason for the non-receivable PCS.");
    await onSave({ action: "receive-warehouse", lotId: lot.id, receiptId: receipt.id, ...form, receivableQty: receivable, nonReceivableQty: nonReceivable });
  };
  return <Modal title="Receive Lot in Warehouse" subtitle={`${String(receipt.receipt_no)} · ${String(lot.design_no)} / ${String(lot.lot_no)}`} onClose={onClose} wide><form onSubmit={submit}>
    <div className="warehouse-available"><ClipboardCheck /><span><small>GATE PASS QTY</small><b>{fmt(gatepassQty)} PCS</b></span><span><small>TOTAL CARTONS</small><b>{fmt(receipt.cartons)}</b></span><span><small>COUNTED NOW</small><b className={counted === gatepassQty ? "green-text" : "orange-text"}>{fmt(counted)} PCS</b></span><span><small>DIFFERENCE</small><b className={counted === gatepassQty ? "green-text" : "red-text"}>{fmt(gatepassQty - counted)} PCS</b></span></div>
    <div className="receive-split">
      <label className="receive-box receivable"><span><CheckCircle2 size={15} /> Receivable PCS *</span><input type="number" min="0" max={gatepassQty} value={form.receivableQty} onChange={(e) => { const value = e.target.value; setForm((current) => ({ ...current, receivableQty: value, nonReceivableQty: String(Math.max(0, gatepassQty - number(value))) })); setError(""); }} /><small>Added to live warehouse stock automatically.</small></label>
      <label className="receive-box non-receivable"><span><AlertTriangle size={15} /> Non-Receivable PCS</span><input type="number" min="0" max={gatepassQty} value={form.nonReceivableQty} onChange={(e) => { const value = e.target.value; setForm((current) => ({ ...current, nonReceivableQty: value, receivableQty: String(Math.max(0, gatepassQty - number(value))) })); setError(""); }} /><small>Damaged, short or rejected pieces held out of stock.</small></label>
    </div>
    <div className="form-grid"><Field label="Received By *"><input value={form.receivedBy} onChange={(e) => set("receivedBy", e.target.value)} /></Field><Field label="Received Date *"><input type="date" value={form.receivedDate} onChange={(e) => set("receivedDate", e.target.value)} /></Field><Field label="Warehouse Location *"><input value={form.location} onChange={(e) => set("location", e.target.value)} /></Field><Field label="Rack No. *"><input value={form.rackNo} onChange={(e) => set("rackNo", e.target.value)} /></Field><Field label={`Non-Receivable Reason ${nonReceivable > 0 ? "*" : ""}`} span><input placeholder="e.g. 40 PCS stain damage returned to Finishing" value={form.nonReceivableReason} onChange={(e) => set("nonReceivableReason", e.target.value)} disabled={nonReceivable <= 0} /></Field><Field label="Receiving Remarks" span><textarea rows={3} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field></div>
    {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
    <div className="confirm-copy"><CheckCircle2 size={18} /><span>Clicking Received will auto-add <b>{fmt(receivable)} receivable PCS</b> to live Warehouse stock{nonReceivable > 0 ? <> and keep <b>{fmt(nonReceivable)} PCS</b> out of stock on the receipt report</> : null}, then alert the owner.</span></div>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />} Received <ClipboardCheck size={16} /></button></div>
  </form></Modal>;
}

function GatepassModal({ lot, gatepass, onClose, onSave, saving }: { lot: Row; gatepass: Row; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  const [form, setForm] = useState({ vehicleNo: String(gatepass.vehicle_no || ""), driverName: String(gatepass.driver_name || ""), driverContact: String(gatepass.driver_contact || ""), issuedBy: String(gatepass.issued_by || "Faiza Khan"), approvedBy: String(gatepass.approved_by || "Ayesha Khan"), securityCheck: String(gatepass.security_check || "Cleared"), purpose: String(gatepass.purpose || "Warehouse Shipment"), gatepassDate: String(gatepass.gatepass_date || today), remarks: String(gatepass.remarks || "") });
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string) => { setForm((current) => ({ ...current, [key]: value })); setError(""); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.vehicleNo.trim()) return setError("Vehicle No. is required on a gate pass.");
    if (!form.driverName.trim()) return setError("Driver Name is required on a gate pass.");
    if (!form.issuedBy.trim() || !form.approvedBy.trim()) return setError("Issued By and Approved By are both required.");
    await onSave({ action: "issue-gatepass", lotId: lot.id, gatepassId: gatepass.id, ...form });
  };
  return <Modal title={`Issue ${String(gatepass.gatepass_no)}`} subtitle={`${String(lot.design_no)} / ${String(lot.lot_no)} · Packing to Warehouse`} onClose={onClose} wide><form onSubmit={submit}>
    <div className="transfer-route"><span>{departmentIcon("Packing")}<b>Packing</b></span><ArrowRight /><span><DoorOpen size={15} /><b>Gatepass</b></span><ArrowRight /><span>{departmentIcon("Warehouse")}<b>Warehouse</b></span></div>
    <div className="transfer-lot"><span><small>DESIGN / LOT</small><b>{String(lot.design_no)} / {String(lot.lot_no)}</b></span><span><small>QUANTITY</small><b>{fmt(gatepass.quantity)} PCS</b></span><span><small>CARTONS</small><b>{fmt(gatepass.cartons)}</b></span><span><small>CUSTOMER</small><b>{String(gatepass.customer || lot.customer)}</b></span></div>
    <div className="form-grid three"><Field label="Vehicle No. *"><input placeholder="LEA-7781" value={form.vehicleNo} onChange={(e) => set("vehicleNo", e.target.value.toUpperCase())} /></Field><Field label="Driver Name *"><input value={form.driverName} onChange={(e) => set("driverName", e.target.value)} /></Field><Field label="Driver Contact"><input value={form.driverContact} onChange={(e) => set("driverContact", e.target.value)} /></Field><Field label="Issued By *"><input value={form.issuedBy} onChange={(e) => set("issuedBy", e.target.value)} /></Field><Field label="Approved By *"><input value={form.approvedBy} onChange={(e) => set("approvedBy", e.target.value)} /></Field><Field label="Security Check"><select value={form.securityCheck} onChange={(e) => set("securityCheck", e.target.value)}>{["Cleared", "Pending", "Hold"].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Purpose"><select value={form.purpose} onChange={(e) => set("purpose", e.target.value)}>{["Warehouse Shipment", "Sample Movement", "Returnable Movement", "Job Work"].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Gate Pass Date"><input type="date" value={form.gatepassDate} onChange={(e) => set("gatepassDate", e.target.value)} /></Field><Field label="Remarks" span><textarea rows={2} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} placeholder="Seal numbers, carton condition or security notes…" /></Field></div>
    {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
    <div className="confirm-copy"><DoorOpen size={18} /><span>The gate pass is printable once issued. Release it when the vehicle actually leaves Packing — that is what creates the Warehouse receipt.</span></div>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />} Issue Gate Pass</button></div>
  </form></Modal>;
}

function GatepassReleaseModal({ lot, gatepass, onClose, onSave, saving }: { lot: Row; gatepass: Row; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  const [releaseDate, setReleaseDate] = useState(today);
  return <Modal title={`Release ${String(gatepass.gatepass_no)} to Warehouse`} subtitle={`${String(lot.design_no)} / ${String(lot.lot_no)} · ${fmt(gatepass.quantity)} PCS`} onClose={onClose}>
    <div className="transfer-lot"><span><small>VEHICLE</small><b>{String(gatepass.vehicle_no)}</b></span><span><small>DRIVER</small><b>{String(gatepass.driver_name)}</b></span><span><small>CARTONS</small><b>{fmt(gatepass.cartons)}</b></span><span><small>APPROVED BY</small><b>{String(gatepass.approved_by)}</b></span></div>
    <Field label="Release Date"><input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} /></Field>
    <div className="confirm-copy"><Truck size={18} /><span>Releasing creates an <b>Expected</b> Warehouse receipt for <b>{fmt(gatepass.quantity)} PCS</b>. Warehouse then clicks Received and splits receivable from non-receivable pieces.</span></div>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button secondary" onClick={() => printMovementGatepass(gatepass, {})}><Printer size={16} /> Print</button><button className="button primary" disabled={saving} onClick={() => void onSave({ action: "release-gatepass", lotId: lot.id, gatepassId: gatepass.id, releaseDate })}>{saving && <LoaderCircle className="spin" size={16} />} Release to Warehouse</button></div>
  </Modal>;
}

function CustomerModal({ customer, onClose, onSave, saving }: { customer?: Row; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  const [form, setForm] = useState({ name: String(customer?.name || ""), contact: String(customer?.contact || ""), destination: String(customer?.destination || "") }); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!form.name.trim()) return setError("Customer Name is required."); if (!form.contact.trim()) return setError("Customer Phone is required."); if (!form.destination.trim()) return setError("Customer Address / Destination is required."); await onSave({ action: customer ? "update-customer" : "create-customer", customerId: customer?.id, ...form }); };
  return <Modal title={customer ? "Edit Customer" : "Add New Customer"} subtitle="Customer master data is available throughout production and dispatch." onClose={onClose}><form onSubmit={submit}><div className="form-grid"><Field label="Customer Name *" span><input value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(""); }} /></Field><Field label="Phone Number *"><input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field><Field label="Address / Destination *"><input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></Field></div>{error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />} {customer ? "Save Customer" : "Add Customer"}</button></div></form></Modal>;
}

function DeleteGatepassModal({ gatepass, onClose, onSave, saving }: { gatepass: Row; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  return <Modal title={`Delete ${String(gatepass.gatepass_no)}`} subtitle={`${String(gatepass.design_no)} / ${String(gatepass.lot_no)} · ${fmt(gatepass.quantity)} PCS`} onClose={onClose}>
    <div className="delete-warning"><AlertTriangle /><div><h3>Remove this gate pass?</h3><p>The gate pass and its expected Warehouse receipt are deleted, and the lot goes back to Packing so it can be sent again. A gate pass already received into stock cannot be removed.</p></div></div>
    <div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button danger" disabled={saving} onClick={() => void onSave({ action: "delete-gatepass", gatepassId: gatepass.id })}>{saving && <LoaderCircle className="spin" size={16} />} Delete Gate Pass</button></div>
  </Modal>;
}

function DeleteLotModal({ lot, state, onClose, onSave, saving }: { lot: Row; state: FactoryState; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  const linked = [
    { label: "Department records", count: departmentPages.filter((department) => (state.records[department] || []).some((row) => number(row.lot_id) === number(lot.id))).length },
    { label: "Transfers", count: state.transfers.filter((row) => number(row.lot_id) === number(lot.id)).length },
    { label: "Gate passes", count: state.gatepasses.filter((row) => number(row.lot_id) === number(lot.id)).length },
    { label: "Warehouse receipts", count: state.receipts.filter((row) => number(row.lot_id) === number(lot.id)).length },
    { label: "Customer dispatches", count: state.dispatches.filter((row) => number(row.lot_id) === number(lot.id)).length },
    { label: "Shop shipments", count: state.shopShipments.filter((row) => number(row.lot_id) === number(lot.id)).length },
    { label: "History & remarks", count: state.history.filter((row) => number(row.lot_id) === number(lot.id)).length + state.remarks.filter((row) => number(row.lot_id) === number(lot.id)).length },
  ].filter((item) => item.count > 0);
  return <Modal title={`Delete ${String(lot.lot_no)}`} subtitle={`${String(lot.design_no)} · ${fmt(lot.quantity)} PCS · ${String(lot.customer)}`} onClose={onClose}>
    <div className="delete-warning"><AlertTriangle /><div><h3>Delete this lot and everything attached to it?</h3><p>This cannot be undone. The audit log keeps a record that the lot was deleted, but the lot itself and the records below are removed permanently.</p></div></div>
    {linked.length > 0 && <div className="delete-list">{linked.map((item) => <span key={item.label}><b>{item.count}</b>{item.label}</span>)}</div>}
    <div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button danger" disabled={saving} onClick={() => void onSave({ action: "delete-lot", lotId: lot.id })}>{saving && <LoaderCircle className="spin" size={16} />} Delete Lot</button></div>
  </Modal>;
}

function DeleteCustomerModal({ customer, onClose, onSave, saving }: { customer: Row; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  return <Modal title="Delete Customer" subtitle={String(customer.name)} onClose={onClose}><div className="delete-warning"><AlertTriangle /><div><h3>Delete this customer record?</h3><p>This action is blocked automatically if the customer has linked production lots.</p></div></div><div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button danger" disabled={saving} onClick={() => void onSave({ action: "delete-customer", customerId: customer.id })}>{saving && <LoaderCircle className="spin" size={16} />} Delete Customer</button></div></Modal>;
}

function EmployeeModal({ employee, onClose, onSave, saving }: { employee?: Row; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  const [form, setForm] = useState({ employeeCode: String(employee?.employee_code || ""), name: String(employee?.name || ""), fatherName: String(employee?.father_name || ""), cnic: String(employee?.cnic || ""), phone: String(employee?.phone || ""), address: String(employee?.address || ""), department: String(employee?.department || "Stitching"), designation: String(employee?.designation || "Operator"), joiningDate: String(employee?.joining_date || today), salaryType: String(employee?.salary_type || "Monthly"), monthlySalary: String(employee?.monthly_salary || ""), ratePerPiece: String(employee?.rate_per_piece || ""), status: String(employee?.status || "Active"), remarks: String(employee?.remarks || "") });
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string) => { setForm((current) => ({ ...current, [key]: value })); setError(""); };
  const theka = form.salaryType === "Theka";
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return setError("Employee Name is required.");
    if (!form.designation.trim()) return setError("Designation is required.");
    if (!form.phone.trim()) return setError("Phone Number is required.");
    if (!form.joiningDate) return setError("Joining Date is required.");
    if (!theka && number(form.monthlySalary) <= 0) return setError("Monthly Salary must be greater than zero.");
    await onSave({ action: "save-employee", employeeId: employee?.id, ...form, monthlySalary: number(form.monthlySalary) });
  };
  return <Modal title={employee ? `Edit ${String(employee.name)}` : "Add New Employee"} subtitle="Employees can be paid a monthly salary or on theka — a rate for every piece completed." onClose={onClose} wide><form onSubmit={submit}>
    <div className="form-grid three">
      <Field label="Employee Code"><input placeholder="Auto-generated" value={form.employeeCode} onChange={(e) => set("employeeCode", e.target.value.toUpperCase())} disabled={Boolean(employee)} /></Field>
      <Field label="Employee Name *"><input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
      <Field label="Father Name"><input value={form.fatherName} onChange={(e) => set("fatherName", e.target.value)} /></Field>
      <Field label="Phone Number *"><div className="input-icon"><Phone size={16} /><input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div></Field>
      <Field label="CNIC"><input placeholder="35202-1234567-1" value={form.cnic} onChange={(e) => set("cnic", e.target.value)} /></Field>
      <Field label="Joining Date *"><input type="date" value={form.joiningDate} onChange={(e) => set("joiningDate", e.target.value)} /></Field>
      <Field label="Department *"><select value={form.department} onChange={(e) => set("department", e.target.value)}>{employeeDepartments.map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Designation *"><input list="designations" value={form.designation} onChange={(e) => set("designation", e.target.value)} /><datalist id="designations">{["Manager", "Supervisor", "Line Manager", "Operator", "Stitching Operator", "Cutting Operator", "Helper", "Quality Checker", "Packer", "Security"].map((item) => <option key={item} value={item} />)}</datalist></Field>
      <Field label="Status"><select value={form.status} onChange={(e) => set("status", e.target.value)}>{["Active", "On Leave", "Inactive"].map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Address" span><div className="input-icon"><MapPin size={16} /><input value={form.address} onChange={(e) => set("address", e.target.value)} /></div></Field>
    </div>
    <div className="salary-mode">
      <div><span className="eyebrow">SALARY BASIS</span><p>Choose how this employee is paid. Only pick the basis here — theka rates are set per item when you enter the piece work.</p></div>
      <div className="mode-toggle">{["Monthly", "Theka"].map((item) => <button key={item} type="button" className={cx(form.salaryType === item && "active")} onClick={() => set("salaryType", item)}>{item === "Monthly" ? <Wallet size={15} /> : <Banknote size={15} />}{item === "Monthly" ? "Monthly Salary" : "Theka (per piece)"}</button>)}</div>
      <div className="form-grid">{theka
        ? <div className="theka-hint field-span"><Banknote size={18} /><span>No rate is stored on a theka employee. In <b>Salary → Theka / Piece-Rate Salary</b> you enter each job as <b>item name + PCS quantity × per-piece rate</b>, so the same worker can run several items at different rates in one month. Their monthly total is the sum of those entries, less any advance.</span></div>
        : <Field label="Monthly Salary (Rs) *"><input type="number" min="0" step="500" placeholder="55000" value={form.monthlySalary} onChange={(e) => set("monthlySalary", e.target.value)} /><small className="field-note">Paid per attended day at salary ÷ days in that month ({daysInPeriod(currentPeriod)} in {currentPeriod}) = {money(number(form.monthlySalary) / daysInPeriod(currentPeriod))} per day.</small></Field>}
        <Field label="Remarks"><input value={form.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field>
      </div>
    </div>
    {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />} {employee ? "Save Employee" : "Add Employee"}</button></div>
  </form></Modal>;
}

function DeleteEmployeeModal({ employee, onClose, onSave, saving }: { employee: Row; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  return <Modal title="Delete Employee" subtitle={`${String(employee.name)} · ${String(employee.employee_code)}`} onClose={onClose}>
    <div className="delete-warning"><AlertTriangle /><div><h3>Remove this employee record?</h3><p>The attendance and salary history for {String(employee.name)} is deleted with the record. The action is written to Audit Logs and cannot be undone.</p></div></div>
    <div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button danger" disabled={saving} onClick={() => void onSave({ action: "delete-employee", employeeId: employee.id })}>{saving && <LoaderCircle className="spin" size={16} />} Delete Employee</button></div>
  </Modal>;
}

function AttendanceModal({ record, state, onClose, onSave, saving }: { record?: Row; state: FactoryState; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  const active = state.employees.filter((item) => item.status === "Active");
  const [form, setForm] = useState({ employeeId: String(record?.employee_id || active[0]?.id || ""), attendanceDate: String(record?.attendance_date || today), status: String(record?.status || "Present"), inTime: String(record?.in_time || "09:00"), outTime: String(record?.out_time || "18:00"), overtimeHours: String(record?.overtime_hours || 0), piecesDone: String(record?.pieces_done || 0), lotNo: String(record?.lot_no || ""), remarks: String(record?.remarks || "") });
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string) => { setForm((current) => ({ ...current, [key]: value })); setError(""); };
  const employee = state.employees.find((item) => number(item.id) === number(form.employeeId));
  const theka = String(employee?.salary_type) === "Theka";
  const earned = theka ? number(form.piecesDone) * number(employee?.rate_per_piece) : 0;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.employeeId) return setError("Choose an employee.");
    if (!form.attendanceDate) return setError("Attendance Date is required.");
    if (number(form.piecesDone) < 0) return setError("Pieces Done cannot be negative.");
    if (number(form.overtimeHours) < 0 || number(form.overtimeHours) > 12) return setError("Overtime Hours must be between 0 and 12.");
    if (theka && form.status === "Present" && number(form.piecesDone) <= 0) return setError("Enter the pieces completed for this theka employee.");
    await onSave({ action: "save-attendance", ...form, employeeId: number(form.employeeId), piecesDone: number(form.piecesDone), overtimeHours: number(form.overtimeHours) });
  };
  return <Modal title="Attendance Entry" subtitle="One record per employee per day — saving again updates the same day." onClose={onClose} wide><form onSubmit={submit}>
    <div className="form-grid three">
      <Field label="Employee *"><select value={form.employeeId} onChange={(e) => set("employeeId", e.target.value)}>{active.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)} · {String(item.employee_code)}</option>)}</select></Field>
      <Field label="Attendance Date *"><input type="date" value={form.attendanceDate} onChange={(e) => set("attendanceDate", e.target.value)} /></Field>
      <Field label="Status *"><select value={form.status} onChange={(e) => set("status", e.target.value)}>{attendanceStatuses.map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="In Time"><div className="input-icon"><Clock size={16} /><input type="time" value={form.inTime} onChange={(e) => set("inTime", e.target.value)} /></div></Field>
      <Field label="Out Time"><div className="input-icon"><Clock size={16} /><input type="time" value={form.outTime} onChange={(e) => set("outTime", e.target.value)} /></div></Field>
      <Field label="Overtime Hours"><input type="number" min="0" max="12" step="0.5" value={form.overtimeHours} onChange={(e) => set("overtimeHours", e.target.value)} /></Field>
      <Field label={`Pieces Done ${theka ? "*" : ""}`}><input type="number" min="0" value={form.piecesDone} onChange={(e) => set("piecesDone", e.target.value)} disabled={!theka} /></Field>
      <Field label="Lot No."><input list="attendance-lots" placeholder="LOT-00001" value={form.lotNo} onChange={(e) => set("lotNo", e.target.value.toUpperCase())} /><datalist id="attendance-lots">{state.lots.map((item) => <option key={String(item.id)} value={String(item.lot_no)} />)}</datalist></Field>
      <Field label="Remarks"><input value={form.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field>
    </div>
    {theka && <div className="confirm-copy"><Banknote size={18} /><span>{String(employee?.name)} is a theka employee at <b>{money(employee?.rate_per_piece)}</b> per piece. Today&apos;s entry earns <b>{money(earned)}</b> and rolls into the monthly salary calculation.</span></div>}
    {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />} Save Attendance</button></div>
  </form></Modal>;
}

function PurchaseModal({ record, state, onClose, onSave, saving }: { record?: Row; state: FactoryState; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  const [form, setForm] = useState({
    supplier: String(record?.supplier || ""), supplierContact: "", purchaseDate: String(record?.purchase_date || today),
    item: String(record?.item || ""), category: String(record?.category || "Fabric"), quantity: String(record?.quantity ?? ""),
    unit: String(record?.unit || "Meters"), rate: String(record?.rate ?? ""), paidAmount: String(record?.paid_amount ?? 0),
    paymentMethod: String(record?.payment_method || "Cash"), status: String(record?.status || "Ordered"),
    invoiceNo: String(record?.invoice_no || ""), receivedDate: String(record?.received_date || ""), remarks: String(record?.remarks || ""),
  });
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string) => { setForm((current) => ({ ...current, [key]: value })); setError(""); };
  const total = round2(number(form.quantity) * number(form.rate));
  const balance = round2(Math.max(0, total - number(form.paidAmount)));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.supplier.trim()) return setError("Supplier is required.");
    if (!form.item.trim()) return setError("Item is required.");
    if (number(form.quantity) <= 0) return setError("Quantity must be greater than zero.");
    if (number(form.rate) <= 0) return setError("Rate must be greater than zero.");
    if (number(form.paidAmount) > total) return setError(`Paid Amount cannot exceed the total of ${money(total)}.`);
    await onSave({ action: "save-purchase", purchaseId: record?.id, ...form, quantity: number(form.quantity), rate: number(form.rate), paidAmount: number(form.paidAmount) });
  };
  return <Modal title={record ? `Edit ${String(record.purchase_no)}` : "New Purchase Order"} subtitle="Raw material and accessory purchases with supplier payment tracking." onClose={onClose} wide><form onSubmit={submit}>
    <div className="form-grid three">
      <Field label="Supplier *"><input list="suppliers" value={form.supplier} onChange={(event) => set("supplier", event.target.value)} /><datalist id="suppliers">{state.suppliers.map((item) => <option key={String(item.id)} value={String(item.name)} />)}</datalist></Field>
      <Field label="Purchase Date *"><input type="date" value={form.purchaseDate} onChange={(event) => set("purchaseDate", event.target.value)} /></Field>
      <Field label="Supplier Invoice No."><input value={form.invoiceNo} onChange={(event) => set("invoiceNo", event.target.value)} /></Field>
      <Field label="Item *" span><input placeholder="e.g. Cotton Lawn greige" value={form.item} onChange={(event) => set("item", event.target.value)} /></Field>
      <Field label="Category"><select value={form.category} onChange={(event) => set("category", event.target.value)}>{["Fabric", "Accessories", "Trims", "Packaging", "Machinery", "Other"].map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Quantity *"><input type="number" min="0" step="0.01" value={form.quantity} onChange={(event) => set("quantity", event.target.value)} /></Field>
      <Field label="Unit"><select value={form.unit} onChange={(event) => set("unit", event.target.value)}>{["Meters", "Yards", "Pieces", "Kg", "Rolls", "Cartons"].map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Rate (Rs) *"><input type="number" min="0" step="0.01" value={form.rate} onChange={(event) => set("rate", event.target.value)} /></Field>
      <Field label="Paid Amount (Rs)"><input type="number" min="0" value={form.paidAmount} onChange={(event) => set("paidAmount", event.target.value)} /></Field>
      <Field label="Payment Method"><select value={form.paymentMethod} onChange={(event) => set("paymentMethod", event.target.value)}>{["Cash", "Bank", "Cheque", "Credit"].map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Status"><select value={form.status} onChange={(event) => set("status", event.target.value)}>{["Ordered", "In Transit", "Received", "Partially Paid", "Paid", "Cancelled"].map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Received Date"><input type="date" value={form.receivedDate} onChange={(event) => set("receivedDate", event.target.value)} /></Field>
      <Field label="Remarks" span><input value={form.remarks} onChange={(event) => set("remarks", event.target.value)} /></Field>
    </div>
    <div className="production-summary"><span><small>QUANTITY × RATE</small><b>{money(total)}</b></span><span><small>PAID</small><b className="green-text">{money(number(form.paidAmount))}</b></span><span><small>BALANCE DUE</small><b className={balance > 0 ? "red-text" : "green-text"}>{money(balance)}</b></span><span><small>METHOD</small><b>{form.paymentMethod}</b></span></div>
    {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />} {record ? "Save Purchase" : "Add Purchase"}</button></div>
  </form></Modal>;
}

function ShopModal({ record, onClose, onSave, saving }: { record?: Row; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  const [form, setForm] = useState({
    shopCode: String(record?.shop_code || ""), name: String(record?.name || ""), address: String(record?.address || ""),
    phone: String(record?.phone || ""), manager: String(record?.manager || ""), logoUrl: String(record?.logo_url || ""),
    invoicePrefix: String(record?.invoice_prefix || "INV"), footerNote: String(record?.footer_note || "Thank you for shopping with us."),
    openingCash: String(record?.opening_cash ?? 0), openingDate: String(record?.opening_date || today), status: String(record?.status || "Active"),
  });
  const [error, setError] = useState("");
  const logoInput = useRef<HTMLInputElement | null>(null);
  const set = (key: keyof typeof form, value: string) => { setForm((current) => ({ ...current, [key]: value })); setError(""); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return setError("Shop Name is required.");
    if (!form.address.trim()) return setError("Shop Address is required.");
    if (!form.phone.trim()) return setError("Shop Phone is required.");
    if (!form.manager.trim()) return setError("Shop Manager is required.");
    await onSave({ action: "save-shop", shopId: record?.id, ...form, openingCash: number(form.openingCash) });
  };
  return <Modal title={record ? `Edit ${String(record.name)}` : "Create Shop"} subtitle="Each shop runs its own point-of-sale, stock, expenses and day close." onClose={onClose} wide><form onSubmit={submit}>
    <div className="form-grid three">
      <Field label="Shop Code"><input placeholder="Auto-generated" value={form.shopCode} onChange={(event) => set("shopCode", event.target.value.toUpperCase())} disabled={Boolean(record)} /></Field>
      <Field label="Shop Name *"><input placeholder="e.g. MS Boutique — Gulberg" value={form.name} onChange={(event) => set("name", event.target.value)} /></Field>
      <Field label="Phone *"><div className="input-icon"><Phone size={16} /><input value={form.phone} onChange={(event) => set("phone", event.target.value)} /></div></Field>
      <Field label="Address *" span><div className="input-icon"><MapPin size={16} /><input value={form.address} onChange={(event) => set("address", event.target.value)} /></div></Field>
      <Field label="Shop Manager *"><input value={form.manager} onChange={(event) => set("manager", event.target.value)} /></Field>
      <Field label="Invoice Prefix"><input value={form.invoicePrefix} onChange={(event) => set("invoicePrefix", event.target.value.toUpperCase())} /></Field>
      <Field label="Opening Cash (Rs)"><input type="number" min="0" value={form.openingCash} onChange={(event) => set("openingCash", event.target.value)} /></Field>
      <Field label="Opening Date"><input type="date" value={form.openingDate} onChange={(event) => set("openingDate", event.target.value)} disabled={Boolean(record)} /></Field>
      <Field label="Status"><select value={form.status} onChange={(event) => set("status", event.target.value)}><option>Active</option><option>Closed</option></select></Field>
      <Field label="Invoice Footer Note" span><input value={form.footerNote} onChange={(event) => set("footerNote", event.target.value)} /></Field>
      <Field label="Shop Logo" span>
        <div className="logo-upload">
          <div className="shop-logo-preview">{form.logoUrl ? <img src={form.logoUrl} alt="Shop logo preview" /> : <span className="logo-mark">{(form.shopCode || "SH").slice(-2)}</span>}</div>
          <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden onChange={(event) => { readLogoFile(event.target.files?.[0], (url) => set("logoUrl", url), setError); event.target.value = ""; }} />
          <button type="button" className="button secondary" onClick={() => logoInput.current?.click()}><Upload size={15} /> Upload from computer</button>
          {form.logoUrl && <button type="button" className="button danger small" onClick={() => set("logoUrl", "")}><Trash2 size={14} /> Remove</button>}
          <small>PNG, JPG, WEBP, GIF or SVG up to 400 KB. Printed on this shop&apos;s invoices.</small>
        </div>
      </Field>
    </div>
    {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
    <div className="confirm-copy"><Store size={18} /><span>Once saved, use <b>Open POS</b> on the shop card to launch its billing counter in a new browser tab.</span></div>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />} {record ? "Save Shop" : "Create Shop"}</button></div>
  </form></Modal>;
}

function ShipToShopModal({ state, onClose, onSave, saving }: { state: FactoryState; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  const stock = state.warehouse.filter((row) => number(row.balance_qty) > 0);
  const [form, setForm] = useState({ shopId: String(state.shops[0]?.id || ""), lotId: String(stock[0]?.lot_id || ""), quantity: "", saleRate: "", cartons: "", productName: "", sentDate: today, remarks: "" });
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string) => { setForm((current) => ({ ...current, [key]: value })); setError(""); };
  const selected = stock.find((row) => number(row.lot_id) === number(form.lotId));
  const available = number(selected?.balance_qty);
  const shop = state.shops.find((row) => number(row.id) === number(form.shopId));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.shopId) return setError("Choose a shop.");
    if (!form.lotId) return setError("Choose a warehouse lot.");
    if (number(form.quantity) <= 0) return setError("Shipment QTY must be greater than zero.");
    if (number(form.quantity) > available) return setError(`Only ${fmt(available)} PCS are available in the warehouse for this lot.`);
    if (number(form.saleRate) <= 0) return setError("Shop Sale Rate must be greater than zero.");
    await onSave({ action: "ship-to-shop", ...form, shopId: number(form.shopId), lotId: number(form.lotId), quantity: number(form.quantity), saleRate: number(form.saleRate), cartons: number(form.cartons) });
  };
  return <Modal title="Ship Stock to Shop" subtitle="Warehouse to shop transfer; the shop confirms receivable and non-receivable pieces." onClose={onClose} wide><form onSubmit={submit}>
    <div className="transfer-route"><span>{departmentIcon("Warehouse")}<b>Warehouse</b></span><ArrowRight /><span><Truck size={15} /><b>In Transit</b></span><ArrowRight /><span><Store size={15} /><b>{String(shop?.name || "Shop")}</b></span></div>
    <div className="form-grid three">
      <Field label="Shop *"><select value={form.shopId} onChange={(event) => set("shopId", event.target.value)}><option value="">Select shop…</option>{state.shops.filter((row) => row.status === "Active").map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.name)} · {String(row.shop_code)}</option>)}</select></Field>
      <Field label="Warehouse Lot *"><select value={form.lotId} onChange={(event) => set("lotId", event.target.value)}><option value="">Select lot…</option>{stock.map((row) => <option key={String(row.id)} value={String(row.lot_id)}>{String(row.design_no)} · {String(row.lot_no)} · {fmt(row.balance_qty)} PCS</option>)}</select></Field>
      <Field label="Available in Warehouse"><input value={`${fmt(available)} PCS`} disabled /></Field>
      <Field label="Product Name for the shop"><input placeholder={selected ? `${String(selected.design_no)} ${String(selected.fabrication)}` : "e.g. MS-1005 Cotton"} value={form.productName} onChange={(event) => set("productName", event.target.value)} /></Field>
      <Field label="Shipment QTY *"><input type="number" min="1" max={available || undefined} value={form.quantity} onChange={(event) => set("quantity", event.target.value)} /></Field>
      <Field label="Shop Sale Rate (Rs) *"><input type="number" min="0" step="0.01" placeholder="3450" value={form.saleRate} onChange={(event) => set("saleRate", event.target.value)} /></Field>
      <Field label="Cartons"><input type="number" min="0" value={form.cartons} onChange={(event) => set("cartons", event.target.value)} /></Field>
      <Field label="Sent Date"><input type="date" value={form.sentDate} onChange={(event) => set("sentDate", event.target.value)} /></Field>
      <Field label="Remarks"><input value={form.remarks} onChange={(event) => set("remarks", event.target.value)} /></Field>
    </div>
    {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
    <div className="confirm-copy"><Truck size={18} /><span>The shipment shows as <b>In Transit</b> until the shop confirms it. The shop records receivable and non-receivable pieces, and you are alerted either way.</span></div>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving || !stock.length}>{saving && <LoaderCircle className="spin" size={16} />} Ship to Shop <Truck size={16} /></button></div>
  </form></Modal>;
}

function AdvanceModal({ state, onClose, onSave, saving }: { state: FactoryState; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  const active = state.employees.filter((item) => item.status === "Active");
  const [form, setForm] = useState({ employeeId: String(active[0]?.id || ""), advanceDate: today, amount: "", remarks: "" });
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string) => { setForm((current) => ({ ...current, [key]: value })); setError(""); };
  const employee = state.employees.find((item) => number(item.id) === number(form.employeeId));
  const period = form.advanceDate.slice(0, 7);
  const already = state.advances.filter((item) => number(item.employee_id) === number(form.employeeId) && String(item.period) === period).reduce((sum, item) => sum + number(item.amount), 0);
  const salary = state.salaries.find((item) => number(item.employee_id) === number(form.employeeId) && String(item.period) === period);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.employeeId) return setError("Choose a staff member.");
    if (number(form.amount) <= 0) return setError("Advance Amount must be greater than zero.");
    await onSave({ action: "save-advance", ...form, employeeId: number(form.employeeId), amount: number(form.amount) });
  };
  return <Modal title="Add Salary Advance" subtitle="Advances are deducted from that month's net payable for monthly and theka staff alike." onClose={onClose}><form onSubmit={submit}>
    <div className="form-grid">
      <Field label="Staff Member *" span><select value={form.employeeId} onChange={(e) => set("employeeId", e.target.value)}>{active.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)} · {String(item.employee_code)} · {String(item.salary_type)}</option>)}</select></Field>
      <Field label="Advance Date *"><input type="date" value={form.advanceDate} onChange={(e) => set("advanceDate", e.target.value)} /></Field>
      <Field label="Advance Amount (Rs) *"><input type="number" min="0" placeholder="5000" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></Field>
      <Field label="Remarks" span><input placeholder="e.g. Eid advance" value={form.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field>
    </div>
    <div className="production-summary"><span><small>PERIOD</small><b>{period}</b></span><span><small>ALREADY ADVANCED</small><b className="red-text">{money(already)}</b></span><span><small>THIS ADVANCE</small><b className="red-text">{money(number(form.amount))}</b></span><span><small>NET AFTER DEDUCTION</small><b className="green-text">{money(Math.max(0, number(salary?.net_payable) - number(form.amount)))}</b></span></div>
    {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
    <div className="confirm-copy"><Banknote size={18} /><span>{employee ? `${String(employee.name)}'s ${period} salary is recalculated straight away — unless that month is already marked Paid.` : "Choose a staff member to record the advance."}</span></div>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />} Add Advance</button></div>
  </form></Modal>;
}

function SalaryModal({ record, state, onClose, onSave, saving }: { record?: Row; state: FactoryState; onClose: () => void; onSave: PageProps["post"]; saving: boolean }) {
  const active = state.employees.filter((item) => item.status === "Active");
  const [form, setForm] = useState({ employeeId: String(record?.employee_id || active[0]?.id || ""), period: String(record?.period || currentPeriod), presentDays: String(record?.present_days ?? ""), absentDays: String(record?.absent_days ?? ""), totalPieces: String(record?.total_pieces ?? ""), ratePerPiece: String(record?.rate_per_piece ?? ""), overtimeAmount: String(record?.overtime_amount ?? 0), bonus: String(record?.bonus ?? 0), advance: String(record?.advance ?? 0), deduction: String(record?.deduction ?? 0), paymentStatus: String(record?.payment_status || "Unpaid"), paidDate: String(record?.paid_date || today), remarks: String(record?.remarks || "") });
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string) => { setForm((current) => ({ ...current, [key]: value })); setError(""); };
  const employee = state.employees.find((item) => number(item.id) === number(form.employeeId));
  const theka = String(employee?.salary_type) === "Theka";
  const monthDays = daysInPeriod(form.period);
  const perDay = number(employee?.monthly_salary) / monthDays;

  // Attendance and piece-work already recorded for the chosen month are the source of truth.
  const summary = useMemo(() => {
    const rows = state.attendance.filter((item) => number(item.employee_id) === number(form.employeeId) && String(item.attendance_date).startsWith(form.period));
    const work = state.pieceWork.filter((item) => number(item.employee_id) === number(form.employeeId) && String(item.period) === form.period);
    const pieces = work.reduce((sum, item) => sum + number(item.pcs_qty), 0);
    const amount = work.reduce((sum, item) => sum + number(item.total_amount), 0);
    return { present: rows.filter((item) => /Present|Overtime/.test(String(item.status))).length + rows.filter((item) => item.status === "Half Day").length * 0.5, absent: rows.filter((item) => item.status === "Absent").length, pieces, amount, entries: work.length, marked: rows.length, rate: pieces ? amount / pieces : 0 };
  }, [state.attendance, state.pieceWork, form.employeeId, form.period]);

  const rate = number(form.ratePerPiece) || summary.rate;
  const applyAttendance = () => setForm((current) => ({ ...current, presentDays: String(Math.round(summary.present)), absentDays: String(summary.absent), totalPieces: String(summary.pieces), ratePerPiece: String(round2(summary.rate)) }));
  const base = theka ? round2(number(form.totalPieces) * rate) : round2(perDay * Math.min(monthDays, number(form.presentDays) || monthDays));
  const net = base + number(form.overtimeAmount) + number(form.bonus) - number(form.advance) - number(form.deduction);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.employeeId) return setError("Choose an employee.");
    if (!/^\d{4}-\d{2}$/.test(form.period)) return setError("Salary Period must be a month such as 2026-08.");
    if (theka && number(form.totalPieces) <= 0) return setError("Total pieces are required for a theka salary.");
    if (net < 0) return setError("Advance and deductions cannot exceed the earned amount.");
    await onSave({ action: "save-salary", ...form, employeeId: number(form.employeeId), presentDays: number(form.presentDays), absentDays: number(form.absentDays), totalPieces: number(form.totalPieces), ratePerPiece: rate, overtimeAmount: number(form.overtimeAmount), bonus: number(form.bonus), advance: number(form.advance), deduction: number(form.deduction) });
  };
  return <Modal title={record ? "Edit Salary Record" : "Calculate Salary"} subtitle="Monthly staff are paid on attended days; theka staff on pieces completed." onClose={onClose} wide><form onSubmit={submit}>
    <div className="form-grid three">
      <Field label="Employee *"><select value={form.employeeId} onChange={(e) => set("employeeId", e.target.value)} disabled={Boolean(record)}>{active.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)} · {String(item.salary_type)}</option>)}</select></Field>
      <Field label="Salary Period *"><input type="month" value={form.period} onChange={(e) => set("period", e.target.value)} disabled={Boolean(record)} /></Field>
      <Field label="Salary Basis"><input value={theka ? `Theka · paid per item entry` : `Monthly · ${money(employee?.monthly_salary)} ÷ ${monthDays} days = ${money(round2(perDay))}/day`} disabled /></Field>
    </div>
    <div className="attendance-pull"><div><span className="eyebrow">FROM ATTENDANCE &amp; PIECE WORK — KEPT IN SYNC AUTOMATICALLY</span><p>{summary.marked} day{summary.marked === 1 ? "" : "s"} marked in {form.period} · {Math.round(summary.present)} present · {summary.absent} absent · {summary.entries} piece-work entr{summary.entries === 1 ? "y" : "ies"} · {fmt(summary.pieces)} PCS worth {money(summary.amount)}. These refresh on every mark or entry until this salary is marked Paid.</p></div><button type="button" className="button secondary" onClick={applyAttendance} disabled={!summary.marked && !summary.entries}><CalendarCheck size={15} /> Use recorded work</button></div>
    <div className="form-grid three">
      <Field label="Present Days"><input type="number" min="0" max="31" value={form.presentDays} onChange={(e) => set("presentDays", e.target.value)} disabled={theka} /></Field>
      <Field label="Absent Days"><input type="number" min="0" max="31" value={form.absentDays} onChange={(e) => set("absentDays", e.target.value)} disabled={theka} /></Field>
      <Field label={`Total Pieces ${theka ? "*" : ""}`}><input type="number" min="0" value={form.totalPieces} onChange={(e) => set("totalPieces", e.target.value)} disabled={!theka} /></Field>
      {theka && <Field label="Per Piece Rate (Rs)"><input type="number" min="0" step="0.25" placeholder={String(round2(summary.rate) || "26.50")} value={form.ratePerPiece} onChange={(e) => set("ratePerPiece", e.target.value)} /></Field>}
      <Field label="Overtime Amount (Rs)"><input type="number" min="0" value={form.overtimeAmount} onChange={(e) => set("overtimeAmount", e.target.value)} /></Field>
      <Field label="Bonus (Rs)"><input type="number" min="0" value={form.bonus} onChange={(e) => set("bonus", e.target.value)} /></Field>
      <Field label="Advance Taken (Rs)"><input type="number" min="0" value={form.advance} onChange={(e) => set("advance", e.target.value)} /></Field>
      <Field label="Other Deduction (Rs)"><input type="number" min="0" value={form.deduction} onChange={(e) => set("deduction", e.target.value)} /></Field>
      <Field label="Payment Status"><select value={form.paymentStatus} onChange={(e) => set("paymentStatus", e.target.value)}><option>Unpaid</option><option>Paid</option></select></Field>
      <Field label="Paid Date"><input type="date" value={form.paidDate} onChange={(e) => set("paidDate", e.target.value)} disabled={form.paymentStatus !== "Paid"} /></Field>
      <Field label="Remarks" span><input value={form.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field>
    </div>
    <div className="production-summary"><span><small>{theka ? "PIECES × RATE" : `BASE (${form.presentDays || monthDays} × ${money(round2(perDay))})`}</small><b>{money(base)}</b></span><span><small>ADDITIONS</small><b className="green-text">{money(number(form.overtimeAmount) + number(form.bonus))}</b></span><span><small>DEDUCTIONS</small><b className="red-text">{money(number(form.advance) + number(form.deduction))}</b></span><span><small>NET PAYABLE</small><b className={net < 0 ? "red-text" : "green-text"}>{money(net)}</b></span></div>
    {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />} <Save size={16} /> Save Salary</button></div>
  </form></Modal>;
}

function DispatchDetailModal({ dispatch, settings, onClose }: { dispatch: Row; settings: Row; onClose: () => void }) {
  const print = () => printGatepass(dispatch, settings);
  return <Modal title={`Dispatch ${String(dispatch.dispatch_no)}`} subtitle="Full customer dispatch details and printable gatepass" onClose={onClose} wide><section className="dispatch-document"><header><div className="document-brand">{settings.logo_url ? <img src={String(settings.logo_url)} alt="Company logo" /> : <span className="logo-mark">MS</span>}<div><h2>{String(settings.company_name || "MS Boutique")}</h2><p>{String(settings.address || "Factory address")}</p><small>{String(settings.phone || "")} {settings.website ? `· ${String(settings.website)}` : ""}</small></div></div><div className="document-type"><span>GATE PASS</span><b>{String(dispatch.dispatch_no)}</b><small>{formatDate(dispatch.dispatch_date)}</small></div></header><div className="document-meta"><span><small>INVOICE NO.</small><b>{String(dispatch.invoice_no)}</b></span><span><small>DELIVERY CHALLAN</small><b>{String(dispatch.challan_no)}</b></span><span><small>TRACKING / REFERENCE</small><b>{String(dispatch.tracking_no || "—")}</b></span><span><small>DISPATCH STATUS</small><StatusBadge status={dispatch.dispatch_status} /></span></div><div className="document-parties"><div><span className="eyebrow">DISPATCH TO</span><h3>{String(dispatch.customer)}</h3><p>{String(dispatch.destination)}</p></div><div><span className="eyebrow">TRANSPORT DETAILS</span><h3>{String(dispatch.transporter || "Self arranged")}</h3><p>{String(dispatch.vehicle_no || "No vehicle")} · {String(dispatch.driver_name || "No driver")}</p><small>{String(dispatch.driver_contact || "")}</small></div></div><div className="table-scroll"><table className="invoice-table"><thead><tr><th>Lot No.</th><th>Design No.</th><th>Fabrication</th><th>Size Range</th><th>Dispatch QTY</th><th>Cartons</th></tr></thead><tbody><tr><td>{String(dispatch.lot_no)}</td><td><b>{String(dispatch.design_no)}</b></td><td>{String(dispatch.fabrication)}</td><td>{String(dispatch.size_range)}</td><td><b>{fmt(dispatch.dispatch_qty)} PCS</b></td><td>{fmt(dispatch.carton_qty)}</td></tr></tbody></table></div><div className="document-remarks"><span>REMARKS</span><p>{String(dispatch.remarks || "Finished goods counted, sealed and released from Warehouse.")}</p></div><div className="document-signatures"><span>Prepared By<strong>Ayesha Khan</strong></span><span>Warehouse Approval<strong>________________</strong></span><span>Driver Signature<strong>________________</strong></span><span>Gate Security<strong>________________</strong></span></div></section><div className="modal-actions"><button className="button secondary" onClick={onClose}>Close</button><button className="button secondary" onClick={print}><FileText size={16} /> Save as PDF</button><button className="button primary" onClick={print}><Printer size={16} /> Print Gatepass</button></div></Modal>;
}

function LotDetail({ lot, state, onClose, setModal }: { lot: Row; state: FactoryState; onClose: () => void; setModal: PageProps["setModal"] }) {
  const current = workflow.indexOf(String(lot.current_department)); const lotHistory = state.history.filter((item) => number(item.lot_id) === number(lot.id)); const remarks = state.remarks.filter((item) => number(item.lot_id) === number(lot.id)); const sizes = state.sizes.filter((item) => number(item.lot_id) === number(lot.id));
  return <Modal title={`${String(lot.design_no)} / ${String(lot.lot_no)}`} subtitle={`${String(lot.fabrication)} · ${fmt(lot.quantity)} PCS · ${String(lot.customer)}`} onClose={onClose} wide><div className="detail-top"><div><span className="eyebrow">OVERALL LOT PROGRESS</span><b>{Math.round(lotProgress(lot))}%</b></div><Progress value={lotProgress(lot)} /><StatusBadge status={lot.status} /></div><div className="workflow-track">{workflow.map((item, index) => { const held = index === current && /Hold|Rework/i.test(String(lot.status)); const cls = held ? "error" : index < current ? "done" : index === current ? /Partial/i.test(String(lot.status)) ? "partial" : "current" : "pending"; return <div className={cls} key={item}><span>{index < current ? <Check size={17} /> : index === current ? departmentIcon(item) : <Circle size={13} />}</span><b>{item === "Customer Dispatch" ? "Customer" : item}</b><small>{index < current ? "Completed" : index === current ? String(lot.status) : "Pending"}</small>{index < workflow.length - 1 && <i />}</div>; })}</div><div className="detail-grid"><section><h3>Lot information</h3><dl className="detail-list"><div><dt>Design No.</dt><dd>{String(lot.design_no)}</dd></div><div><dt>Lot No.</dt><dd>{String(lot.lot_no)}</dd></div><div><dt>Fabrication</dt><dd>{String(lot.fabrication)}</dd></div><div><dt>Total QTY</dt><dd>{fmt(lot.quantity)} PCS</dd></div><div><dt>Size Range</dt><dd>{String(lot.size_range)}</dd></div><div><dt>Required Date</dt><dd>{formatDate(lot.required_delivery_date)}</dd></div><div><dt>Current Department</dt><dd>{String(lot.current_department)}</dd></div><div><dt>Customer</dt><dd>{String(lot.customer)}</dd></div></dl>{sizes.length > 0 && <div className="size-view"><span>COLOUR / SIZE BREAKDOWN</span>{sizes.map((item) => <b key={String(item.id)}>{String(item.colour || "General")} · {String(item.size)} <em>{fmt(item.quantity)}</em></b>)}</div>}<div className="detail-buttons"><button className="button primary" onClick={() => printLotBook([lot], state, "Lot Progress Full Sheet")}><Printer size={15} /> Print / PDF</button><button className="button secondary" onClick={() => setModal({ type: "edit-lot", lot })}><Pencil size={15} /> Edit Lot</button><button className="button secondary" onClick={() => setModal({ type: "remark", lot })}><FileText size={15} /> Add Remark</button></div></section><section><h3>Activity history</h3>{lotHistory.length ? <ActivityList rows={lotHistory} /> : <Empty title="No history yet" detail="Activity appears as the lot moves through production." />}</section></div>{remarks.length > 0 && <section className="remarks-history"><h3>Remarks history</h3>{remarks.map((item) => <article key={String(item.id)}><div className="avatar small">{String(item.user_name || "AK").split(" ").map((word) => word[0]).slice(0,2).join("")}</div><div><p>{String(item.remark)}</p><small>{formatDate(item.created_at, true)} · {String(item.user_name || "Ayesha Khan")} · {String(item.department)}</small></div></article>)}</section>}</Modal>;
}

function printGatepass(dispatch: Row, settings: Row) {
  const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] || character));
  const popup = window.open("", "_blank", "width=980,height=780");
  if (!popup) { window.alert("Please allow pop-ups to print the gatepass."); return; }
  const logo = settings.logo_url ? `<img src="${escape(settings.logo_url)}" alt="Company logo">` : `<div class="mark">MS</div>`;
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Gatepass ${escape(dispatch.dispatch_no)}</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172333;margin:0;font-size:12px}.sheet{border:1px solid #cad2da;padding:28px}header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #118969;padding-bottom:18px}.brand{display:flex;gap:14px;align-items:center}.brand img,.mark{width:62px;height:62px;object-fit:contain;border-radius:10px}.mark{display:grid;place-items:center;background:#118969;color:#fff;font-size:22px;font-weight:800}.brand h1{font-size:22px;margin:0 0 5px}.brand p,.brand small{margin:0;color:#647184;display:block}.type{text-align:right}.type span{display:block;color:#118969;font-weight:800;letter-spacing:1.5px}.type b{display:block;font-size:19px;margin:6px 0}.meta{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #dbe1e6;margin:22px 0}.meta div{padding:12px;border-right:1px solid #dbe1e6}.meta div:last-child{border:0}.meta small,.party small,.remarks small{display:block;color:#798594;font-size:9px;font-weight:700;letter-spacing:.7px}.meta b{display:block;margin-top:5px}.parties{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:22px}.party{border:1px solid #dbe1e6;padding:14px}.party h2{font-size:15px;margin:7px 0 4px}.party p{margin:3px 0;color:#536174}table{width:100%;border-collapse:collapse;margin:0 0 20px}th{background:#172b3f;color:#fff;text-align:left;padding:10px;font-size:10px}td{border:1px solid #dbe1e6;padding:13px}.qty{font-size:15px;font-weight:800;color:#08795d}.remarks{background:#f5f8f7;padding:13px;margin-bottom:28px}.remarks p{margin:6px 0 0}.signatures{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;margin-top:55px}.signatures div{border-top:1px solid #697687;padding-top:8px;text-align:center;font-size:10px}.footer{text-align:center;border-top:1px solid #dbe1e6;margin-top:28px;padding-top:12px;color:#6f7a89;font-size:10px}</style></head><body><main class="sheet"><header><div class="brand">${logo}<div><h1>${escape(settings.company_name || "MS Boutique")}</h1><p>${escape(settings.address)}</p><small>${escape(settings.phone)}${settings.website ? ` · ${escape(settings.website)}` : ""}</small></div></div><div class="type"><span>GATE PASS / DELIVERY CHALLAN</span><b>${escape(dispatch.dispatch_no)}</b><small>${escape(formatDate(dispatch.dispatch_date))}</small></div></header><section class="meta"><div><small>INVOICE NO.</small><b>${escape(dispatch.invoice_no)}</b></div><div><small>CHALLAN NO.</small><b>${escape(dispatch.challan_no)}</b></div><div><small>TRACKING NO.</small><b>${escape(dispatch.tracking_no || "—")}</b></div><div><small>STATUS</small><b>${escape(dispatch.dispatch_status)}</b></div></section><section class="parties"><div class="party"><small>DISPATCH TO</small><h2>${escape(dispatch.customer)}</h2><p>${escape(dispatch.destination)}</p></div><div class="party"><small>TRANSPORT DETAILS</small><h2>${escape(dispatch.transporter || "Self arranged")}</h2><p>Vehicle: ${escape(dispatch.vehicle_no || "—")}</p><p>Driver: ${escape(dispatch.driver_name || "—")} · ${escape(dispatch.driver_contact || "")}</p></div></section><table><thead><tr><th>Lot No.</th><th>Design No.</th><th>Fabrication</th><th>Size Range</th><th>Dispatch QTY</th><th>Cartons</th></tr></thead><tbody><tr><td>${escape(dispatch.lot_no)}</td><td>${escape(dispatch.design_no)}</td><td>${escape(dispatch.fabrication)}</td><td>${escape(dispatch.size_range)}</td><td class="qty">${escape(fmt(dispatch.dispatch_qty))} PCS</td><td>${escape(fmt(dispatch.carton_qty))}</td></tr></tbody></table><section class="remarks"><small>REMARKS</small><p>${escape(dispatch.remarks || "Finished goods counted, sealed and released from Warehouse.")}</p></section><section class="signatures"><div>Prepared By</div><div>Warehouse Approval</div><div>Driver Signature</div><div>Gate Security</div></section><footer class="footer">${escape(settings.footer_note || "Computer generated gatepass.")}</footer></main></body></html>`);
  popup.document.close(); popup.focus(); popup.onload = () => popup.print();
}

// One payroll model shared by the on-screen tables, the CSV exports and the
// printable sheets, so every surface reports the same numbers.
type PersonPay = { code: string; name: string; department: string; designation: string; items: Row[]; pcs: number; gross: number; advance: number; net: number; advanceRows: Row[] };
function buildPayroll(state: FactoryState, period: string) {
  const advancesFor = (id: unknown) => state.advances.filter((row) => String(row.period) === period && number(row.employee_id) === number(id));
  const salaries = state.salaries.filter((row) => String(row.period) === period);
  const entries = state.pieceWork.filter((row) => String(row.period) === period);

  const monthly: PersonPay[] = salaries.filter((row) => row.salary_type !== "Theka").map((row) => {
    const advanceRows = advancesFor(row.employee_id);
    return {
      code: String(row.employee_code), name: String(row.employee_name), department: String(row.department), designation: String(row.designation || ""),
      items: [row], pcs: 0, gross: number(row.base_amount) + number(row.overtime_amount) + number(row.bonus),
      advance: number(row.advance) + number(row.deduction), net: number(row.net_payable), advanceRows,
    };
  });

  const theka: PersonPay[] = state.employees.filter((employee) => entries.some((row) => number(row.employee_id) === number(employee.id))).map((employee) => {
    const items = entries.filter((row) => number(row.employee_id) === number(employee.id));
    const advanceRows = advancesFor(employee.id);
    const gross = items.reduce((sum, row) => sum + number(row.total_amount), 0);
    const advance = advanceRows.reduce((sum, row) => sum + number(row.amount), 0);
    return {
      code: String(employee.employee_code), name: String(employee.name), department: String(employee.department), designation: String(employee.designation),
      items, pcs: items.reduce((sum, row) => sum + number(row.pcs_qty), 0), gross, advance, net: gross - advance, advanceRows,
    };
  });

  const totals = (rows: PersonPay[]) => ({
    people: rows.length,
    pcs: rows.reduce((sum, row) => sum + row.pcs, 0),
    gross: rows.reduce((sum, row) => sum + row.gross, 0),
    advance: rows.reduce((sum, row) => sum + row.advance, 0),
    net: rows.reduce((sum, row) => sum + row.net, 0),
  });

  return { period, monthly, theka, salaries, advances: state.advances.filter((row) => String(row.period) === period), monthlyTotals: totals(monthly), thekaTotals: totals(theka), allTotals: totals([...monthly, ...theka]) };
}

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
function downloadCsv(rows: string[][], filename: string) {
  const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `${filename}.csv`; anchor.click();
  URL.revokeObjectURL(url);
}

// Theka export walks item rows, then the person's own total, then the overall total.
function exportThekaSalary(payroll: ReturnType<typeof buildPayroll>, settings: Row) {
  const rows: string[][] = [
    [String(settings.company_name || "MS Boutique"), "", "", "", "", "", "", ""],
    [`Theka / Piece-Rate Salary — ${payroll.period}`, "", "", "", "", "", "", ""],
    [],
    ["Staff ID", "Employee", "Department", "Item / Work", "Lot No.", "Work From", "Work To", "PCS Qty.", "Per Piece Rate", "Amount"],
  ];
  for (const person of payroll.theka) {
    for (const item of person.items) {
      rows.push([person.code, person.name, person.department, String(item.item), String(item.lot_no || ""), String(item.work_from), String(item.work_to), String(number(item.pcs_qty)), String(number(item.rate_per_piece)), String(number(item.total_amount))]);
    }
    rows.push(["", `TOTAL — ${person.name}`, "", `${person.items.length} item(s)`, "", "", "", String(person.pcs), "", String(round2(person.gross))]);
    for (const advance of person.advanceRows) rows.push(["", "Advance", "", String(advance.remarks || "Advance paid"), "", String(advance.advance_date), "", "", "", String(-number(advance.amount))]);
    rows.push(["", `NET PAYABLE — ${person.name}`, "", "", "", "", "", "", "", String(round2(person.net))]);
    rows.push([]);
  }
  rows.push(["", "OVERALL TOTAL", `${payroll.thekaTotals.people} staff`, "", "", "", "", String(payroll.thekaTotals.pcs), "Gross", String(round2(payroll.thekaTotals.gross))]);
  rows.push(["", "", "", "", "", "", "", "", "Advance", String(round2(payroll.thekaTotals.advance))]);
  rows.push(["", "", "", "", "", "", "", "", "Net Payable", String(round2(payroll.thekaTotals.net))]);
  downloadCsv(rows, `MS-Boutique-Theka-Salary-${payroll.period}`);
}

function exportMonthlySalary(payroll: ReturnType<typeof buildPayroll>, settings: Row) {
  const rows: string[][] = [
    [String(settings.company_name || "MS Boutique")],
    [`Monthly Salary — ${payroll.period} (${daysInPeriod(payroll.period)} days in month)`],
    [],
    ["Staff ID", "Employee", "Department", "Designation", "Present Days", "Absent Days", "Per Day", "Base", "Overtime", "Bonus", "Advance", "Deduction", "Net Payable", "Status", "Paid Date"],
  ];
  for (const person of payroll.monthly) {
    const record = person.items[0];
    rows.push([person.code, person.name, person.department, person.designation, String(number(record.present_days)), String(number(record.absent_days)),
      String(round2(number(record.base_amount) / Math.max(1, number(record.present_days)))), String(number(record.base_amount)), String(number(record.overtime_amount)),
      String(number(record.bonus)), String(number(record.advance)), String(number(record.deduction)), String(number(record.net_payable)), String(record.payment_status), String(record.paid_date || "")]);
  }
  rows.push([]);
  rows.push(["", "OVERALL TOTAL", `${payroll.monthlyTotals.people} staff`, "", "", "", "", String(round2(payroll.monthlyTotals.gross)), "", "", String(round2(payroll.monthlyTotals.advance)), "", String(round2(payroll.monthlyTotals.net))]);
  rows.push([]);
  rows.push(["ADVANCES PAID IN " + payroll.period]);
  rows.push(["Staff ID", "Employee", "Department", "Advance Date", "Amount", "Remarks"]);
  for (const advance of payroll.advances) rows.push([String(advance.employee_code), String(advance.employee_name), String(advance.department), String(advance.advance_date), String(number(advance.amount)), String(advance.remarks || "")]);
  rows.push(["", "TOTAL ADVANCE", "", "", String(round2(payroll.advances.reduce((sum, row) => sum + number(row.amount), 0)))]);
  downloadCsv(rows, `MS-Boutique-Monthly-Salary-${payroll.period}`);
}

const salaryDocumentStyles = `@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172333;margin:0;font-size:11px}
.sheet{border:1px solid #cad2da;padding:22px}
header{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #118969;padding-bottom:14px;margin-bottom:18px}
header img{width:56px;height:56px;object-fit:contain;border-radius:9px}
.brand{display:flex;gap:12px;align-items:center}.mark{width:56px;height:56px;display:grid;place-items:center;background:#118969;color:#fff;font-size:20px;font-weight:800;border-radius:9px}
h1{font-size:19px;margin:0 0 4px}header p,header small{margin:0;color:#647184;display:block}
.type{text-align:right}.type span{display:block;color:#118969;font-weight:800;letter-spacing:1.4px;font-size:9px}.type b{display:block;font-size:17px;margin:5px 0}
table{width:100%;border-collapse:collapse;margin-bottom:14px}
th{background:#172b3f;color:#fff;text-align:left;padding:7px 8px;font-size:9px;letter-spacing:.4px}
td{border:1px solid #dbe1e6;padding:7px 8px}
td.n,th.n{text-align:right}
.person{margin-bottom:16px;break-inside:avoid}
.person h2{font-size:12px;margin:0 0 6px;padding:7px 9px;background:#eef2f6;border-left:3px solid #118969}
.person h2 span{color:#647184;font-weight:400;margin-left:8px}
tr.subtotal td{background:#f4f8f7;font-weight:800}
tr.advance td{background:#fdf6f6;color:#a83b3b}
tr.net td{background:#e9f6f1;font-weight:800;color:#08795d;font-size:12px}
.grand{margin-top:18px;border:2px solid #118969;border-radius:8px;overflow:hidden}
.grand table{margin:0}.grand th{background:#0f6b53}
.grand tr:last-child td{background:#e9f6f1;font-weight:800;color:#08795d;font-size:13px}
.footer{text-align:center;border-top:1px solid #dbe1e6;margin-top:20px;padding-top:10px;color:#6f7a89;font-size:9px}
.sign{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-top:38px}
.sign div{border-top:1px solid #697687;padding-top:7px;text-align:center;font-size:9px}`;

function openSalaryDocument(title: string, settings: Row, body: string) {
  const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] || character));
  const popup = window.open("", "_blank", "width=1024,height=800");
  if (!popup) { window.alert("Please allow pop-ups to print or save this salary sheet."); return; }
  const logo = settings.logo_url ? `<img src="${escape(settings.logo_url)}" alt="Company logo">` : `<div class="mark">MS</div>`;
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><style>${salaryDocumentStyles}</style></head><body><main class="sheet">
    <header><div class="brand">${logo}<div><h1>${escape(settings.company_name || "MS Boutique")}</h1><p>${escape(settings.address || "")}</p><small>${escape(settings.phone || "")}</small></div></div>
    <div class="type"><span>SALARY SHEET</span><b>${escape(title)}</b><small>Generated ${escape(formatDate(today))}</small></div></header>
    ${body}
    <section class="sign"><div>Prepared By</div><div>Checked By</div><div>Owner Approval</div></section>
    <footer class="footer">${escape(settings.company_name || "MS Boutique")} · ${escape(title)} · Computer generated salary sheet.</footer></main></body></html>`);
  popup.document.close(); popup.focus(); popup.onload = () => popup.print();
}

const cash = (value: number) => `Rs ${round2(value).toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(round2(value)) ? 0 : 2, maximumFractionDigits: 2 })}`;

// Item rows, then that person's total, then the overall total for the month.
function printThekaSalary(payroll: ReturnType<typeof buildPayroll>, settings: Row) {
  const people = payroll.theka.map((person) => `<section class="person">
    <h2>${person.code} · ${person.name}<span>${person.department} · ${person.designation}</span></h2>
    <table><thead><tr><th>Item / Work</th><th>Lot No.</th><th>Work From</th><th>Work To</th><th class="n">PCS Qty.</th><th class="n">Per Piece Rate</th><th class="n">Amount</th></tr></thead><tbody>
      ${person.items.map((item) => `<tr><td>${item.item}</td><td>${item.lot_no || "—"}</td><td>${formatDate(item.work_from)}</td><td>${formatDate(item.work_to)}</td><td class="n">${fmt(item.pcs_qty)}</td><td class="n">${cash(number(item.rate_per_piece))}</td><td class="n">${cash(number(item.total_amount))}</td></tr>`).join("")}
      <tr class="subtotal"><td colspan="4">Total for ${person.name} — ${person.items.length} item${person.items.length === 1 ? "" : "s"}</td><td class="n">${fmt(person.pcs)}</td><td class="n"></td><td class="n">${cash(person.gross)}</td></tr>
      ${person.advanceRows.map((advance) => `<tr class="advance"><td colspan="4">Advance · ${advance.remarks || "Paid in advance"}</td><td class="n"></td><td class="n">${formatDate(advance.advance_date)}</td><td class="n">− ${cash(number(advance.amount))}</td></tr>`).join("")}
      <tr class="net"><td colspan="6">Net payable to ${person.name}</td><td class="n">${cash(person.net)}</td></tr>
    </tbody></table></section>`).join("");

  const grand = `<div class="grand"><table><thead><tr><th>Overall Theka Total — ${payroll.period}</th><th class="n">Staff</th><th class="n">Total PCS</th><th class="n">Gross Salary</th><th class="n">Advance</th><th class="n">Net Payable</th></tr></thead>
    <tbody><tr><td>All piece-rate staff</td><td class="n">${payroll.thekaTotals.people}</td><td class="n">${fmt(payroll.thekaTotals.pcs)}</td><td class="n">${cash(payroll.thekaTotals.gross)}</td><td class="n">− ${cash(payroll.thekaTotals.advance)}</td><td class="n">${cash(payroll.thekaTotals.net)}</td></tr></tbody></table></div>`;

  openSalaryDocument(`Theka / Piece-Rate Salary — ${payroll.period}`, settings, people ? people + grand : `<p>No piece-work entries recorded for ${payroll.period}.</p>`);
}

function printMonthlySalary(payroll: ReturnType<typeof buildPayroll>, settings: Row) {
  const monthDays = daysInPeriod(payroll.period);
  const rows = payroll.monthly.map((person, index) => {
    const record = person.items[0];
    const days = number(record.present_days);
    return `<tr><td class="n">${index + 1}</td><td>${person.code}</td><td>${person.name}<br><small>${person.designation}</small></td><td>${person.department}</td><td class="n">${days} / ${fmt(record.absent_days)}</td><td class="n">${cash(number(record.base_amount) / Math.max(1, days))}</td><td class="n">${cash(number(record.base_amount))}</td><td class="n">${cash(number(record.overtime_amount) + number(record.bonus))}</td><td class="n">− ${cash(number(record.advance) + number(record.deduction))}</td><td class="n"><b>${cash(number(record.net_payable))}</b></td><td>${record.payment_status}</td></tr>`;
  }).join("");

  const advanceRows = payroll.advances.map((advance) => `<tr><td>${advance.employee_code}</td><td>${advance.employee_name}</td><td>${advance.department}</td><td>${formatDate(advance.advance_date)}</td><td>${advance.remarks || "—"}</td><td class="n">${cash(number(advance.amount))}</td></tr>`).join("");
  const advanceTotal = payroll.advances.reduce((sum, row) => sum + number(row.amount), 0);

  const body = `<p style="margin:0 0 12px;color:#647184">Day rate is the monthly salary divided by <b>${monthDays} days</b> in ${payroll.period}, multiplied by the days attended.</p>
    <table><thead><tr><th class="n">#</th><th>Staff ID</th><th>Employee</th><th>Department</th><th class="n">Days P / A</th><th class="n">Per Day</th><th class="n">Base</th><th class="n">OT + Bonus</th><th class="n">Advance</th><th class="n">Net Payable</th><th>Status</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="11">No monthly salary records for ${payroll.period}.</td></tr>`}
      <tr class="subtotal"><td colspan="6">Total — ${payroll.monthlyTotals.people} monthly staff</td><td class="n">${cash(payroll.monthlyTotals.gross)}</td><td class="n"></td><td class="n">− ${cash(payroll.monthlyTotals.advance)}</td><td class="n">${cash(payroll.monthlyTotals.net)}</td><td></td></tr></tbody></table>
    <h3 style="font-size:12px;margin:20px 0 7px">Advances paid in ${payroll.period}</h3>
    <table><thead><tr><th>Staff ID</th><th>Employee</th><th>Department</th><th>Date</th><th>Remarks</th><th class="n">Amount</th></tr></thead>
      <tbody>${advanceRows || `<tr><td colspan="6">No advances recorded.</td></tr>`}<tr class="subtotal"><td colspan="5">Total advance</td><td class="n">${cash(advanceTotal)}</td></tr></tbody></table>
    <div class="grand"><table><thead><tr><th>Overall Payroll — ${payroll.period}</th><th class="n">Staff</th><th class="n">Gross Salary</th><th class="n">Advance</th><th class="n">Net Payable</th></tr></thead><tbody>
      <tr><td>Monthly staff</td><td class="n">${payroll.monthlyTotals.people}</td><td class="n">${cash(payroll.monthlyTotals.gross)}</td><td class="n">− ${cash(payroll.monthlyTotals.advance)}</td><td class="n">${cash(payroll.monthlyTotals.net)}</td></tr>
      <tr><td>Theka / piece-rate staff</td><td class="n">${payroll.thekaTotals.people}</td><td class="n">${cash(payroll.thekaTotals.gross)}</td><td class="n">− ${cash(payroll.thekaTotals.advance)}</td><td class="n">${cash(payroll.thekaTotals.net)}</td></tr>
      <tr><td>Total salary payable</td><td class="n">${payroll.allTotals.people}</td><td class="n">${cash(payroll.allTotals.gross)}</td><td class="n">− ${cash(payroll.allTotals.advance)}</td><td class="n">${cash(payroll.allTotals.net)}</td></tr>
    </tbody></table></div>`;

  openSalaryDocument(`Monthly Salary — ${payroll.period}`, settings, body);
}

// Invoice-styled gate pass: the same movement laid out as a commercial document
// with rate and value columns, for gate security and transport paperwork.
function printInvoiceGatepass(gatepass: Row, settings: Row, rate: number) {
  const quantity = number(gatepass.quantity);
  const amount = round2(quantity * rate);
  const valueCell = (value: string) => rate > 0 ? value : `<span class="blank"></span>`;
  printDocument(`Invoice Gate Pass ${String(gatepass.gatepass_no)}`,
    `@page{size:A4;margin:13mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172333;margin:0;font-size:12px}
     .sheet{border:1px solid #cad2da;padding:26px}
     header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #2f9e44;padding-bottom:16px}
     header img,.mark{width:60px;height:60px;object-fit:contain;border-radius:10px}
     .brand{display:flex;gap:14px;align-items:center}
     .mark{display:grid;place-items:center;background:#2f9e44;color:#fff;font-size:21px;font-weight:800}
     h1{font-size:21px;margin:0 0 5px}header p,header small{margin:0;color:#647184;display:block}
     .type{text-align:right}.type span{display:block;color:#2f9e44;font-weight:800;letter-spacing:1.4px;font-size:10px}
     .type b{display:block;font-size:18px;margin:6px 0}
     .meta{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #dbe1e6;margin:20px 0}
     .meta div{padding:11px;border-right:1px solid #dbe1e6}.meta div:last-child{border:0}
     .meta small{display:block;color:#798594;font-size:9px;font-weight:700;letter-spacing:.6px}.meta b{display:block;margin-top:5px}
     .parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px}
     .party{border:1px solid #dbe1e6;padding:13px}.party small{display:block;color:#798594;font-size:9px;font-weight:700}
     .party h2{font-size:14px;margin:6px 0 3px}.party p{margin:2px 0;color:#536174;font-size:11px}
     table{width:100%;border-collapse:collapse;margin-bottom:16px}
     th{background:#14622c;color:#fff;text-align:left;padding:9px;font-size:10px}
     td{border:1px solid #dbe1e6;padding:11px}
     td.n,th.n{text-align:right}
     .blank{display:inline-block;min-width:78px;border-bottom:1px dotted #8b97a5}
     tr.total td{background:#e9f6ec;font-weight:800;color:#14622c;font-size:13px}
     .remarks{background:#f2f7f3;padding:12px;margin-bottom:22px}
     .remarks small{display:block;color:#798594;font-size:9px;font-weight:700}.remarks p{margin:6px 0 0}
     .signatures{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;margin-top:48px}
     .signatures div{border-top:1px solid #697687;padding-top:8px;text-align:center;font-size:10px}
     .footer{text-align:center;border-top:1px solid #dbe1e6;margin-top:26px;padding-top:12px;color:#6f7a89;font-size:10px}`,
    `<main class="sheet">
      <header><div class="brand">${settings.logo_url ? `<img src="${escapeHtml(settings.logo_url)}" alt="">` : `<div class="mark">MS</div>`}
        <div><h1>${escapeHtml(settings.company_name || "MS Boutique")}</h1><p>${escapeHtml(settings.address || "")}</p><small>${escapeHtml(settings.phone || "")}</small></div></div>
        <div class="type"><span>INVOICE GATE PASS</span><b>${escapeHtml(gatepass.gatepass_no)}</b><small>${escapeHtml(formatDate(gatepass.gatepass_date))}</small></div></header>
      <section class="meta">
        <div><small>PURPOSE</small><b>${escapeHtml(gatepass.purpose)}</b></div>
        <div><small>VEHICLE NO.</small><b>${escapeHtml(gatepass.vehicle_no || "—")}</b></div>
        <div><small>DRIVER</small><b>${escapeHtml(gatepass.driver_name || "—")}</b></div>
        <div><small>STATUS</small><b>${escapeHtml(gatepass.status)}</b></div>
      </section>
      <section class="parties">
        <div class="party"><small>DESPATCHED FROM</small><h2>${escapeHtml(gatepass.from_department)}</h2><p>${escapeHtml(settings.company_name || "MS Boutique")}</p><p>${escapeHtml(settings.address || "")}</p></div>
        <div class="party"><small>DELIVER TO</small><h2>${escapeHtml(gatepass.to_department)}</h2><p>Customer: ${escapeHtml(gatepass.customer || "—")}</p><p>Lot ${escapeHtml(gatepass.lot_no)}</p></div>
      </section>
      <table><thead><tr><th>#</th><th>Design / Description</th><th>Fabrication</th><th>Size Range</th><th class="n">Quantity</th><th class="n">Cartons</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead>
        <tbody><tr>
          <td>1</td><td><b>${escapeHtml(gatepass.design_no)}</b><br>${escapeHtml(gatepass.lot_no)}</td>
          <td>${escapeHtml(gatepass.fabrication)}</td><td>${escapeHtml(gatepass.size_range)}</td>
          <td class="n">${fmt(quantity)} PCS</td><td class="n">${fmt(gatepass.cartons)}</td>
          <td class="n">${valueCell(money(rate))}</td><td class="n">${valueCell(money(amount))}</td>
        </tr>
        <tr class="total"><td colspan="4">Total declared value</td><td class="n">${fmt(quantity)} PCS</td><td class="n">${fmt(gatepass.cartons)}</td><td class="n"></td><td class="n">${valueCell(money(amount))}</td></tr></tbody></table>
      <section class="remarks"><small>REMARKS</small><p>${escapeHtml(gatepass.remarks || "Cartons sealed and released for warehouse shipment.")}</p></section>
      <section class="signatures"><div>Issued By<br>${escapeHtml(gatepass.issued_by || "")}</div><div>Approved By<br>${escapeHtml(gatepass.approved_by || "")}</div><div>Driver Signature</div><div>Gate Security</div></section>
      <footer class="footer">${escapeHtml(settings.company_name || "MS Boutique")} · Invoice Gate Pass ${escapeHtml(gatepass.gatepass_no)}${rate > 0 ? "" : " · declared value to be completed by hand"}</footer>
    </main>`);
}

// Several gate passes billed as one document: every lot becomes a line, with a
// single set of totals underneath.
function printCombinedInvoice(gatepasses: Row[], settings: Row, rateFor: (lotId: unknown) => number) {
  if (!gatepasses.length) { window.alert("Select at least one gate pass first."); return; }
  const priced = gatepasses.map((row) => { const rate = rateFor(row.lot_id); const quantity = number(row.quantity); return { row, rate, quantity, amount: round2(quantity * rate) }; });
  // A line with no rate prints a ruled blank, never "Rs 0" — a zero would read as
  // a genuine price. If any line is unpriced the total is flagged as partial.
  const unpriced = priced.filter((line) => line.rate <= 0);
  const totals = {
    quantity: priced.reduce((sum, line) => sum + line.quantity, 0),
    cartons: priced.reduce((sum, line) => sum + number(line.row.cartons), 0),
    amount: round2(priced.reduce((sum, line) => sum + line.amount, 0)),
  };
  const blank = `<span class="blank"></span>`;
  const cell = (value: string, rate: number) => rate > 0 ? value : blank;
  const customers = [...new Set(priced.map((line) => String(line.row.customer || "")).filter(Boolean))];
  const reference = `CINV-${priced.map((line) => String(line.row.gatepass_no).replace(/\D/g, "")).join("-")}`;

  printDocument(`Combined Invoice ${reference}`,
    `@page{size:A4;margin:13mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172333;margin:0;font-size:12px}
     .sheet{border:1px solid #cad2da;padding:26px}
     header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #2f9e44;padding-bottom:16px}
     header img,.mark{width:60px;height:60px;object-fit:contain;border-radius:10px}
     .brand{display:flex;gap:14px;align-items:center}
     .mark{display:grid;place-items:center;background:#2f9e44;color:#fff;font-size:21px;font-weight:800}
     h1{font-size:21px;margin:0 0 5px}header p,header small{margin:0;color:#647184;display:block}
     .type{text-align:right}.type span{display:block;color:#2f9e44;font-weight:800;letter-spacing:1.4px;font-size:10px}
     .type b{display:block;font-size:18px;margin:6px 0}
     .meta{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #dbe1e6;margin:20px 0}
     .meta div{padding:11px;border-right:1px solid #dbe1e6}.meta div:last-child{border:0}
     .meta small{display:block;color:#798594;font-size:9px;font-weight:700;letter-spacing:.6px}.meta b{display:block;margin-top:5px}
     table{width:100%;border-collapse:collapse;margin-bottom:16px}
     th{background:#14622c;color:#fff;text-align:left;padding:9px;font-size:10px}
     td{border:1px solid #dbe1e6;padding:10px}
     td.n,th.n{text-align:right}
     .blank{display:inline-block;min-width:70px;border-bottom:1px dotted #8b97a5}
     tr.total td{background:#e9f6ec;font-weight:800;color:#14622c;font-size:13px}
     .note{background:#f2f7f3;padding:12px;margin-bottom:22px;font-size:11px}
     .signatures{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;margin-top:46px}
     .signatures div{border-top:1px solid #697687;padding-top:8px;text-align:center;font-size:10px}
     .footer{text-align:center;border-top:1px solid #dbe1e6;margin-top:26px;padding-top:12px;color:#6f7a89;font-size:10px}`,
    `<main class="sheet">
      <header><div class="brand">${settings.logo_url ? `<img src="${escapeHtml(settings.logo_url)}" alt="">` : `<div class="mark">MS</div>`}
        <div><h1>${escapeHtml(settings.company_name || "MS Boutique")}</h1><p>${escapeHtml(settings.address || "")}</p><small>${escapeHtml(settings.phone || "")}</small></div></div>
        <div class="type"><span>COMBINED INVOICE</span><b>${escapeHtml(reference)}</b><small>${escapeHtml(formatDate(today))}</small></div></header>
      <section class="meta">
        <div><small>GATE PASSES</small><b>${priced.length}</b></div>
        <div><small>LOTS</small><b>${new Set(priced.map((line) => String(line.row.lot_no))).size}</b></div>
        <div><small>TOTAL QUANTITY</small><b>${fmt(totals.quantity)} PCS</b></div>
        <div><small>CUSTOMER</small><b>${escapeHtml(customers.length === 1 ? customers[0] : `${customers.length} customers`)}</b></div>
      </section>
      <table><thead><tr><th class="n">#</th><th>Gate Pass</th><th>Lot No.</th><th>Design</th><th>Fabrication</th><th>Size</th><th class="n">Qty</th><th class="n">Cartons</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead>
        <tbody>${priced.map((line, index) => `<tr>
          <td class="n">${index + 1}</td><td><b>${escapeHtml(line.row.gatepass_no)}</b><br>${escapeHtml(formatDate(line.row.gatepass_date))}</td>
          <td>${escapeHtml(line.row.lot_no)}</td><td><b>${escapeHtml(line.row.design_no)}</b></td>
          <td>${escapeHtml(line.row.fabrication)}</td><td>${escapeHtml(line.row.size_range)}</td>
          <td class="n">${fmt(line.quantity)}</td><td class="n">${fmt(line.row.cartons)}</td>
          <td class="n">${cell(money(line.rate), line.rate)}</td><td class="n">${cell(money(line.amount), line.rate)}</td></tr>`).join("")}
        <tr class="total"><td colspan="6">Total — ${priced.length} gate pass${priced.length === 1 ? "" : "es"}${unpriced.length ? ` (${unpriced.length} awaiting a rate)` : ""}</td><td class="n">${fmt(totals.quantity)} PCS</td><td class="n">${fmt(totals.cartons)}</td><td class="n"></td><td class="n">${totals.amount > 0 ? money(totals.amount) : blank}</td></tr></tbody></table>
      <section class="note">Vehicles: ${escapeHtml([...new Set(priced.map((line) => String(line.row.vehicle_no || "—")))].join(", "))} · Drivers: ${escapeHtml([...new Set(priced.map((line) => String(line.row.driver_name || "—")))].join(", "))}</section>
      <section class="signatures"><div>Prepared By</div><div>Approved By</div><div>Driver Signature</div><div>Gate Security</div></section>
      <footer class="footer">${escapeHtml(settings.company_name || "MS Boutique")} · Combined invoice for ${priced.map((line) => escapeHtml(line.row.gatepass_no)).join(", ")}${unpriced.length ? ` · ${unpriced.length} line${unpriced.length === 1 ? "" : "s"} to be priced by hand` : ""}</footer>
    </main>`);
}

// Internal Packing-to-Warehouse gate pass — a different document to the customer gatepass.
function printMovementGatepass(gatepass: Row, settings: Row) {
  const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] || character));
  const popup = window.open("", "_blank", "width=980,height=780");
  if (!popup) { window.alert("Please allow pop-ups to print the gate pass."); return; }
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Gate Pass ${escape(gatepass.gatepass_no)}</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172333;margin:0;font-size:12px}.sheet{border:1px solid #cad2da;padding:28px}header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #118969;padding-bottom:18px}h1{font-size:22px;margin:0 0 5px}header p,header small{margin:0;color:#647184;display:block}.type{text-align:right}.type span{display:block;color:#118969;font-weight:800;letter-spacing:1.5px}.type b{display:block;font-size:19px;margin:6px 0}.route{display:flex;align-items:center;justify-content:center;gap:18px;background:#f4f8f7;border:1px solid #dbe6e2;padding:14px;margin:22px 0;font-weight:700}.meta{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #dbe1e6}.meta div{padding:12px;border-right:1px solid #dbe1e6}.meta div:last-child{border:0}.meta small{display:block;color:#798594;font-size:9px;font-weight:700;letter-spacing:.7px}.meta b{display:block;margin-top:5px}table{width:100%;border-collapse:collapse;margin:22px 0}th{background:#172b3f;color:#fff;text-align:left;padding:10px;font-size:10px}td{border:1px solid #dbe1e6;padding:13px}.qty{font-size:15px;font-weight:800;color:#08795d}.remarks{background:#f5f8f7;padding:13px}.remarks small{display:block;color:#798594;font-size:9px;font-weight:700}.remarks p{margin:6px 0 0}.signatures{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;margin-top:55px}.signatures div{border-top:1px solid #697687;padding-top:8px;text-align:center;font-size:10px}.footer{text-align:center;border-top:1px solid #dbe1e6;margin-top:28px;padding-top:12px;color:#6f7a89;font-size:10px}</style></head><body><main class="sheet"><header><div><h1>${escape(settings.company_name || "MS Boutique")}</h1><p>${escape(settings.address || "Industrial Area, Lahore, Pakistan")}</p><small>${escape(settings.phone || "")}</small></div><div class="type"><span>FACTORY GATE PASS</span><b>${escape(gatepass.gatepass_no)}</b><small>${escape(formatDate(gatepass.gatepass_date))}</small></div></header><section class="route">${escape(gatepass.from_department)} &nbsp;&rarr;&nbsp; GATE PASS &nbsp;&rarr;&nbsp; ${escape(gatepass.to_department)}</section><section class="meta"><div><small>PURPOSE</small><b>${escape(gatepass.purpose)}</b></div><div><small>VEHICLE NO.</small><b>${escape(gatepass.vehicle_no || "—")}</b></div><div><small>DRIVER</small><b>${escape(gatepass.driver_name || "—")}</b></div><div><small>STATUS</small><b>${escape(gatepass.status)}</b></div></section><table><thead><tr><th>Lot No.</th><th>Design No.</th><th>Fabrication</th><th>Size Range</th><th>Quantity</th><th>Cartons</th></tr></thead><tbody><tr><td>${escape(gatepass.lot_no)}</td><td>${escape(gatepass.design_no)}</td><td>${escape(gatepass.fabrication)}</td><td>${escape(gatepass.size_range)}</td><td class="qty">${escape(fmt(gatepass.quantity))} PCS</td><td>${escape(fmt(gatepass.cartons))}</td></tr></tbody></table><section class="remarks"><small>REMARKS</small><p>${escape(gatepass.remarks || "Cartons sealed and released for warehouse shipment.")}</p></section><section class="signatures"><div>Issued By<br>${escape(gatepass.issued_by || "")}</div><div>Approved By<br>${escape(gatepass.approved_by || "")}</div><div>Driver Signature</div><div>Gate Security</div></section><footer class="footer">${escape(settings.footer_note || "Computer generated gate pass.")}</footer></main></body></html>`);
  popup.document.close(); popup.focus(); popup.onload = () => popup.print();
}

function exportRows(rows: Row[], filename: string) { if (!rows.length) return; const columns = Object.keys(rows[0]).filter((column) => !["password_hash"].includes(column)); const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => `"${String(row[column] ?? "").replaceAll('"','""')}"`).join(","))].join("\n"); const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${filename}.csv`; anchor.click(); URL.revokeObjectURL(url); }
