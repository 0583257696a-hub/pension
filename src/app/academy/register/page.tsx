import AuthForm from "@/components/academy/AuthForm";
import { Card } from "@/components/academy/ui";

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="mb-1 text-2xl font-extrabold">הרשמה</h1>
        <p className="mb-5 text-sm text-slate-600">השיעור הראשון פתוח לכל הנרשמים. שאר הקורס זמין בתקופת ניסיון או במנוי.</p>
        <AuthForm mode="register" />
      </Card>
    </div>
  );
}
