import { getCurrentUser } from "@/academy/auth/session";
import MarketingFooter from "@/components/academy/shell/MarketingFooter";
import MarketingHeader from "@/components/academy/shell/MarketingHeader";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader signedIn={!!user} />
      <div className="flex-1">{children}</div>
      <MarketingFooter />
    </div>
  );
}
