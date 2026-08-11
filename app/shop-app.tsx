"use client";

import {
  AlertTriangle, ArrowLeft, Banknote, Boxes, CalendarCheck, Check, CheckCircle2, ClipboardCheck,
  CreditCard, Download, FileBarChart, Image, LoaderCircle, LogOut, Menu, Minus, Plus, Printer, Receipt,
  ReceiptText, Save, Search, Settings, ShoppingCart, Store, Trash2, Upload, Wallet, X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiFetch, cx, downloadCsv, Empty, escapeHtml, Field, fmt, formatDate, initials, Modal, money, number, printDocument,
  readLogoFile, Row, round2, SectionHead, SessionUser, StatusBadge, today,
} from "./shared";

type ShopState = {
  shops: Row[]; shopInventory: Row[]; shopSales: Row[]; shopSaleItems: Row[];
  shopExpenses: Row[]; shopAttendance: Row[]; shopDayClose: Row[]; shopShipments: Row[];
};

const emptyShopState: ShopState = { shops: [], shopInventory: [], shopSales: [], shopSaleItems: [], shopExpenses: [], shopAttendance: [], shopDayClose: [], shopShipments: [] };

const nav = [
  { label: "POS Billing", icon: ShoppingCart },
  { label: "Inventory", icon: Boxes },
  { label: "Reports", icon: FileBarChart },
  { label: "Expenses", icon: Wallet },
  { label: "Attendance", icon: CalendarCheck },
  { label: "Day Close", icon: ClipboardCheck },
  { label: "Settings", icon: Settings },
];

const expenseCategories = ["General", "Rent", "Utilities", "Salary", "Transport", "Marketing", "Maintenance", "Packaging"];
const attendanceStatuses = ["Present", "Absent", "Half Day", "Leave", "Overtime", "Holiday"];
type Line = { inventoryId: number; name: string; rate: number; quantity: number; remaining: number };

