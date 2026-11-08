import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Pension Academy",
  description: "קורס מימון וסטטיסטיקה לייעוץ פנסיוני",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
