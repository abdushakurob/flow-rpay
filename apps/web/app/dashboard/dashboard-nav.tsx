"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "../../components/icon";

const groups: { label: string; links: { href: string; title: string; icon: IconName }[] }[] = [
  { label: "WORKSPACE", links: [
    { href: "/dashboard", title: "Overview", icon: "grid" },
    { href: "/dashboard/products", title: "Products", icon: "package" },
    { href: "/dashboard/withdraw", title: "Withdraw", icon: "wallet" },
    { href: "/dashboard/assistant", title: "Assistant", icon: "sparkles" },
  ] },
  { label: "CONNECT", links: [
    { href: "/dashboard/telegram", title: "Telegram", icon: "send" },
    { href: "/dashboard/developers", title: "Developers", icon: "code" },
    { href: "/dashboard/settings", title: "Settings", icon: "settings" },
    { href: "/docs", title: "Documentation", icon: "book" },
  ] },
];

export function DashboardNav() {
  const path = usePathname();
  return <nav className="dashboard-nav" aria-label="Dashboard navigation">{groups.map((group) => <div className="nav-group" key={group.label}><span className="sidebar-label">{group.label}</span>{group.links.map(({ href, title, icon }) => <Link href={href} key={href} aria-current={path === href ? "page" : undefined}><Icon name={icon} size={18}/><span>{title}</span></Link>)}</div>)}</nav>;
}