export default function ShopApp({ shopId, user, onSignOut }: { shopId: number; user: SessionUser; onSignOut: () => void }) {
  const ownerViewing = user.role === "Owner";
  const [state, setState] = useState<ShopState>(emptyShopState);
  const [page, setPage] = useState("POS Billing");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  // The counter only ever loads its own shop, never the factory floor.
  const scope = `scope=shop&shopId=${shopId}`;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await apiFetch(`/api/factory?scope=shop&shopId=${shopId}`);
      const data = await response.json() as ShopState & { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to load shop data.");
      setState(data);
    } catch (error) { if (!silent) setToast({ type: "error", text: error instanceof Error ? error.message : "Unable to load shop data." }); }
    finally { if (!silent) setLoading(false); }
  }, [shopId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 3600); return () => clearTimeout(id); }, [toast]);
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 60000);
    return () => clearInterval(id);
  }, [load]);

  const post = async (payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      const response = await apiFetch(`/api/factory?${scope}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, scope: "shop", shopId }) });
      const data = await response.json() as { error?: string; message?: string; state?: ShopState };
      if (!response.ok) throw new Error(data.error || "Unable to save this change.");
      if (data.state) setState(data.state);
      setToast({ type: "success", text: data.message || "Saved successfully." });
      return data as { message?: string; invoiceNo?: string; saleId?: number };
    } catch (error) { setToast({ type: "error", text: error instanceof Error ? error.message : "Unable to save this change." }); return null; }
    finally { setSaving(false); }
  };

  const shop = state.shops.find((row) => number(row.id) === shopId);
  const inventory = useMemo(() => state.shopInventory.filter((row) => number(row.shop_id) === shopId), [state.shopInventory, shopId]);
  const sales = useMemo(() => state.shopSales.filter((row) => number(row.shop_id) === shopId), [state.shopSales, shopId]);
  const expenses = useMemo(() => state.shopExpenses.filter((row) => number(row.shop_id) === shopId), [state.shopExpenses, shopId]);
  const shipments = useMemo(() => state.shopShipments.filter((row) => number(row.shop_id) === shopId), [state.shopShipments, shopId]);

  if (loading) return <div className="loading-view"><LoaderCircle className="spin" size={30} /><h2>Opening the shop counter…</h2><p>Loading stock, invoices and today&apos;s takings.</p></div>;
  if (!shop) return <div className="loading-view"><AlertTriangle size={30} /><h2>Shop not found</h2><p>This shop may have been closed. Return to the factory system and open it again.</p><Link className="button primary" href="/" style={{ marginTop: 16 }}><ArrowLeft size={16} /> Back to factory</Link></div>;

  const openPage = (value: string) => { setPage(value); setSidebar(false); scroller.current?.scrollTo({ top: 0, behavior: "smooth" }); };
  const props = { shop, inventory, sales, saleItems: state.shopSaleItems, expenses, attendance: state.shopAttendance.filter((row) => number(row.shop_id) === shopId), dayClose: state.shopDayClose.filter((row) => number(row.shop_id) === shopId), shipments, post, saving };

  return <div className="app-shell shop-shell">
    <aside className={cx("sidebar", sidebar && "sidebar-open")}>
      <div className="sidebar-brand">{shop.logo_url ? <img className="shop-logo" src={String(shop.logo_url)} alt="" /> : <span className="logo-mark">{String(shop.shop_code).slice(-2)}</span>}<div><b>{String(shop.name)}</b><small>{String(shop.shop_code)} · Retail POS</small></div><button className="sidebar-close" onClick={() => setSidebar(false)} aria-label="Close navigation"><X size={19} /></button></div>
      <nav className="nav-list">{nav.map((item) => <button key={item.label} className={cx("nav-item", page === item.label && "active")} onClick={() => openPage(item.label)}><item.icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{page === item.label && <span className="active-notch" />}</button>)}</nav>
      <div className="sidebar-user"><div className="avatar">{initials(user.name)}</div><div><b>{user.name}</b><span>{ownerViewing ? "Owner view" : "Shop counter"}</span></div>{ownerViewing ? <Link href="/" title="Back to factory" aria-label="Back to factory"><ArrowLeft size={18} /></Link> : <button title="Sign out" aria-label="Sign out" onClick={onSignOut}><LogOut size={18} /></button>}</div>
    </aside>
    {sidebar && <button className="sidebar-scrim" onClick={() => setSidebar(false)} aria-label="Close navigation" />}
    <div className="main-shell">
      <header className="topbar">
        <div className="topbar-left"><button className="menu-button" onClick={() => setSidebar(true)} aria-label="Open navigation"><Menu /></button><div><h1>{page}</h1><p>{String(shop.name)} · {String(shop.address)}</p></div></div>
        <div className="topbar-actions"><span className="shop-chip"><Store size={15} />{String(shop.shop_code)}</span>{ownerViewing ? <Link className="button secondary" href="/"><ArrowLeft size={15} /> Factory</Link> : <button className="button secondary" onClick={onSignOut}><LogOut size={15} /> Sign out</button>}</div>
      </header>
      <div className="scroll-area" ref={scroller}>
        <main className="content"><div className="page-transition" key={page}>
          {page === "POS Billing" && <PosBilling {...props} />}
          {page === "Inventory" && <ShopInventory {...props} />}
          {page === "Reports" && <ShopReports {...props} />}
          {page === "Expenses" && <ShopExpenses {...props} />}
          {page === "Attendance" && <ShopAttendance {...props} />}
          {page === "Day Close" && <ShopDayClose {...props} />}
          {page === "Settings" && <ShopSettings {...props} />}
        </div></main>
        <footer>{String(shop.name)} · {String(shop.footer_note)}</footer>
      </div>
    </div>
    {toast && <div className={cx("toast", toast.type)}>{toast.type === "success" ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}<span>{toast.text}</span><button onClick={() => setToast(null)} aria-label="Dismiss"><X size={15} /></button></div>}
  </div>;
}

type ShopProps = {
  shop: Row; inventory: Row[]; sales: Row[]; saleItems: Row[]; expenses: Row[]; attendance: Row[]; dayClose: Row[]; shipments: Row[];
  post: (payload: Record<string, unknown>) => Promise<{ message?: string; invoiceNo?: string; saleId?: number } | null>; saving: boolean;
};

const remainingOf = (row: Row) => number(row.received_qty) - number(row.sold_qty);

function PosBilling({ shop, inventory, sales, saleItems, post, saving }: ShopProps) {
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [form, setForm] = useState({ customerName: "", customerPhone: "", discount: "0", receivedAmount: "", paymentMethod: "Cash", remarks: "" });
  const [error, setError] = useState("");
  const [printed, setPrinted] = useState<Row | null>(null);
  const set = (key: keyof typeof form, value: string) => { setForm((current) => ({ ...current, [key]: value })); setError(""); };

  const inStock = inventory.filter((row) => remainingOf(row) > 0 && (!search || `${row.product_name} ${row.sku}`.toLowerCase().includes(search.toLowerCase())));
  const subtotal = round2(lines.reduce((sum, line) => sum + line.quantity * line.rate, 0));
  const discount = number(form.discount);
  const total = round2(Math.max(0, subtotal - discount));
  const received = number(form.receivedAmount);
  const change = round2(Math.max(0, received - total));
  const balance = round2(Math.max(0, total - received));

  const addLine = (row: Row) => {
    const id = number(row.id);
    setError("");
    setLines((current) => {
      const existing = current.find((line) => line.inventoryId === id);
      if (existing) return current.map((line) => line.inventoryId === id ? { ...line, quantity: Math.min(line.remaining, line.quantity + 1) } : line);
      return [...current, { inventoryId: id, name: String(row.product_name), rate: number(row.sale_rate), quantity: 1, remaining: remainingOf(row) }];
    });
  };
  const setQty = (id: number, quantity: number) => setLines((current) => current.map((line) => line.inventoryId === id ? { ...line, quantity: Math.max(1, Math.min(line.remaining, quantity)) } : line));
  const setRate = (id: number, rate: number) => setLines((current) => current.map((line) => line.inventoryId === id ? { ...line, rate } : line));
  const removeLine = (id: number) => setLines((current) => current.filter((line) => line.inventoryId !== id));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.customerName.trim()) return setError("Customer Name is required on every invoice.");
    if (!form.customerPhone.trim()) return setError("Customer Phone Number is required on every invoice.");
    if (!/^[\d+][\d\s-]{6,}$/.test(form.customerPhone.trim())) return setError("Enter a valid customer phone number.");
    if (!lines.length) return setError("Add at least one product to the invoice.");
    if (discount < 0 || discount > subtotal) return setError("Discount cannot be negative or greater than the subtotal.");
    if (received <= 0) return setError("Enter the amount received from the customer.");
    const result = await post({ action: "pos-sale", shopId: shop.id, ...form, discount, receivedAmount: received, saleDate: today, soldBy: shop.manager, items: lines.map((line) => ({ inventoryId: line.inventoryId, quantity: line.quantity, rate: line.rate })) });
    if (!result) return;
    setPrinted({ invoice_no: result.invoiceNo ?? "", customer_name: form.customerName, customer_phone: form.customerPhone, sale_date: today, subtotal, discount, total_amount: total, received_amount: received, change_amount: change, balance_amount: balance, payment_method: form.paymentMethod });
    setLines([]); setForm({ customerName: "", customerPhone: "", discount: "0", receivedAmount: "", paymentMethod: "Cash", remarks: "" }); setError("");
  };

  const todaySales = sales.filter((row) => String(row.sale_date) === today);
  return <div className="page-stack">
    <SectionHead eyebrow="COUNTER" title="POS Billing" detail="Customer name and phone number are required on every invoice." action={<div className="pos-today"><span>Today<b>{todaySales.length} invoices</b></span><span>Takings<b>{money(todaySales.reduce((sum, row) => sum + number(row.total_amount), 0))}</b></span></div>} />
    <div className="pos-layout">
      <section className="panel pos-products">
        <div className="panel-head"><div><span className="eyebrow">SHOP STOCK</span><h3>Add products</h3></div><span className="record-count">{inStock.length} in stock</span></div>
        <div className="pos-search"><Search size={17} /><input placeholder="Search product or SKU…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className="pos-grid">
          {inStock.map((row) => <button type="button" key={String(row.id)} className="pos-card" onClick={() => addLine(row)}>
            <b>{String(row.product_name)}</b><small>{String(row.sku)}</small>
            <span className="pos-card-foot"><em>{money(row.sale_rate)}</em><i>{fmt(remainingOf(row))} left</i></span>
          </button>)}
        </div>
        {!inStock.length && <Empty title="No stock available" detail="Stock arrives from the factory warehouse and appears here once received." />}
      </section>

      <form className="panel pos-cart" onSubmit={submit}>
        <div className="panel-head"><div><span className="eyebrow">INVOICE</span><h3>Current sale</h3></div>{lines.length > 0 && <button type="button" className="link-button" onClick={() => setLines([])}>Clear all</button>}</div>
        <div className="form-grid pos-customer">
          <Field label="Customer Name *"><input value={form.customerName} onChange={(event) => set("customerName", event.target.value)} placeholder="Required" /></Field>
          <Field label="Customer Phone *"><input value={form.customerPhone} onChange={(event) => set("customerPhone", event.target.value)} placeholder="+92 300 000 0000" /></Field>
        </div>
        <div className="pos-lines">
          {lines.map((line) => <div className="pos-line" key={line.inventoryId}>
            <div><b>{line.name}</b><small>{fmt(line.remaining)} in stock</small></div>
            <div className="pos-qty"><button type="button" onClick={() => setQty(line.inventoryId, line.quantity - 1)} aria-label="Decrease"><Minus size={13} /></button><input type="number" min="1" max={line.remaining} value={line.quantity} onChange={(event) => setQty(line.inventoryId, number(event.target.value))} aria-label={`Quantity for ${line.name}`} /><button type="button" onClick={() => setQty(line.inventoryId, line.quantity + 1)} aria-label="Increase"><Plus size={13} /></button></div>
            <input className="pos-rate" type="number" min="0" value={line.rate} onChange={(event) => setRate(line.inventoryId, number(event.target.value))} aria-label={`Rate for ${line.name}`} />
            <b className="pos-amount">{money(line.quantity * line.rate)}</b>
            <button type="button" className="pos-remove" onClick={() => removeLine(line.inventoryId)} aria-label={`Remove ${line.name}`}><Trash2 size={15} /></button>
          </div>)}
          {!lines.length && <p className="pos-empty">Tap a product to start the invoice.</p>}
        </div>
        <div className="pos-totals">
          <div><span>Subtotal</span><b>{money(subtotal)}</b></div>
          <div><span>Discount</span><input type="number" min="0" value={form.discount} onChange={(event) => set("discount", event.target.value)} aria-label="Discount" /></div>
          <div className="grand"><span>Total</span><b>{money(total)}</b></div>
        </div>
        <div className="form-grid">
          <Field label="Payment Method *"><div className="pay-toggle">{["Cash", "Bank"].map((item) => <button type="button" key={item} className={cx(form.paymentMethod === item && "active")} onClick={() => set("paymentMethod", item)}>{item === "Cash" ? <Banknote size={15} /> : <CreditCard size={15} />}{item}</button>)}</div></Field>
          <Field label="Received Amount *"><input type="number" min="0" value={form.receivedAmount} onChange={(event) => set("receivedAmount", event.target.value)} placeholder={String(total || "")} /></Field>
        </div>
        <div className="pos-change"><span>Change to return<b className="green-text">{money(change)}</b></span><span>Balance due<b className={balance > 0 ? "red-text" : ""}>{money(balance)}</b></span></div>
        {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
        <button className="button primary pos-submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Receipt size={17} />} Save &amp; Print Invoice</button>
      </form>
    </div>

    {printed && <Modal title={`Invoice ${String(printed.invoice_no)}`} subtitle={`${String(printed.customer_name)} · ${String(printed.customer_phone)}`} onClose={() => setPrinted(null)}>
      <div className="confirm-copy"><CheckCircle2 size={18} /><span>Invoice saved. Stock has been reduced and the sale is in today&apos;s takings.</span></div>
      <div className="production-summary"><span><small>TOTAL</small><b>{money(printed.total_amount)}</b></span><span><small>RECEIVED</small><b>{money(printed.received_amount)}</b></span><span><small>CHANGE</small><b className="green-text">{money(printed.change_amount)}</b></span><span><small>METHOD</small><b>{String(printed.payment_method)}</b></span></div>
      <div className="modal-actions"><button className="button secondary" onClick={() => setPrinted(null)}>Close</button><button className="button primary" onClick={() => printInvoice(shop, printed, saleItems.filter((row) => number(row.sale_id) === number(sales[0]?.id)))}><Printer size={16} /> Print Invoice</button></div>
    </Modal>}
  </div>;
}

function printInvoice(shop: Row, sale: Row, items: Row[]) {
  const logo = shop.logo_url ? `<img src="${escapeHtml(shop.logo_url)}" alt="">` : `<div class="mark">${escapeHtml(String(shop.shop_code).slice(-2))}</div>`;
  const rows = items.map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.product_name)}</td><td class="n">${fmt(item.quantity)}</td><td class="n">${money(item.rate)}</td><td class="n">${money(item.amount)}</td></tr>`).join("");
  printDocument(`Invoice ${String(sale.invoice_no)}`,
    `@page{size:80mm auto;margin:5mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#141d2d;margin:0;font-size:11px;width:70mm}
     header{text-align:center;border-bottom:2px dashed #b9c2cc;padding-bottom:9px;margin-bottom:9px}
     header img,.mark{width:52px;height:52px;object-fit:contain;margin:0 auto 6px;display:block;border-radius:8px}
     .mark{background:#118969;color:#fff;display:grid;place-items:center;font-size:19px;font-weight:800}
     h1{font-size:15px;margin:0 0 3px}header p,header small{margin:0;color:#5b6879;display:block;font-size:9px}
     .meta{display:flex;justify-content:space-between;font-size:9px;color:#5b6879;margin-bottom:8px}
     .cust{border:1px dashed #c6ced8;padding:7px;margin-bottom:9px;font-size:10px}
     table{width:100%;border-collapse:collapse;margin-bottom:9px}
     th{border-bottom:1px solid #141d2d;text-align:left;padding:4px 3px;font-size:9px}
     td{padding:4px 3px;border-bottom:1px dotted #d7dde4}
     td.n,th.n{text-align:right}
     .tot{border-top:2px dashed #b9c2cc;padding-top:8px}
     .tot div{display:flex;justify-content:space-between;padding:2px 0}
     .tot .grand{font-size:14px;font-weight:800;border-top:1px solid #141d2d;margin-top:5px;padding-top:5px}
     footer{text-align:center;margin-top:12px;border-top:2px dashed #b9c2cc;padding-top:8px;color:#5b6879;font-size:9px}`,
    `<header>${logo}<h1>${escapeHtml(shop.name)}</h1><p>${escapeHtml(shop.address)}</p><small>${escapeHtml(shop.phone)}</small></header>
     <div class="meta"><span>${escapeHtml(sale.invoice_no)}</span><span>${escapeHtml(formatDate(sale.sale_date))}</span></div>
     <div class="cust"><b>${escapeHtml(sale.customer_name)}</b><br>${escapeHtml(sale.customer_phone)}</div>
     <table><thead><tr><th>#</th><th>Product</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table>
     <div class="tot">
       <div><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
       <div><span>Discount</span><span>− ${money(sale.discount)}</span></div>
       <div class="grand"><span>Total</span><span>${money(sale.total_amount)}</span></div>
       <div><span>Received (${escapeHtml(sale.payment_method)})</span><span>${money(sale.received_amount)}</span></div>
       <div><span>Change</span><span>${money(sale.change_amount)}</span></div>
       ${number(sale.balance_amount) > 0 ? `<div><span>Balance due</span><span>${money(sale.balance_amount)}</span></div>` : ""}
     </div>
     <footer>${escapeHtml(shop.footer_note)}<br>Served by ${escapeHtml(shop.manager)}</footer>`);
}

