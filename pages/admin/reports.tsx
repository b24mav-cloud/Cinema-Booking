import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { SiteHeader } from "../../components/SiteHeader";
import { SiteFooter } from "../../components/SiteFooter";
import { apiFetch, errorMessage } from "../../lib/api/client";
import { peso } from "../../lib/types";
import type { Dashboard } from "../../lib/types";

type Bucket = { label: string; revenue: number; tickets: number; bookings: number };

type Range = {
  from: string | null;
  to: string | null;
  bookings: number;
  tickets: number;
  revenue: number;
  cancelled: number;
  refunded: number;
  avgOrderValue: number;
  checkedIn: number;
};

type Report = Dashboard & {
  range?: Range;
  byMovie?: Bucket[];
  byAuditorium?: Bucket[];
  byPaymentMethod?: Bucket[];
  byDay?: Bucket[];
  topSeats?: { seat: string; count: number }[];
};

const isoDay = (offsetDays: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

const PRESETS = [
  ["Last 7 days", () => ({ from: isoDay(-6), to: isoDay(0) })],
  ["Last 30 days", () => ({ from: isoDay(-29), to: isoDay(0) })],
  ["This month", () => ({ from: isoDay(0).slice(0, 8) + "01", to: isoDay(0) })],
  ["All time", () => ({ from: "", to: "" })]
] as const;

function downloadCsv(rows: Bucket[], filename: string) {
  if (!rows.length) return;
  const header = "name,bookings,tickets,revenue";
  const body = rows.map(row => `"${row.label.replace(/"/g, '""')}","${row.bookings}","${row.tickets}","${row.revenue}"`).join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const StatCard = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="stat-card">
    <span className="kicker">{label}</span>
    <strong>{value}</strong>
    {hint && <small className="muted">{hint}</small>}
  </div>
);

const BreakdownTable = ({ title, rows, onExport, filename }: {
  title: string;
  rows: Bucket[];
  onExport: () => void;
  filename: string;
}) => (
  <section className="report-block">
    <div className="section-heading">
      <div><h2>{title}</h2></div>
      <button className="button" onClick={onExport} disabled={!rows.length}>Export CSV</button>
    </div>
    {rows.length === 0 ? (
      <p className="muted">No data in this range.</p>
    ) : (
      <div className="table-scroll">
        <table className="admin-table">
          <thead>
            <tr><th scope="col">{title.replace("Revenue ", "")}</th><th scope="col">Bookings</th><th scope="col">Tickets</th><th scope="col">Revenue</th></tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{row.bookings}</td>
                <td>{row.tickets}</td>
                <td>{peso(row.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    <span className="sr-only">{filename}</span>
  </section>
);

export default function AdminReports() {
  const [from, setFrom] = useState(isoDay(-29));
  const [to, setTo] = useState(isoDay(0));
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      setReport(await apiFetch<Report>(`/api/admin/dashboard?${params.toString()}`));
    } catch (err) {
      setError(errorMessage(err, "We couldn't load the report."));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const maxDay = Math.max(1, ...(report?.byDay ?? []).map(day => day.revenue));

  return (
    <>
      <Head>
        <title>Reports | CinemaBooking Admin</title>
        <meta name="robots" content="noindex" />
      </Head>
      <SiteHeader admin />

      <main className="shell admin-reports">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/admin">Dashboard</Link> <span aria-hidden="true">/</span> <span aria-current="page">Reports</span>
        </nav>

        <div className="section-heading">
          <div>
            <p className="kicker">ANALYTICS</p>
            <h1>Revenue reports</h1>
            <p className="section-intro">Pick a range to break down sales by film, hall and payment method.</p>
          </div>
        </div>

        <form className="report-controls" onSubmit={event => { event.preventDefault(); void load(); }}>
          <div className="report-presets">
            {PRESETS.map(([label, resolve]) => (
              <button
                key={label}
                type="button"
                className="chip-button"
                onClick={() => { const range = resolve(); setFrom(range.from); setTo(range.to); }}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="field">
            From
            <input type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} />
          </label>
          <label className="field">
            To
            <input type="date" value={to} min={from || undefined} max={isoDay(0)} onChange={event => setTo(event.target.value)} />
          </label>
          <button className="button gold-button" type="submit" disabled={loading}>
            {loading ? "Loading…" : "Apply"}
          </button>
        </form>

        {error && <p className="error" role="alert">{error}</p>}

        {report?.range && (
          <>
            <div className="today-overview">
              <StatCard label="Revenue" value={peso(report.range.revenue)} hint={`${report.range.bookings} bookings`} />
              <StatCard label="Tickets sold" value={String(report.range.tickets)} hint={`avg ${peso(report.range.avgOrderValue)} per order`} />
              <StatCard label="Checked in" value={String(report.range.checkedIn)} hint="admitted at the door" />
              <StatCard label="Cancelled" value={String(report.range.cancelled)} hint={`${report.range.refunded} refunded`} />
            </div>

            {report.byDay && report.byDay.length > 0 && (
              <section className="report-block">
                <div className="section-heading"><div><h2>Daily revenue</h2></div></div>
                <div className="bar-chart" role="img" aria-label={`Daily revenue from ${report.byDay[0].label} to ${report.byDay[report.byDay.length - 1].label}`}>
                  {report.byDay.map(day => (
                    <div className="bar-column" key={day.label} title={`${day.label}: ${peso(day.revenue)} · ${day.tickets} tickets`}>
                      <div className="bar" style={{ height: `${Math.round((day.revenue / maxDay) * 100)}%` }} />
                      <small>{day.label.slice(5)}</small>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="report-grid">
              <BreakdownTable title="Revenue by film" rows={report.byMovie ?? []} filename="revenue-by-film.csv" onExport={() => downloadCsv(report.byMovie ?? [], "revenue-by-film.csv")} />
              <BreakdownTable title="Revenue by hall" rows={report.byAuditorium ?? []} filename="revenue-by-hall.csv" onExport={() => downloadCsv(report.byAuditorium ?? [], "revenue-by-hall.csv")} />
              <BreakdownTable title="Revenue by payment method" rows={report.byPaymentMethod ?? []} filename="revenue-by-payment.csv" onExport={() => downloadCsv(report.byPaymentMethod ?? [], "revenue-by-payment.csv")} />
            </div>

            {report.topSeats && report.topSeats.length > 0 && (
              <section className="report-block">
                <div className="section-heading"><div><h2>Best-selling seats</h2></div></div>
                <ul className="seat-leaderboard">
                  {report.topSeats.map(seat => (
                    <li key={seat.seat}><b>{seat.seat}</b><span className="muted">{seat.count} booked</span></li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <div className="wizard-actions">
          <Link className="button back-button" href="/admin">← Back to dashboard</Link>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}