/** Draft text: requires legal review before commercial launch (spec §30). */
export default function Page() {
  return (
    <div className="mx-auto max-w-[820px] px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold sm:text-[40px]">הצהרת נגישות</h1>
      <p className="mt-3 rounded-md bg-warn-soft px-4 py-3 text-sm text-warn-ink">טיוטה. הנוסח ייבדק על ידי עורך דין לפני ההשקה המסחרית.</p>
        <section key="0" className="mt-8">
          <h2 className="text-xl font-bold text-ink">מחויבות</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-body">אנו פועלים להנגשת האתר לאנשים עם מוגבלות. האתר בנוי בעברית ובכיווניות מימין לשמאל, עם ניווט מקלדת, תוויות לשדות טפסים וניגודיות צבעים גבוהה.</p>
        </section>
        <section key="1" className="mt-8">
          <h2 className="text-xl font-bold text-ink">מה עוד בעבודה</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-body">כתוביות לסרטונים והנגשה מלאה של קובצי PDF נמצאות בתהליך. בדיקת נגישות מקצועית תבוצע לפני ההשקה המסחרית.</p>
        </section>
        <section key="2" className="mt-8">
          <h2 className="text-xl font-bold text-ink">פנייה בנושא נגישות</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-body">נתקלתם בבעיה? כתבו לנו דרך עמוד צור קשר ונטפל בהקדם.</p>
        </section>
    </div>
  );
}
