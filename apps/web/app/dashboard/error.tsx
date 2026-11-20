"use client";

import { Icon } from "../../components/icon";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return <main className="dashboard-failure"><div className="workspace-panel"><span className="panel-icon"><Icon name="alert" size={22}/></span><h1>We couldn&apos;t open this page.</h1><p>Try again. Your work has not been changed.</p><button className="primary-action" type="button" onClick={reset}><Icon name="refresh" size={16}/>Try again</button></div></main>;
}