function ShopInventory({ shop, inventory, shipments, post, saving }: ShopProps) {
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [receiving, setReceiving] = useState<Row | null>(null);
  const rows = inventory.filter((row) => !filter || (filter === "Sold Out" ? remainingOf(row) <= 0 : filter === "In Stock" ? remainingOf(row) > 0 : true));
  const pending = shipments.filter((row) => String(row.status) !== "Received");
  const received = inventory.reduce((sum, row) => sum + number(row.received_qty), 0);
  const sold = inventory.reduce((sum, row) => sum + number(row.sold_qty), 0);
  const nonReceivable = inventory.reduce((sum, row) => sum + number(row.non_receivable_qty), 0);
  const stockValue = inventory.reduce((sum, row) => sum + remainingOf(row) * number(row.sale_rate), 0);

  return <div className="page-stack">
    <SectionHead eyebrow="SHOP STOCK" title="Inventory" detail="Everything shipped from the factory warehouse, what has sold and what remains." action={<button className="button secondary" onClick={() => downloadCsv([["Product", "SKU", "Received", "Sold", "Remaining", "Non-Receivable", "Rate", "Stock Value", "Status"], ...inventory.map((row) => [String(row.product_name), String(row.sku), String(number(row.received_qty)), String(number(row.sold_qty)), String(remainingOf(row)), String(number(row.non_receivable_qty)), String(number(row.sale_rate)), String(round2(remainingOf(row) * number(row.sale_rate))), remainingOf(row) > 0 ? "In Stock" : "Sold Out"])], `${String(shop.shop_code)}-Inventory`)}><Download size={16} /> Export</button>} />

    <section className="dept-summary">
      <article><span>Received from factory</span><b>{fmt(received)}</b><div className="micro-line blue"><i style={{ width: "100%" }} /></div></article>
      <article><span>Sold out</span><b>{fmt(sold)}</b><div className="micro-line green"><i style={{ width: `${received ? sold / received * 100 : 0}%` }} /></div></article>
      <article><span>Remaining stock</span><b>{fmt(received - sold)}</b><div className="micro-line orange"><i style={{ width: `${received ? (received - sold) / received * 100 : 0}%` }} /></div></article>
      <article><span>Non-receivable</span><b>{fmt(nonReceivable)}</b><div className="micro-line blue"><i style={{ width: "100%" }} /></div></article>
      <article><span>Stock value</span><b>{money(stockValue)}</b><div className="micro-line green"><i style={{ width: "100%" }} /></div></article>
    </section>

    {pending.length > 0 && <article className="panel table-panel warehouse-incoming">
      <div className="panel-head"><div><span className="eyebrow">INCOMING FROM WAREHOUSE</span><h3>Confirm what arrived</h3></div><span className="record-count">{pending.length} in transit</span></div>
      <div className="table-scroll"><table><thead><tr><th>Shipment</th><th>Product</th><th>Lot</th><th>Sent QTY</th><th>Cartons</th><th>Sent Date</th><th>Status</th><th className="right">Action</th></tr></thead>
        <tbody>{pending.map((row) => <tr key={String(row.id)}><td><b>{String(row.shipment_no)}</b></td><td>{String(row.product_name)}</td><td>{String(row.lot_no)}</td><td><b>{fmt(row.quantity)}</b> PCS</td><td>{fmt(row.cartons)}</td><td>{formatDate(row.sent_date)}</td><td><StatusBadge status={row.status} /></td><td className="right"><button className="table-action" onClick={() => setReceiving(row)}>Received <ClipboardCheck size={14} /></button></td></tr>)}</tbody></table></div>
    </article>}

    <div className="filter-bar"><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter stock"><option value="">All products</option><option>In Stock</option><option>Sold Out</option></select><span className="record-count">{rows.length} products</span></div>

    <article className="panel table-panel">
      <div className="panel-head"><div><span className="eyebrow">FULL STOCK STATUS</span><h3>Sold and remaining</h3></div><span className="live-indicator"><i /> Live</span></div>
      <div className="table-scroll"><table><thead><tr><th>Product</th><th>SKU / Lot</th><th>Received</th><th>Sold Out</th><th>Remaining</th><th>Non-Receivable</th><th>Sale Rate</th><th>Stock Value</th><th>Progress</th><th>Status</th><th className="right">Action</th></tr></thead>
        <tbody>{rows.map((row) => { const remaining = remainingOf(row); const soldPct = number(row.received_qty) ? number(row.sold_qty) / number(row.received_qty) * 100 : 0; return <tr key={String(row.id)}>
          <td><b>{String(row.product_name)}</b></td><td>{String(row.sku)}<small className="cell-sub">{String(row.lot_no || "—")}</small></td>
          <td><b>{fmt(row.received_qty)}</b></td><td><b className="green-text">{fmt(row.sold_qty)}</b></td><td><b className={remaining > 0 ? "" : "red-text"}>{fmt(remaining)}</b></td>
          <td><b className={number(row.non_receivable_qty) ? "red-text" : ""}>{fmt(row.non_receivable_qty)}</b></td>
          <td>{money(row.sale_rate)}</td><td>{money(remaining * number(row.sale_rate))}</td>
          <td><div className="progress-wrap compact"><div className="progress-track"><span style={{ width: `${Math.min(100, soldPct)}%` }} /></div><b>{Math.round(soldPct)}%</b></div></td>
          <td><StatusBadge status={remaining > 0 ? "In Stock" : "Sold Out"} /></td>
          <td className="right"><div className="row-actions"><button title="Edit rate" aria-label="Edit rate" onClick={() => setEditing(row)}><Save size={15} /></button></div></td></tr>; })}</tbody></table></div>
      {!rows.length && <Empty title="No stock yet" detail="The factory warehouse ships lots to this shop; confirm them above and they appear here." />}
    </article>

    {editing && <Modal title={`Edit ${String(editing.product_name)}`} subtitle="Changing shop stock alerts the owner automatically." onClose={() => setEditing(null)}>
      <EditStockForm row={editing} shop={shop} post={post} saving={saving} onDone={() => setEditing(null)} />
    </Modal>}
    {receiving && <Modal title={`Receive ${String(receiving.shipment_no)}`} subtitle={`${String(receiving.product_name)} · ${fmt(receiving.quantity)} PCS sent`} onClose={() => setReceiving(null)} wide>
      <ReceiveShipmentForm shipment={receiving} shop={shop} post={post} saving={saving} onDone={() => setReceiving(null)} />
    </Modal>}
  </div>;
}

