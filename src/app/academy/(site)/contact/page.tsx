import ContactForm from "@/components/academy/ContactForm";

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold sm:text-[40px]">צור קשר</h1>
      <p className="mt-2 text-[17px] text-muted">שאלות על הקורס, רכישה בהעברה בנקאית או חשבונית לארגון. תלמידים עם שאלה על תרגיל מסוים: השתמשו בכפתור ״צריכים עזרה?״ שבמטלה.</p>
      <div className="mt-8"><ContactForm /></div>
    </div>
  );
}
