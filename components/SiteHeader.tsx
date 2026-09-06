import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

type MeUser = { id: string; email: string; role: "admin" | "customer" };
type Me = { configured: boolean; user: MeUser | null };

export function SiteHeader({ admin = false }: { admin?: boolean }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then(async r => (r.ok ? (await r.json()) as Me : null))
      .then(data => { if (active) setMe(data); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  const user = me?.user ?? null;
  const signOut = async () => { await fetch("/api/auth/signout", { method: "POST" }); setMe(null); router.push("/"); };
  return <header className="site-header"><nav className="nav shell">
    <Link className="brand text-decoration-none" href="/"><span className="brand-mark">CB</span><span>Cinema<span className="gold">Booking</span>{admin ? " Admin" : ""}</span></Link>
    {admin ? null : <div className="nav-links">{user ? <>{user.role === "admin" ? <Link href="/admin">Dashboard</Link> : <Link href="/account">My account</Link>}<button className="nav-link-button" onClick={signOut}>Sign out</button></> : <><a href="/#booking">Now showing</a><a href="/#how">About us</a><Link href="/signin">Sign in</Link></>}</div>}
  </nav></header>;
}