function EditStockForm({ row, shop, post, saving, onDone }: { row: Row; shop: Row; post: ShopProps["post"]; saving: boolean; onDone: () => void }) {
  const [form, setForm] = useState({ productName: String(row.product_name), saleRate: String(number(row.sale_rate)) });
  const [error, setError] = useState("");
  return <form onSubmit={async (event) => {
    event.preventDefault();
    if (number(form.saleRate) <= 0) return setError("Sale Rate must be greater than zero.");
    const done = await post({ action: "save-shop-inventory", shopId: shop.id, inventoryId: row.id, actor: shop.manager, ...form, saleRate: number(form.saleRate) });
    if (done) onDone();
  }}>
    <div className="form-grid">
      <Field label="Product Name" span><input value={form.productName} onChange={(event) => setForm({ ...form, productName: event.target.value })} /></Field>
      <Field label="Sale Rate (Rs) *"><input type="number" min="0" value={form.saleRate} onChange={(event) => { setForm({ ...form, saleRate: event.target.value }); setError(""); }} /></Field>
      <Field label="Remaining"><input value={`${fmt(remainingOf(row))} PCS`} disabled /></Field>
    </div>
    {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
    <div className="confirm-copy"><AlertTriangle size={18} /><span>The owner receives an alert whenever shop stock is edited or removed.</span></div>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onDone}>Cancel</button><button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />} Save Changes</button></div>
  </form>;
}

