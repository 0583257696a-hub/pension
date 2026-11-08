"use client";

import { useRouter } from "next/navigation";
import { api } from "./client";

export default function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await api("/api/academy/auth/logout", {});
        router.push("/academy");
        router.refresh();
      }}
    >
      התנתקות
    </button>
  );
}
