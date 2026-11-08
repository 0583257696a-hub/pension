import { requireUser } from "@/academy/auth/session";

/** Lesson player: full-width frame without the app sidebar (design 03). */
export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <>{children}</>;
}
