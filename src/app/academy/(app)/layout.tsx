import { requireUser } from "@/academy/auth/session";
import { getDb } from "@/academy/db";
import { LearningService } from "@/academy/services/learning";
import AppShell from "@/components/academy/shell/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const service = new LearningService(await getDb());
  const course = await service.getCourse();
  const entitlement = course ? await service.getEntitlement(user, course.id) : null;
  return (
    <AppShell user={user} courseTitle={course?.title} entitlement={entitlement}>
      {children}
    </AppShell>
  );
}
