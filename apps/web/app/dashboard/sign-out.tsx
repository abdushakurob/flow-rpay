"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Icon } from "../../components/icon";

export function SignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      className="rounded-full px-3 py-2 text-left text-sm text-[var(--muted)] disabled:opacity-60"
      disabled={pending}
      type="button"
      onClick={async () => {
        setPending(true);
        try {
          await api("/auth/logout", { method: "POST" });
          router.push("/login");
        } finally {
          setPending(false);
        }
      }}
    >
      <Icon name="logout" size={17}/>{pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