function ReceiveShipmentForm({ shipment, shop, post, saving, onDone }: { shipment: Row; shop: Row; post: ShopProps["post"]; saving: boolean; onDone: () => void }) {
  const sent = number(shipment.quantity);
  const [form, setForm] = useState({ receivableQty: String(sent), nonReceivableQty: "0", nonReceivableReason: "", receivedBy: String(shop.manager), receivedDate: today, remarks: "" });
  const [error, setError] = useState("");
  const receivable = number(form.receivableQty); const nonReceivable = number(form.nonReceivableQty); const counted = receivable + nonReceivable;
  return <form onSubmit={async (event) => {
    event.preventDefault();
    if (!form.receivedBy.trim()) return setError("Received By is required.");
    if (receivable <= 0) return setError("Receivable PCS must be greater than zero.");
    if (counted !== sent) return setError(`Receivable plus non-receivable PCS must equal the ${fmt(sent)} PCS sent.`);
    if (nonReceivable > 0 && !form.nonReceivableReason.trim()) return setError("Add a reason for the non-receivable PCS.");
    const done = await post({ action: "receive-shop-shipment", shipmentId: shipment.id, ...form, receivableQty: receivable, nonReceivableQty: nonReceivable });
    if (done) onDone();
  }}>
    <div className="warehouse-available"><ClipboardCheck /><span><small>SENT FROM WAREHOUSE</small><b>{fmt(sent)} PCS</b></span><span><small>COUNTED NOW</small><b className={counted === sent ? "green-text" : "orange-text"}>{fmt(counted)} PCS</b></span><span><small>DIFFERENCE</small><b className={counted === sent ? "green-text" : "red-text"}>{fmt(sent - counted)} PCS</b></span></div>
    <div className="receive-split">
      <label className="receive-box receivable"><span><CheckCircle2 size={15} /> Receivable PCS *</span><input type="number" min="0" max={sent} value={form.receivableQty} onChange={(event) => { const value = event.target.value; setForm((current) => ({ ...current, receivableQty: value, nonReceivableQty: String(Math.max(0, sent - number(value))) })); setError(""); }} /><small>Added to this shop&apos;s sellable stock.</small></label>
      <label className="receive-box non-receivable"><span><AlertTriangle size={15} /> Non-Receivable PCS</span><input type="number" min="0" max={sent} value={form.nonReceivableQty} onChange={(event) => { const value = event.target.value; setForm((current) => ({ ...current, nonReceivableQty: value, receivableQty: String(Math.max(0, sent - number(value))) })); setError(""); }} /><small>Damaged or short pieces held out of stock.</small></label>
    </div>
    <div className="form-grid">
      <Field label="Received By *"><input value={form.receivedBy} onChange={(event) => { setForm({ ...form, receivedBy: event.target.value }); setError(""); }} /></Field>
      <Field label="Received Date *"><input type="date" value={form.receivedDate} onChange={(event) => setForm({ ...form, receivedDate: event.target.value })} /></Field>
      <Field label={`Non-Receivable Reason ${nonReceivable > 0 ? "*" : ""}`} span><input placeholder="e.g. 8 PCS stitching fault returned to factory" value={form.nonReceivableReason} onChange={(event) => { setForm({ ...form, nonReceivableReason: event.target.value }); setError(""); }} disabled={nonReceivable <= 0} /></Field>
      <Field label="Remarks" span><input value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} /></Field>
    </div>
    {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
    <div className="confirm-copy"><CheckCircle2 size={18} /><span>Confirming adds <b>{fmt(receivable)} PCS</b> to shop stock{nonReceivable > 0 ? <> and reports <b>{fmt(nonReceivable)} non-receivable PCS</b> back to the owner</> : null}.</span></div>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onDone}>Cancel</button><button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />} Received <ClipboardCheck size={16} /></button></div>
  </form>;
}

function ShopReports({ shop, inventory, sales, saleItems, expenses, post, saving }: ShopProps) {
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const rows = sales.filter((row) => String(row.sale_date) >= from && String(row.sale_date) <= to);
  const periodExpenses = expenses.filter((row) => String(row.expense_date) >= from && String(row.expense_date) <= to);
  const totalSales = rows.reduce((sum, row) => sum + number(row.total_amount), 0);
  const cash = rows.filter((row) => row.payment_method === "Cash").reduce((sum, row) => sum + number(row.total_amount), 0);
  const bank = totalSales - cash;
  const expenseTotal = periodExpenses.reduce((sum, row) => sum + number(row.amount), 0);
  const ids = new Set(rows.map((row) => number(row.id)));
  const soldUnits = saleItems.filter((row) => ids.has(number(row.sale_id))).reduce((sum, row) => sum + number(row.quantity), 0);

  // Best sellers over the chosen range, from the invoice lines themselves.
  const byProduct = new Map<string, { qty: number; amount: number }>();
  for (const item of saleItems.filter((row) => ids.has(number(row.sale_id)))) {
    const key = String(item.product_name);
    const current = byProduct.get(key) ?? { qty: 0, amount: 0 };
    byProduct.set(key, { qty: current.qty + number(item.quantity), amount: current.amount + number(item.amount) });
  }
  const best = [...byProduct.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.amount - a.amount).slice(0, 6);
  const maxAmount = Math.max(...best.map((row) => row.amount), 1);

  return <div className="page-stack">
    <SectionHead eyebrow="PERFORMANCE" title="Reports" detail="Sales, payment split, expenses and best sellers for the chosen range." action={<div className="action-group wrap">
      <button className="button secondary" onClick={() => downloadCsv([["Invoice", "Date", "Customer", "Phone", "Subtotal", "Discount", "Total", "Received", "Change", "Method"], ...rows.map((row) => [String(row.invoice_no), String(row.sale_date), String(row.customer_name), String(row.customer_phone), String(number(row.subtotal)), String(number(row.discount)), String(number(row.total_amount)), String(number(row.received_amount)), String(number(row.change_amount)), String(row.payment_method)]), [], ["", "TOTAL", "", "", "", "", String(round2(totalSales))]], `${String(shop.shop_code)}-Sales-${from}_${to}`)}><Download size={16} /> Export</button>
      <button className="button secondary" onClick={() => printSalesReport(shop, rows, { from, to, totalSales, cash, bank, expenseTotal, soldUnits })}><Printer size={16} /> Print / PDF</button>
    </div>} />

    <div className="filter-bar"><Field label="From"><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field><Field label="To"><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field><span className="record-count">{rows.length} invoices</span></div>

    <section className="dept-summary">
      <article><span>Total sales</span><b>{money(totalSales)}</b><div className="micro-line green"><i style={{ width: "100%" }} /></div></article>
      <article><span>Cash sales</span><b>{money(cash)}</b><div className="micro-line green"><i style={{ width: `${totalSales ? cash / totalSales * 100 : 0}%` }} /></div></article>
      <article><span>Bank sales</span><b>{money(bank)}</b><div className="micro-line blue"><i style={{ width: `${totalSales ? bank / totalSales * 100 : 0}%` }} /></div></article>
      <article><span>Expenses</span><b>{money(expenseTotal)}</b><div className="micro-line orange"><i style={{ width: `${totalSales ? Math.min(100, expenseTotal / totalSales * 100) : 0}%` }} /></div></article>
      <article><span>Net takings</span><b>{money(totalSales - expenseTotal)}</b><div className="micro-line green"><i style={{ width: "100%" }} /></div></article>
    </section>

    <article className="panel">
      <div className="panel-head"><div><span className="eyebrow">BEST SELLERS</span><h3>Top products by value</h3></div><span className="record-count">{fmt(soldUnits)} PCS sold</span></div>
      <div className="payroll-bars">{best.map((row) => <div className="payroll-bar" key={row.name}>
        <div className="payroll-bar-head"><b>{row.name}</b><span>{fmt(row.qty)} PCS</span></div>
        <div className="payroll-track"><i className="fill green" style={{ width: `${Math.max(3, row.amount / maxAmount * 100)}%` }} /></div>
        <div className="payroll-bar-foot"><span>Value <b>{money(row.amount)}</b></span></div>
      </div>)}</div>
      {!best.length && <Empty title="No sales in this range" detail="Pick a wider date range or record a sale in POS Billing." />}
    </article>

    <article className="panel table-panel">
      <div className="panel-head"><div><span className="eyebrow">INVOICE REGISTER</span><h3>{from} to {to}</h3></div><span className="record-count">{rows.length} invoices</span></div>
      <div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Phone</th><th>Items</th><th>Total</th><th>Received</th><th>Change</th><th>Method</th><th className="right">Action</th></tr></thead>
        <tbody>{rows.map((row) => { const lines = saleItems.filter((item) => number(item.sale_id) === number(row.id)); return <tr key={String(row.id)}>
          <td><b>{String(row.invoice_no)}</b></td><td>{formatDate(row.sale_date)}</td><td>{String(row.customer_name)}</td><td>{String(row.customer_phone)}</td>
          <td>{lines.length}</td><td><b>{money(row.total_amount)}</b></td><td>{money(row.received_amount)}</td><td>{money(row.change_amount)}</td><td><StatusBadge status={row.payment_method} /></td>
          <td className="right"><div className="row-actions"><button title="Print invoice" aria-label="Print invoice" onClick={() => printInvoice(shop, row, lines)}><Printer size={15} /></button><button title="Delete invoice" aria-label="Delete invoice" disabled={saving} onClick={() => void post({ action: "delete-sale", saleId: row.id, actor: shop.manager })}><Trash2 size={15} /></button></div></td></tr>; })}</tbody></table></div>
      {!rows.length && <Empty title="No invoices in this range" detail="Sales recorded in POS Billing appear here." />}
    </article>

    <article className="panel table-panel">
      <div className="panel-head"><div><span className="eyebrow">STOCK MOVEMENT</span><h3>Sold out and remaining</h3></div></div>
      <div className="table-scroll"><table><thead><tr><th>Product</th><th>Received</th><th>Sold</th><th>Remaining</th><th>Sell-through</th><th>Status</th></tr></thead>
        <tbody>{inventory.map((row) => <tr key={String(row.id)}><td><b>{String(row.product_name)}</b><small className="cell-sub">{String(row.sku)}</small></td><td>{fmt(row.received_qty)}</td><td className="green-text">{fmt(row.sold_qty)}</td><td>{fmt(remainingOf(row))}</td><td>{number(row.received_qty) ? Math.round(number(row.sold_qty) / number(row.received_qty) * 100) : 0}%</td><td><StatusBadge status={remainingOf(row) > 0 ? "In Stock" : "Sold Out"} /></td></tr>)}</tbody></table></div>
    </article>
  </div>;
}

