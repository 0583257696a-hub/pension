import { requireStaff } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import AdminShell from "@/components/academy/shell/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const db = await getDb();
  const review = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM questions WHERE status = 'review'");
  const videos = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM video_assets WHERE status = 'review'");
  const jobs = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM content_jobs WHERE status = 'done'");
  const help = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM help_requests WHERE status IN ('new','in_progress')");
  return (
    <AdminShell
      name={user.full_name}
      email={user.email}
      role={user.role === "admin" ? "admin" : "reviewer"}
      counts={{
        "/academy/admin/content": Number(review?.n ?? 0),
        "/academy/admin/studio": Number(videos?.n ?? 0),
        "/academy/admin/ai": Number(jobs?.n ?? 0),
        "/academy/admin/support": Number(help?.n ?? 0),
      }}
    >
      {children}
    </AdminShell>
  );
}
