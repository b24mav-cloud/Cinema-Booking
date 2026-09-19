import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { NotificationBell } from "./NotificationBell";

type MeUser = { id: string; email: string; role: "admin" | "customer" };
type Me = { configured: boolean; user: MeUser | null };

export function SiteHeader({ admin = false }: { admin?: boolean }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then(async r => (r.ok ? (await r.json()) as Me : null))
      .then(data => {
        if (!active) return;
        setMe(data);
        const emailName = data?.user?.email?.split("@")[0] ?? "";
        if (data?.user?.role === "customer") {
          fetch("/api/account/profile")
            .then(async r => (r.ok ? (await r.json()) as { name?: string } : null))
            .then(profile => { if (active) setDisplayName(profile?.name?.trim() || emailName || "My account"); })
            .catch(() => { if (active) setDisplayName(emailName || "My account"); });
        } else {
          setDisplayName(emailName);
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  const user = me?.user ?? null;
  const signOut = async () => { await fetch("/api/auth/signout", { method: "POST" }); setMe(null); router.push("/"); };
  return <header className="site-header"><nav className="nav shell">
    <Link className="brand text-decoration-none" href="/"><img className="brand-mark" src="/cb-logo.svg" alt="CinemaBooking" width={64} height={64} /><span>Cinema<span className="gold">Booking</span>{admin ? " Admin" : ""}</span></Link>
    <div className="nav-right">{admin ? null : <div className="nav-links">{user ? <>{user.role === "admin" ? <Link href="/admin">Dashboard</Link> : <span className="nav-account"><Link href="/account">My account</Link>{displayName && <small className="nav-account-name">{displayName}</small>}</span>}<button className="nav-link-button" onClick={signOut}>Sign out</button></> : <><a href="/#booking">Now showing</a><a href="/#how">About us</a><Link href="/signin">Sign in</Link></>}</div>}{user && <NotificationBell />}</div>
  </nav></header>;
}