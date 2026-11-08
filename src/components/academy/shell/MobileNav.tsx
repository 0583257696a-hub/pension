"use client";

import { useState } from "react";
import { NavList, studentNav } from "./AppSidebar";

/** Drawer with the student navigation on small screens. */
export default function MobileNav({ isStaff }: { isStaff: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex h-10 items-center rounded-md border border-line px-3 text-sm font-semibold">
        תפריט
      </button>
      {open && (
        <div className="fixed inset-x-0 top-16 z-40 border-b border-line bg-white px-4 py-3 shadow-lg">
          <NavList items={studentNav(isStaff)} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
