import AuthForm from "@/components/academy/AuthForm";

export default function RegisterPage() {
  return (
    <div className="bg-surface px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-md rounded-xl border border-line bg-white p-6 sm:p-10">
        <h1 className="text-[28px] font-bold text-ink">הרשמה</h1>
        <p className="mb-8 mt-2 text-[15px] leading-relaxed text-muted">השיעור הראשון פתוח לכל הנרשמים. שאר הקורס זמין בתקופת ניסיון או במנוי.</p>
        <AuthForm mode="register" />
      </div>
    </div>
  );
}
