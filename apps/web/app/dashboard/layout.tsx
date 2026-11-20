import Link from "next/link";
import { Icon, FlowMark } from "../../components/icon";
import { DashboardNav } from "./dashboard-nav";
import { SignOut } from "./sign-out";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div className="dashboard-shell">
    <aside className="dashboard-sidebar">
      <Link className="dashboard-brand" href="/" aria-label="Flow home"><FlowMark size={36}/><span><strong>flow<span className="brand-period">.</span></strong><small>by RPay</small></span></Link>
      <DashboardNav />
      <div className="sidebar-bottom"><div className="sidebar-help"><Icon name="sparkles" size={22}/><strong>Need a hand?</strong><p>Ask Flow about your business.</p><Link href="/dashboard/assistant">Open assistant <Icon name="arrow-right" size={14}/></Link></div><SignOut /></div>
    </aside>
    <div className="dashboard-content"><header className="dashboard-topbar"><span><strong>Workspace</strong><span className="topbar-slash">/</span>Flow</span><div><Link href="/docs"><Icon name="book" size={16}/> Docs</Link></div></header><div className="dashboard-page">{children}</div></div>
  </div>;
}
