"use client";

import { ArrowDownRight, ArrowRight, CheckCircle2, ChevronRight, Clock, Factory, Plus, Route } from "lucide-react";
import { useState, type ReactNode } from "react";
import "./dashboard.css";

export type DashboardRow = Record<string, string | number | boolean | null>;
export type DashboardMetric = {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Route;
  tone: string;
  page?: string;
};
export type DashboardStage = {
  name: string;
  received: number;
  completed: number;
  pending: number;
  lots: number;
  icon: typeof Route;
};

const format = (value: unknown) => Number(value ?? 0).toLocaleString("en-US");

type Props = {
  name: string;
  date: string;
  greeting: string;
  primary: DashboardMetric[];
  operations: DashboardMetric[];
  stages: DashboardStage[];
  lots: DashboardRow[];
  attention: DashboardRow[];
  isActive: (lot: DashboardRow) => boolean;
  isOverdue: (lot: DashboardRow) => boolean;
  formatDate: (value: unknown) => string;
  onNewLot?: () => void;
  onReports?: () => void;
  onAllLots?: () => void;
  onPage: (page: string) => void;
  onLot: (lot: DashboardRow) => void;
  showLots: boolean;
  activity: ReactNode;
  stock: ReactNode;
  shops: ReactNode;
};

export default function DashboardView(props: Props) {
  const [filter, setFilter] = useState<"Active" | "Attention" | "All">("Active");
  const filteredLots = filter === "Attention" ? props.attention : filter === "Active" ? props.lots.filter(props.isActive) : props.lots;
  const pending = props.stages.reduce((sum, stage) => sum + stage.pending, 0);
  const maxPending = Math.max(1, ...props.stages.map((stage) => stage.pending));
  const busiest = props.stages.reduce<DashboardStage | undefined>((best, stage) => !best || stage.pending > best.pending ? stage : best, undefined);

  const metricContent = (metric: DashboardMetric) => <>
    <div className="overview-metric-top"><span>{metric.label}</span><span className={`overview-icon ${metric.tone}`}><metric.icon size={19} strokeWidth={1.8} /></span></div>
    <strong>{metric.value}</strong>
    <div className="overview-metric-foot"><small>{metric.detail}</small>{metric.page && <ArrowRight size={16} aria-hidden="true" />}</div>
  </>;

  return <div className="dashboard-workspace">
    <header className="overview-heading">
      <div><div className="overview-kicker"><span className="overview-brand-dot" />MS BOUTIQUE <span>/</span> OPERATIONS</div><h2>{props.greeting}, {props.name}.</h2><p>Your factory, at a glance.</p></div>
      <div className="overview-heading-actions"><span className="overview-date"><Clock size={15} />{props.date}</span><div>{props.onReports && <button className="button secondary" onClick={props.onReports}>Reports <ArrowDownRight size={16} /></button>}{props.onNewLot && <button className="button primary" onClick={props.onNewLot}><Plus size={17} /> Issue new lot</button>}</div></div>
    </header>

    {props.primary.length > 0 && <section className="overview-metrics" aria-label="Key factory figures">{props.primary.map((metric, index) => metric.page ? <button key={metric.label} className={`overview-metric ${index === 0 ? "featured" : ""}`} onClick={() => props.onPage(metric.page!)}>{metricContent(metric)}</button> : <article key={metric.label} className={`overview-metric ${index === 0 ? "featured" : ""}`}>{metricContent(metric)}</article>)}</section>}

    {props.stages.length > 0 && <section className="overview-production" aria-labelledby="pipeline-title">
      <div className="overview-panel-heading"><div><span className="overview-kicker">THE FACTORY FLOOR</span><h3 id="pipeline-title">Production pipeline</h3></div><span className="overview-badge"><Factory size={14} />{format(pending)} pending stage pieces</span></div>
      <div className="overview-pipeline">{props.stages.map((stage, index) => {
        const percent = stage.received > 0 ? Math.min(100, Math.round(stage.completed / stage.received * 100)) : 0;
        return <button className={`overview-stage ${stage.pending > 0 && stage === busiest ? "busiest" : ""}`} key={stage.name} onClick={() => props.onPage(stage.name)}>
          <div className="overview-stage-top"><span className="overview-stage-icon"><stage.icon size={19} /></span><span className="overview-stage-number">{String(index + 1).padStart(2, "0")}</span></div>
          <h4>{stage.name}<ChevronRight size={14} /></h4><strong>{format(stage.pending)}<small>pending</small></strong>
          <div className="overview-track" role="progressbar" aria-label={`${stage.name} completed`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }} /></div>
          <span className="overview-stage-detail">{format(stage.completed)} / {format(stage.received)} PCS done</span>
          <small className="overview-stage-bottom">{stage.lots} lot{stage.lots === 1 ? "" : "s"} with work pending</small>
        </button>;
      })}</div>
      <div className="overview-pipeline-foot"><span><span className="overview-brand-dot" />{pending > 0 && busiest ? `${busiest.name} has the largest pending queue.` : "No pending production in your departments."}</span><small>Pieces are counted separately at each stage.</small></div>
    </section>}

    {props.showLots && <div className="overview-main-grid">
      <section className="overview-panel overview-lots" aria-labelledby="lots-title">
        <div className="overview-panel-heading"><div><span className="overview-kicker">ORDER BOOK</span><h3 id="lots-title">Lot overview <span className="overview-count">{props.lots.length}</span></h3></div>{props.onAllLots && <button className="link-button" onClick={props.onAllLots}>View all lots <ArrowRight size={15} /></button>}</div>
        <div className="overview-lot-toolbar"><div className="overview-tabs" aria-label="Filter lots">{(["Active", "Attention", "All"] as const).map((item) => <button key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}{item === "Attention" && props.attention.length > 0 && <span>{props.attention.length}</span>}</button>)}</div><small>{filteredLots.length} lot{filteredLots.length === 1 ? "" : "s"}</small></div>
        <div className="overview-table-scroll"><table className="overview-lot-table"><thead><tr><th>Lot / design</th><th>Stage</th><th>Quantity</th><th>Due date</th><th><span className="overview-sr-only">Open lot</span></th></tr></thead><tbody>{filteredLots.slice(0, 6).map((lot) => <tr key={String(lot.id)}><td><button className="overview-lot-link" onClick={() => props.onLot(lot)}>{String(lot.lot_no)}<small>{String(lot.design_no)} · {String(lot.customer || "—")}</small></button></td><td><span className="overview-stage-label">{String(lot.current_department)}</span><small>{String(lot.status)}</small></td><td><b>{format(lot.quantity)}</b><small>PCS</small></td><td><span className={props.isOverdue(lot) ? "overview-overdue" : ""}>{props.formatDate(lot.required_delivery_date)}</span>{props.isOverdue(lot) && <small className="overview-overdue">Overdue</small>}</td><td><button className="overview-open-lot" aria-label={`Open ${lot.lot_no}`} onClick={() => props.onLot(lot)}><ChevronRight size={18} /></button></td></tr>)}</tbody></table></div>
        {!filteredLots.length && <div className="overview-empty"><CheckCircle2 size={28} /><h4>{filter === "Attention" ? "No lots need attention" : "No lots to show"}</h4><p>{filter === "Attention" ? "No overdue, held or rework lots in your view." : "Your production lots will appear here."}</p></div>}
        {filteredLots.length > 6 && props.onAllLots && <button className="overview-table-footer" onClick={props.onAllLots}>Showing 6 of {filteredLots.length} lots · Open full production view <ArrowRight size={15} /></button>}
      </section>

      <aside className="overview-attention overview-panel" aria-labelledby="attention-title"><div className="overview-panel-heading"><div><span className="overview-kicker">PRIORITY DESK</span><h3 id="attention-title">Needs attention</h3></div><span className={`overview-attention-count ${props.attention.length ? "has-items" : ""}`}>{props.attention.length}</span></div>
        {props.attention.length ? <div className="overview-attention-list">{props.attention.slice(0, 4).map((lot) => <button key={String(lot.id)} onClick={() => props.onLot(lot)}><span className="overview-attention-mark"><Clock size={17} /></span><span><b>{String(lot.lot_no)}</b><small>{String(lot.design_no)} · {String(lot.current_department)}</small><em>{props.isOverdue(lot) ? `Due ${props.formatDate(lot.required_delivery_date)}` : String(lot.status)}</em></span><ChevronRight size={16} /></button>)}</div> : <div className="overview-clear"><span><CheckCircle2 size={29} /></span><h4>Everything is on track</h4><p>No overdue, held or rework lots in your view.</p></div>}
        {props.attention.length > 4 && <button className="overview-table-footer" onClick={() => setFilter("Attention")}>Show all {props.attention.length} in lot overview <ArrowRight size={15} /></button>}
        {busiest && <div className="overview-load"><span className="overview-kicker">PENDING WORK BY STAGE</span>{props.stages.map((stage) => <div key={stage.name}><div><span>{stage.name}</span><b>{format(stage.pending)}</b></div><div className="overview-track"><span style={{ width: `${stage.pending / maxPending * 100}%` }} /></div></div>)}</div>}
      </aside>
    </div>}

    {props.operations.length > 0 && <section className="overview-operations" aria-labelledby="operations-title"><div className="overview-section-heading"><h3 id="operations-title">Business snapshot</h3><span>Stock, dispatch & commitments</span></div><div className="overview-operation-grid">{props.operations.map((metric) => {
      const content = <><span className={`overview-icon ${metric.tone}`}><metric.icon size={18} /></span><span><small>{metric.label}</small><strong>{metric.value}</strong><em>{metric.detail}</em></span>{metric.page && <ChevronRight size={15} />}</>;
      return metric.page ? <button key={metric.label} onClick={() => props.onPage(metric.page!)}>{content}</button> : <article key={metric.label}>{content}</article>;
    })}</div></section>}

    <div className="overview-support-grid">{props.activity}{props.stock}</div>
    {props.shops}
  </div>;
}
