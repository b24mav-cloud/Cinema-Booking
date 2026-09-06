import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { SiteHeader } from "../../../components/SiteHeader";
import type { Auditorium, Seat } from "../../../lib/types";

type Tool = "select" | "outofservice" | "recliner";

export default function AuditoriumEditor() {
  const router = useRouter();
  const id = Number(router.query.id);
  const [auditorium, setAuditorium] = useState<Auditorium>();
  const [tool, setTool] = useState<Tool>("select");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/auditoriums/${id}`).then(async response => {
      if (response.status === 404) return router.replace("/admin");
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Could not load the auditorium.");
        return;
      }
      setAuditorium(await response.json());
    });
  }, [id, router]);

  const applyToSeat = (index: number) => {
    if (!auditorium) return;
    const seat = auditorium.seats[index];
    if (seat.status === "Reserved") return;
    const next = [...auditorium.seats];
    if (tool === "outofservice") next[index] = { ...seat, status: seat.status === "OutOfService" ? "Available" : "OutOfService" };
    else if (tool === "recliner") next[index] = { ...seat, variant: seat.variant === "recliner" ? "standard" : "recliner" };
    else if (seat.status === "OutOfService") next[index] = { ...seat, status: "Available" };
    else return;
    setAuditorium({ ...auditorium, seats: next });
    setNotice("");
  };

  const counts = useMemo(() => {
    const summary = { available: 0, reserved: 0, out: 0, recliner: 0 };
    auditorium?.seats.forEach(seat => {
      if (seat.status === "Reserved") summary.reserved += 1;
      else if (seat.status === "OutOfService") summary.out += 1;
      else summary.available += 1;
      if (seat.variant === "recliner") summary.recliner += 1;
    });
    return summary;
  }, [auditorium]);

  const rows: { row: string; seats: { seat: Seat; index: number }[] }[] = [];
  auditorium?.seats.forEach((seat, index) => {
    const group = rows.find(item => item.row === seat.row);
    if (group) group.seats.push({ seat, index });
    else rows.push({ row: seat.row, seats: [{ seat, index }] });
  });

  const save = async () => {
    if (!auditorium || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/auditoriums/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seats: auditorium.seats })
      });
      if (response.status === 400) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Could not save the seat map.");
        return;
      }
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      setAuditorium(result);
      setNotice(`Saved — ${result.syncedShowtimes ?? 0} showtime schedule${(result.syncedShowtimes ?? 0) === 1 ? "" : "s"} updated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the seat map.");
    } finally {
      setSaving(false);
    }
  };

  return <><Head><title>{auditorium ? `${auditorium.name} · Seats | Admin` : "Seat map | Admin"}</title></Head><SiteHeader admin /><main className="admin-page shell"><div className="d-flex justify-content-between"><div><p className="kicker">AUDITORIUM {auditorium?.id ? `#${auditorium.id}` : ""}</p><h1>{auditorium?.name ?? "Loading…"}</h1></div><Link className="button back-button" href="/admin">← Back to dashboard</Link></div>
    {auditorium ? <><p className="muted">Design the seat map once. Every showtime in this auditorium mirrors it — reserved seats stay put, and everything else is refreshed.</p>
      <div className="seat-toolbar">{[["select", "Select seats"], ["outofservice", "Out of service"], ...(auditorium.type === "vip" ? [["recliner", "Recliner"] as [Tool, string]] : [])].map(([key, label]) => <button key={key} className={`seat-tool ${tool === key ? "active" : ""}`} onClick={() => setTool(key as Tool)}>{label}</button>)}</div>
      <div className="summary-card"><p className="kicker">{auditorium.type === "vip" ? "VIP LOUNGE" : "REGULAR HALL"}</p><div className="seat-summary"><span>{counts.available} available</span><span>{counts.reserved} reserved</span><span>{counts.out} out of service</span>{auditorium.type === "vip" && <span>{counts.recliner} recliners</span>}</div>
        <div className="screen">SCREEN</div>
        <div className="seat-map editor">{rows.map(group => <div className="seat-row" style={{ gridTemplateColumns: `18px repeat(${group.seats.length},1fr)` }} key={group.row}><span className="row-label">{group.row}</span>{group.seats.map(({ seat, index }) => <button key={seat.id} disabled={seat.status === "Reserved"} onClick={() => applyToSeat(index)} className={`seat ${seat.status.toLowerCase()}${seat.variant === "recliner" && seat.status !== "Reserved" ? " recliner" : ""}`} title={seat.status === "Reserved" ? "Reserved" : seat.status === "OutOfService" ? "Out of service" : seat.variant === "recliner" ? "Recliner" : "Available"}>{seat.number}</button>)}</div>)}</div>
        <div className="legend"><span><i className="available" />Available</span><span><i className="selected" />Out of service</span><span><i className="reserved" />Reserved</span>{auditorium.type === "vip" && <span><i className="recliner" />Recliner</span>}</div>
      </div>
      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}
      <div className="editor-actions"><button className="button gold-button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save seat map"}</button></div>
    </> : <p className="muted">Loading auditorium…</p>}
  </main></>;
}