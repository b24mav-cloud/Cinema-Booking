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
  const [menuOpen, setMenuOpen] = useState(false);

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

  // Close the drawer on navigation and when the viewport grows past the breakpoint.
  useEffect(() => { setMenuOpen(false); }, [router.asPath]);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 701px)");
    const onChange = () => { if (query.matches) setMenuOpen(false); };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const user = me?.user ?? null;

  const signOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    setMe(null);
    setMenuOpen(false);
    router.push("/");
  };

  return (
    <header className="site-header">
      <nav className="nav shell" aria-label="Main">
        <Link className="brand text-decoration-none" href="/">
          <img className="brand-mark" src="/cb-logo.svg" alt="" width={64} height={64} />
          <span>Cinema<span className="gold">Booking</span>{admin ? " Admin" : ""}</span>
        </Link>

        <div className="nav-right">
          {!admin && (
            <div className={`nav-links${menuOpen ? " open" : ""}`} id="nav-links">
              {user ? (
                <>
                  {user.role === "admin" ? (
                    <Link href="/admin">Dashboard</Link>
                  ) : (
                    <span className="nav-account">
                      <Link href="/account">My account</Link>
                      {displayName && <small className="nav-account-name">{displayName}</small>}
                    </span>
                  )}
                  <button className="nav-link-button" onClick={signOut}>Sign out</button>
                </>
              ) : (
                <>
                  <Link href="/#booking">Now showing</Link>
                  <Link href="/movies">Films</Link>
                  <Link href="/#how">About us</Link>
                  <Link href="/signin">Sign in</Link>
                </>
              )}
            </div>
          )}

          {user && <NotificationBell />}

          {!admin && (
            <button
              type="button"
              className="menu-button"
              aria-expanded={menuOpen}
              aria-controls="nav-links"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen(open => !open)}
            >
              <span aria-hidden="true">{menuOpen ? "✕" : "☰"}</span>
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}