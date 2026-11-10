/** Draft text: requires legal review before commercial launch (spec §30). */
export default function Page() {
  return (
    <div className="mx-auto max-w-[820px] px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold sm:text-[40px]">תנאי שימוש</h1>
      <p className="mt-3 rounded-md bg-warn-soft px-4 py-3 text-sm text-warn-ink">טיוטה. הנוסח ייבדק על ידי עורך דין לפני ההשקה המסחרית.</p>
        <section key="0" className="mt-8">
          <h2 className="text-xl font-bold text-ink">כללי</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-body">האתר מפעיל קורסים מקוונים להכנה לבחינות רישוי. השימוש באתר ובתכנים כפוף לתנאים אלה.</p>
        </section>
        <section key="1" className="mt-8">
          <h2 className="text-xl font-bold text-ink">רכישה וגישה</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-body">הגישה לקורס נפתחת לאחר אישור תשלום מחברת הסליקה, או בהענקה של צוות האקדמיה. משך הגישה נקבע לפי המסלול שנרכש. במנוי מתחדש אפשר לבטל את החידוש בכל עת, והגישה נשמרת עד סוף התקופה ששולמה.</p>
        </section>
        <section key="2" className="mt-8">
          <h2 className="text-xl font-bold text-ink">ביטול עסקה והחזרים</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-body">מדיניות הביטול וההחזרים תיקבע בהתאם להוראות הדין החל על עסקאות מכר מרחוק ותפורסם כאן לפני פתיחת המכירה המקוונת.</p>
        </section>
        <section key="3" className="mt-8">
          <h2 className="text-xl font-bold text-ink">קניין רוחני</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-body">הסרטונים, קובצי ה-PDF, השאלות והפתרונות מוגנים. הם מיועדים ללימוד אישי של התלמיד הרשום בלבד, ואין להעתיק, להפיץ או לשתף אותם.</p>
        </section>
        <section key="4" className="mt-8">
          <h2 className="text-xl font-bold text-ink">אחריות</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-body">התכנים נועדו להכנה לבחינה ואינם ייעוץ פנסיוני, פיננסי או השקעות. הצלחה בבחינה אינה מובטחת.</p>
        </section>
    </div>
  );
}