function printSalesReport(shop: Row, rows: Row[], summary: { from: string; to: string; totalSales: number; cash: number; bank: number; expenseTotal: number; soldUnits: number }) {
  const body = rows.map((row, index) => `<tr><td class="n">${index + 1}</td><td>${escapeHtml(row.invoice_no)}</td><td>${escapeHtml(formatDate(row.sale_date))}</td><td>${escapeHtml(row.customer_name)}</td><td>${escapeHtml(row.customer_phone)}</td><td>${escapeHtml(row.payment_method)}</td><td class="n">${money(row.total_amount)}</td></tr>`).join("");
  printDocument(`${String(shop.name)} — Sales ${summary.from} to ${summary.to}`,
    `@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172333;font-size:11px;margin:0}
     .sheet{border:1px solid #cad2da;padding:22px}header{display:flex;justify-content:space-between;border-bottom:3px solid #118969;padding-bottom:14px;margin-bottom:16px}
     h1{font-size:19px;margin:0 0 4px}header p,header small{margin:0;color:#647184;display:block}.type{text-align:right}.type span{color:#118969;font-weight:800;letter-spacing:1.3px;font-size:9px;display:block}.type b{display:block;font-size:16px;margin:5px 0}
     .cards{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;margin-bottom:16px}
     .card{border:1px solid #dbe1e6;border-radius:7px;padding:10px}.card small{color:#798594;font-size:9px;display:block}.card b{font-size:14px;display:block;margin-top:4px}
     table{width:100%;border-collapse:collapse}th{background:#172b3f;color:#fff;text-align:left;padding:7px 8px;font-size:9px}td{border:1px solid #dbe1e6;padding:6px 8px}td.n,th.n{text-align:right}
     tr.total td{background:#e9f6f1;font-weight:800;color:#08795d}
     footer{text-align:center;border-top:1px solid #dbe1e6;margin-top:18px;padding-top:10px;color:#6f7a89;font-size:9px}`,
    `<main class="sheet"><header><div><h1>${escapeHtml(shop.name)}</h1><p>${escapeHtml(shop.address)}</p><small>${escapeHtml(shop.phone)}</small></div>
      <div class="type"><span>SALES REPORT</span><b>${escapeHtml(summary.from)} → ${escapeHtml(summary.to)}</b><small>${escapeHtml(shop.shop_code)}</small></div></header>
      <section class="cards">
        <div class="card"><small>INVOICES</small><b>${rows.length}</b></div>
        <div class="card"><small>PCS SOLD</small><b>${fmt(summary.soldUnits)}</b></div>
        <div class="card"><small>CASH</small><b>${money(summary.cash)}</b></div>
        <div class="card"><small>BANK</small><b>${money(summary.bank)}</b></div>
        <div class="card"><small>NET TAKINGS</small><b>${money(summary.totalSales - summary.expenseTotal)}</b></div>
      </section>
      <table><thead><tr><th class="n">#</th><th>Invoice</th><th>Date</th><th>Customer</th><th>Phone</th><th>Method</th><th class="n">Total</th></tr></thead>
        <tbody>${body || `<tr><td colspan="7">No invoices in this range.</td></tr>`}
        <tr class="total"><td colspan="6">Total sales · less expenses ${money(summary.expenseTotal)}</td><td class="n">${money(summary.totalSales)}</td></tr></tbody></table>
      <footer>${escapeHtml(shop.footer_note)}</footer></main>`);
}

