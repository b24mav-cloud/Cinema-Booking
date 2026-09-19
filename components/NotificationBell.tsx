import { useEffect, useRef, useState } from "react";
import type { Notification } from "../lib/types";

const timeAgo = (iso: string): string => {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
};

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const unread = items.filter(item => !item.readAt).length;

  const load = async () => {
    const response = await fetch("/api/notifications");
    if (response.ok) setItems(await response.json());
  };

  useEffect(() => {
    load();
    const onDown = (event: MouseEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const markRead = async (id: string) => {
    setItems(current => current.map(item => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
  };

  const markAll = async () => {
    const now = new Date().toISOString();
    setItems(current => current.map(item => ({ ...item, readAt: item.readAt ?? now })));
    await fetch("/api/notifications/read-all", { method: "POST" });
  };

  return <div className="notif" ref={panel}>
    <button
      type="button"
      className="notif-bell"
      aria-label={unread ? `You have ${unread} unread notifications` : "Notifications"}
      aria-expanded={open}
      onClick={() => { setOpen(current => !current); if (!open) load(); }}
    >🔔{unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}</button>
    {open && <div className="notif-panel">
      <div className="notif-head">
        <strong>Notifications</strong>
        {unread > 0 && <button type="button" onClick={markAll}>Mark all read</button>}
      </div>
      {items.length === 0
        ? <p className="notif-empty">You're all caught up.</p>
        : <ul className="notif-list">{items.map(item => (
          <li key={item.id}>
            <button type="button" className={`notif-item${item.readAt ? "" : " unread"}`} onClick={() => !item.readAt && markRead(item.id)}>
              <span className="notif-title">{item.title}</span>
              <span className="notif-message">{item.message}</span>
              <span className="notif-time muted">{timeAgo(item.createdAt)}</span>
            </button>
          </li>
        ))}</ul>}
    </div>}
  </div>;
}