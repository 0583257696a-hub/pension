import "../academy/academy.css";

/** Bare layout for deterministic renders (no navigation), suitable for screen recording. */
export default function RenderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" lang="he" className="academy-root flex min-h-screen w-full items-center justify-center bg-white">
      {children}
    </div>
  );
}
