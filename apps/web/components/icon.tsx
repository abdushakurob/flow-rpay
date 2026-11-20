import type { SVGProps } from "react";

export type IconName = "grid" | "package" | "arrow-up-right" | "sparkles" | "send" | "code" | "settings" | "book" | "arrow-right" | "check" | "copy" | "wallet" | "bolt" | "link" | "shield" | "clock" | "menu" | "logout" | "plus" | "alert" | "external" | "refresh" | "close" | "credit-card";

const paths: Record<IconName, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  package: <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="M3 7v10l9 5 9-5V7M12 12v10"/></>,
  "arrow-up-right": <><path d="M7 17 17 7M7 7h10v10"/></>,
  sparkles: <><path d="m12 3 1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9L12 3ZM19 18l.6 1.4L21 20l-1.4.6L19 22l-.6-1.4L17 20l1.4-.6L19 18Z"/></>,
  send: <><path d="m22 2-7 20-4-9-9-4 20-7ZM11 13 22 2"/></>,
  code: <><path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-11-2 14"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2 2-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21h-3v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1-2-2 .1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H6v-3h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1 2-2 .1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V5h3v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1 2 2-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.2v3h-.2a1.7 1.7 0 0 0-1.5 1Z"/></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>,
  "arrow-right": <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
  check: <path d="m5 12 5 5L20 7"/>,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
  wallet: <><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18m-5 5h2"/></>,
  bolt: <path d="m13 2-9 12h7l-1 8 10-12h-7l0-8Z"/>,
  link: <><path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7"/></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  logout: <><path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  alert: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/></>,
  external: <><path d="M13 5h6v6M19 5l-9 9"/><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14-5L4 8m0-5v5h5M4 13a8 8 0 0 0 14 5l2-2m0 5v-5h-5"/></>,
  close: <path d="M5 5l14 14M19 5 5 19"/>,
  "credit-card": <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20m-15 5h4"/></>,
};

export function Icon({ name, size = 20, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>{paths[name]}</svg>;
}

export function FlowMark({ size = 34, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 40 40" fill="none" {...props}><path d="M20 5v30M5.7 12.5l28.6 15M5.7 27.5l28.6-15" stroke="#29d66e" strokeWidth="7" strokeLinecap="round"/></svg>;
}