function ShopExpenses({ shop, expenses, post, saving }: ShopProps) {
  const [form, setForm] = useState({ expenseDate: today, category: "General", description: "", amount: "", paidBy: String(shop.manager), paymentMethod: "Cash" });
  const [error, setError] = useState("");
  const monthExpenses = expenses.filter((row) => String(row.expense_date).startsWith(today.slice(0, 7)));
  const total = monthExpenses.reduce((sum, row) => sum + number(row.amount), 0);
  return <div className="page-stack">
    <SectionHead eyebrow="SHOP COSTS" title="Expenses" detail="Daily running costs; they are deducted from the cash drawer at day close." action={<button className="button secondary" onClick={() => downloadCsv([["Date", "Category", "Description", "Paid By", "Method", "Amount"], ...expenses.map((row) => [String(row.expense_date), String(row.category), String(row.description), String(row.paid_by), String(row.payment_method), String(number(row.amount))])], `${String(shop.shop_code)}-Expenses`)}><Download size={16} /> Export</button>} />
    <form className="theka-form" onSubmit={async (event) => {
      event.preventDefault();
      if (!form.description.trim()) return setError("Description is required.");
      if (number(form.amount) <= 0) return setError("Amount must be greater than zero.");
      const done = await post({ action: "save-shop-expense", shopId: shop.id, ...form, amount: number(form.amount) });
      if (done) { setForm({ ...form, description: "", amount: "" }); setError(""); }
    }}>
      <div className="theka-grid">
        <Field label="Date"><input type="date" value={form.expenseDate} onChange={(event) => setForm({ ...form, expenseDate: event.target.value })} /></Field>
        <Field label="Category"><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{expenseCategories.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Description *"><input placeholder="e.g. Shop electricity bill" value={form.description} onChange={(event) => { setForm({ ...form, description: event.target.value }); setError(""); }} /></Field>
        <Field label="Amount (Rs) *"><input type="number" min="0" placeholder="0" value={form.amount} onChange={(event) => { setForm({ ...form, amount: event.target.value }); setError(""); }} /></Field>
      </div>
      <div className="theka-grid lower">
        <Field label="Paid By"><input value={form.paidBy} onChange={(event) => setForm({ ...form, paidBy: event.target.value })} /></Field>
        <Field label="Payment Method"><select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}><option>Cash</option><option>Bank</option></select></Field>
        <div className="theka-total"><small>This Month</small><b>{money(total)}</b><span>{monthExpenses.length} entries</span></div>
        <button className="button primary theka-add" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Plus size={17} />} Add Expense</button>
      </div>
      {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
    </form>
    <article className="panel table-panel">
      <div className="panel-head"><div><span className="eyebrow">EXPENSE REGISTER</span><h3>Recent expenses</h3></div><span className="record-count">{expenses.length} records</span></div>
      <div className="table-scroll"><table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Paid By</th><th>Method</th><th>Amount</th><th className="right">Action</th></tr></thead>
        <tbody>{expenses.map((row) => <tr key={String(row.id)}><td>{formatDate(row.expense_date)}</td><td>{String(row.category)}</td><td>{String(row.description)}</td><td>{String(row.paid_by)}</td><td><StatusBadge status={row.payment_method} /></td><td><b className="red-text">{money(row.amount)}</b></td><td className="right"><div className="row-actions"><button title="Delete expense" aria-label="Delete expense" disabled={saving} onClick={() => void post({ action: "delete-shop-expense", shopId: shop.id, expenseId: row.id, actor: shop.manager })}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>
      {!expenses.length && <Empty title="No expenses yet" detail="Record the shop's running costs above." />}
    </article>
  </div>;
}

function ShopAttendance({ shop, attendance, post, saving }: ShopProps) {
  const [form, setForm] = useState({ staffName: "", attendanceDate: today, status: "Present", inTime: "10:00", outTime: "21:00", remarks: "" });
  const [error, setError] = useState("");
  const forDate = attendance.filter((row) => String(row.attendance_date) === form.attendanceDate);
  const names = [...new Set(attendance.map((row) => String(row.staff_name)))];
  return <div className="page-stack">
    <SectionHead eyebrow="SHOP TEAM" title="Attendance" detail="Daily attendance for the counter and floor staff at this shop." action={<button className="button secondary" onClick={() => downloadCsv([["Date", "Staff", "Status", "In", "Out", "Remarks"], ...attendance.map((row) => [String(row.attendance_date), String(row.staff_name), String(row.status), String(row.in_time), String(row.out_time), String(row.remarks)])], `${String(shop.shop_code)}-Attendance`)}><Download size={16} /> Export</button>} />
    <form className="theka-form" onSubmit={async (event) => {
      event.preventDefault();
      if (!form.staffName.trim()) return setError("Staff Name is required.");
      const done = await post({ action: "save-shop-attendance", shopId: shop.id, ...form });
      if (done) { setForm({ ...form, staffName: "", remarks: "" }); setError(""); }
    }}>
      <div className="theka-grid">
        <Field label="Staff Name *"><input list="shop-staff" placeholder="e.g. Ayesha Bibi" value={form.staffName} onChange={(event) => { setForm({ ...form, staffName: event.target.value }); setError(""); }} /><datalist id="shop-staff">{names.map((name) => <option key={name} value={name} />)}</datalist></Field>
        <Field label="Date"><input type="date" value={form.attendanceDate} onChange={(event) => setForm({ ...form, attendanceDate: event.target.value })} /></Field>
        <Field label="Status"><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{attendanceStatuses.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Remarks"><input value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} /></Field>
      </div>
      <div className="theka-grid lower">
        <Field label="In Time"><input type="time" value={form.inTime} onChange={(event) => setForm({ ...form, inTime: event.target.value })} /></Field>
        <Field label="Out Time"><input type="time" value={form.outTime} onChange={(event) => setForm({ ...form, outTime: event.target.value })} /></Field>
        <div className="theka-total"><small>Marked on {form.attendanceDate}</small><b>{forDate.length}</b><span>{forDate.filter((row) => row.status === "Present").length} present</span></div>
        <button className="button primary theka-add" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Check size={17} />} Save Attendance</button>
      </div>
      {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
    </form>
    <article className="panel table-panel">
      <div className="panel-head"><div><span className="eyebrow">ATTENDANCE REGISTER</span><h3>Recent records</h3></div><span className="record-count">{attendance.length} records</span></div>
      <div className="table-scroll"><table><thead><tr><th>Date</th><th>Staff</th><th>Status</th><th>In / Out</th><th>Remarks</th></tr></thead>
        <tbody>{attendance.map((row) => <tr key={String(row.id)}><td>{formatDate(row.attendance_date)}</td><td><b>{String(row.staff_name)}</b></td><td><StatusBadge status={row.status} /></td><td>{String(row.in_time || "—")} / {String(row.out_time || "—")}</td><td>{String(row.remarks || "—")}</td></tr>)}</tbody></table></div>
      {!attendance.length && <Empty title="No attendance recorded" detail="Mark the shop team above." />}
    </article>
  </div>;
}

function ShopDayClose({ shop, sales, expenses, dayClose, post, saving }: ShopProps) {
  const [form, setForm] = useState({ closeDate: today, openingCash: String(number(shop.opening_cash)), countedCash: "", closedBy: String(shop.manager), remarks: "" });
  const [error, setError] = useState("");
  const daySales = sales.filter((row) => String(row.sale_date) === form.closeDate);
  const dayExpenses = expenses.filter((row) => String(row.expense_date) === form.closeDate);
  const cash = daySales.filter((row) => row.payment_method === "Cash").reduce((sum, row) => sum + number(row.received_amount) - number(row.change_amount), 0);
  const bank = daySales.filter((row) => row.payment_method === "Bank").reduce((sum, row) => sum + number(row.total_amount), 0);
  const expenseTotal = dayExpenses.reduce((sum, row) => sum + number(row.amount), 0);
  const expected = round2(number(form.openingCash) + cash - expenseTotal);
  const difference = round2(number(form.countedCash) - expected);

  return <div className="page-stack">
    <SectionHead eyebrow="END OF DAY" title="Day Close" detail="Count the drawer against the day's cash sales and expenses." />
    <section className="dept-summary">
      <article><span>Invoices</span><b>{daySales.length}</b><div className="micro-line blue"><i style={{ width: "100%" }} /></div></article>
      <article><span>Cash sales</span><b>{money(cash)}</b><div className="micro-line green"><i style={{ width: "100%" }} /></div></article>
      <article><span>Bank sales</span><b>{money(bank)}</b><div className="micro-line blue"><i style={{ width: "100%" }} /></div></article>
      <article><span>Expenses</span><b>{money(expenseTotal)}</b><div className="micro-line orange"><i style={{ width: "100%" }} /></div></article>
      <article><span>Expected in drawer</span><b>{money(expected)}</b><div className="micro-line green"><i style={{ width: "100%" }} /></div></article>
    </section>
    <form className="theka-form" onSubmit={async (event) => {
      event.preventDefault();
      if (number(form.countedCash) < 0) return setError("Counted Cash cannot be negative.");
      if (!form.countedCash) return setError("Enter the cash counted in the drawer.");
      const done = await post({ action: "shop-day-close", shopId: shop.id, ...form, openingCash: number(form.openingCash), countedCash: number(form.countedCash) });
      if (done) setError("");
    }}>
      <div className="theka-grid">
        <Field label="Close Date"><input type="date" value={form.closeDate} onChange={(event) => setForm({ ...form, closeDate: event.target.value })} /></Field>
        <Field label="Opening Cash (Rs)"><input type="number" min="0" value={form.openingCash} onChange={(event) => setForm({ ...form, openingCash: event.target.value })} /></Field>
        <Field label="Counted Cash (Rs) *"><input type="number" min="0" placeholder="Count the drawer" value={form.countedCash} onChange={(event) => { setForm({ ...form, countedCash: event.target.value }); setError(""); }} /></Field>
        <Field label="Closed By"><input value={form.closedBy} onChange={(event) => setForm({ ...form, closedBy: event.target.value })} /></Field>
      </div>
      <div className="theka-grid lower">
        <Field label="Remarks" span><input value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} /></Field>
        <div className={cx("theka-total", form.countedCash && Math.abs(difference) > 0.5 && "off")}><small>Difference</small><b>{form.countedCash ? money(difference) : "—"}</b><span>{form.countedCash ? (Math.abs(difference) <= 0.5 ? "Drawer balanced" : difference > 0 ? "Cash over" : "Cash short") : "Enter counted cash"}</span></div>
        <button className="button primary theka-add" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <ClipboardCheck size={17} />} Close Day</button>
      </div>
      {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
    </form>
    <article className="panel table-panel">
      <div className="panel-head"><div><span className="eyebrow">DAY CLOSE HISTORY</span><h3>Previous closings</h3></div><span className="record-count">{dayClose.length} days</span></div>
      <div className="table-scroll"><table><thead><tr><th>Date</th><th>Invoices</th><th>Cash</th><th>Bank</th><th>Total Sales</th><th>Expenses</th><th>Expected</th><th>Counted</th><th>Difference</th><th>Closed By</th></tr></thead>
        <tbody>{dayClose.map((row) => <tr key={String(row.id)}><td>{formatDate(row.close_date)}</td><td>{fmt(row.invoices)}</td><td>{money(row.cash_sales)}</td><td>{money(row.bank_sales)}</td><td><b>{money(row.total_sales)}</b></td><td className="red-text">{money(row.expenses)}</td><td>{money(row.expected_cash)}</td><td>{money(row.counted_cash)}</td><td><b className={Math.abs(number(row.difference)) > 0.5 ? "red-text" : "green-text"}>{money(row.difference)}</b></td><td>{String(row.closed_by)}</td></tr>)}</tbody></table></div>
      {!dayClose.length && <Empty title="No day closed yet" detail="Close the first day above and the history builds here." />}
    </article>
  </div>;
}

function ShopSettings({ shop, post, saving }: ShopProps) {
  const [form, setForm] = useState({ name: String(shop.name), address: String(shop.address), phone: String(shop.phone), manager: String(shop.manager), logoUrl: String(shop.logo_url || ""), invoicePrefix: String(shop.invoice_prefix), footerNote: String(shop.footer_note), openingCash: String(number(shop.opening_cash)), status: String(shop.status) });
  const [error, setError] = useState("");
  const logoInput = useRef<HTMLInputElement | null>(null);
  const set = (key: keyof typeof form, value: string) => { setForm((current) => ({ ...current, [key]: value })); setError(""); };
  return <div className="page-stack">
    <SectionHead eyebrow="SHOP PROFILE" title="Settings" detail="The name, logo and footer printed on every invoice from this counter." />
    <form className="panel settings-panel" onSubmit={async (event) => {
      event.preventDefault();
      if (!form.name.trim() || !form.address.trim() || !form.phone.trim() || !form.manager.trim()) return setError("Name, address, phone and manager are all required.");
      await post({ action: "save-shop", shopId: shop.id, ...form, openingCash: number(form.openingCash) });
    }}>
      <div className="settings-section">
        <div><h3>Shop identity</h3><p>This appears at the top of every printed invoice.</p></div>
        <div className="company-settings">
          <div className="company-logo-preview">{form.logoUrl ? <img src={form.logoUrl} alt="Shop logo preview" /> : <span className="logo-mark">{String(shop.shop_code).slice(-2)}</span>}<small><Image size={14} /> Logo preview</small></div>
          <div className="form-grid">
            <Field label="Shop Name *"><input value={form.name} onChange={(event) => set("name", event.target.value)} /></Field>
            <Field label="Phone *"><input value={form.phone} onChange={(event) => set("phone", event.target.value)} /></Field>
            <Field label="Address *" span><input value={form.address} onChange={(event) => set("address", event.target.value)} /></Field>
            <Field label="Manager *"><input value={form.manager} onChange={(event) => set("manager", event.target.value)} /></Field>
            <Field label="Opening Cash (Rs)"><input type="number" min="0" value={form.openingCash} onChange={(event) => set("openingCash", event.target.value)} /></Field>
            <Field label="Shop Logo" span>
              <div className="logo-upload">
                <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden onChange={(event) => { readLogoFile(event.target.files?.[0], (url) => set("logoUrl", url), setError); event.target.value = ""; }} />
                <button type="button" className="button secondary" onClick={() => logoInput.current?.click()}><Upload size={15} /> Upload from computer</button>
                {form.logoUrl && <button type="button" className="button danger small" onClick={() => set("logoUrl", "")}><Trash2 size={14} /> Remove logo</button>}
                <small>PNG, JPG, WEBP, GIF or SVG up to 400 KB. Printed on this shop&apos;s invoices.</small>
              </div>
            </Field>
          </div>
        </div>
      </div>
      <div className="settings-section">
        <div><h3>Invoice settings</h3><p>Numbering prefix and the thank-you line at the bottom of the receipt.</p></div>
        <div className="form-grid">
          <Field label="Invoice Prefix *"><input value={form.invoicePrefix} onChange={(event) => set("invoicePrefix", event.target.value.toUpperCase())} /></Field>
          <Field label="Status"><select value={form.status} onChange={(event) => set("status", event.target.value)}><option>Active</option><option>Closed</option></select></Field>
          <Field label="Invoice Footer Note" span><textarea rows={2} value={form.footerNote} onChange={(event) => set("footerNote", event.target.value)} /></Field>
          <div className="document-preview field-span"><ReceiptText /><div><b>{form.name || "Shop name"}</b><span>{form.invoicePrefix || "INV"}-00001 · {String(shop.shop_code)}</span><small>{form.address || "Shop address"} · {form.phone || "Phone"}</small></div></div>
        </div>
      </div>
      {error && <div className="form-alert"><AlertTriangle size={16} />{error}</div>}
      <div className="settings-save"><button className="button primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} Save Shop Settings</button></div>
    </form>
  </div>;
}
