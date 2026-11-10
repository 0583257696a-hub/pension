/** Draft text: requires legal review before commercial launch (spec §30). */
export default function Page() {
  return (
    <div className="mx-auto max-w-[820px] px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold sm:text-[40px]">מדיניות פרטיות</h1>
      <p className="mt-3 rounded-md bg-warn-soft px-4 py-3 text-sm text-warn-ink">טיוטה. הנוסח ייבדק על ידי עורך דין לפני ההשקה המסחרית.</p>
        <section key="0" className="mt-8">
          <h2 className="text-xl font-bold text-ink">איזה מידע נאסף</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-body">פרטי הרשמה (שם, אימייל, טלפון אם נמסר), התקדמות בלימודים, תשובות במטלות וציונים, פניות לצוות, ורשומות הזמנה ותשלום. פרטי כרטיס האשראי מוזנים אצל חברת הסליקה ואינם נשמרים אצלנו.</p>
        </section>
        <section key="1" className="mt-8">
          <h2 className="text-xl font-bold text-ink">שימוש במידע</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-body">הפעלת הקורס, שמירת ההתקדמות והציונים, מענה לפניות, טיפול בתשלומים ושיפור התכנים.</p>
        </section>
        <section key="2" className="mt-8">
          <h2 className="text-xl font-bold text-ink">שמירה ואבטחה</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-body">המידע נשמר בשירותי ענן מאובטחים. הגישה מוגבלת לצוות המורשה, ופעולות ניהול נרשמות ביומן.</p>
        </section>
        <section key="3" className="mt-8">
          <h2 className="text-xl font-bold text-ink">זכויותיך</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-body">אפשר לבקש לעיין במידע, לתקן אותו או למחוק את החשבון דרך עמוד צור קשר.</p>
        </section>
    </div>
  );
}
