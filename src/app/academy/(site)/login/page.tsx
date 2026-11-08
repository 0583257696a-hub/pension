import AuthForm from "@/components/academy/AuthForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="bg-surface px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-md rounded-xl border border-line bg-white p-6 sm:p-10">
        <h1 className="text-[28px] font-bold text-ink">כניסה</h1>
        <p className="mb-8 mt-2 text-[15px] text-muted">ממשיכים מהמקום שעצרתם.</p>
        <AuthForm mode="login" next={next} />
      </div>
    </div>
  );
}
