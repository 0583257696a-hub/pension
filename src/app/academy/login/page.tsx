import AuthForm from "@/components/academy/AuthForm";
import { Card } from "@/components/academy/ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="mb-1 text-2xl font-extrabold">כניסה לאקדמיה</h1>
        <p className="mb-5 text-sm text-slate-600">ממשיכים מאיפה שעצרתם.</p>
        <AuthForm mode="login" next={next} />
      </Card>
    </div>
  );
}
