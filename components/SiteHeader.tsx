import Link from "next/link";

export function SiteHeader({ admin = false }: { admin?: boolean }) {
  return <header className="site-header"><nav className="nav shell">
    <Link className="brand text-decoration-none" href="/"><span className="brand-mark">CB</span><span>Cinema<span className="gold">Booking</span>{admin ? " Admin" : ""}</span></Link>
    {admin ? null : <div className="nav-links"><a href="/#booking">Now showing</a><a href="/#how">About us</a><Link href="/signin">Sign in</Link></div>}
  </nav></header>;
}
