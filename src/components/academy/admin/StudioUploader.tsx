"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminAction } from "../client";
import { btn } from "../ui";

interface InitResult { assetId: string; version: number; uploadUrl: string | null; serverUpload: string | null }
interface Checks { passed: boolean; issues: string[]; durationSeconds: number | null; width: number | null; height: number | null; container: string }

/** Uploads a produced video: init version -> PUT bytes (R2 presigned or server) -> automatic file checks. */
export default function StudioUploader({ targetType, targetId, packageId }: { targetType: "lesson" | "question"; targetId: string; packageId: string | null }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [checks, setChecks] = useState<Checks | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setChecks(null);
    try {
      setStatus("יוצר גרסה חדשה…");
      const init = await adminAction<InitResult>("video.init", { targetType, targetId, fileName: file.name, contentType: file.type, size: file.size, packageId });
      setStatus(`מעלה את הקובץ (גרסה ${init.version})…`);
      const target = init.uploadUrl ?? init.serverUpload!;
      const response = await fetch(target, { method: "PUT", body: file, headers: { "content-type": file.type } });
      if (!response.ok) throw new Error(`ההעלאה נכשלה (${response.status})`);
      setStatus("מריץ בדיקות קובץ…");
      const done = await adminAction<{ checks: Checks }>("video.complete", { assetId: init.assetId });
      setChecks(done.checks);
      setStatus(done.checks.passed ? "הקובץ עבר את הבדיקות והועבר לאישור." : "הקובץ נכשל בבדיקות.");
      router.refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <input type="file" accept="video/mp4,video/webm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
      <button type="button" className={btn.primary} disabled={!file || busy} onClick={upload}>העלאה ובדיקה</button>
      {status && <p className="text-sm text-body">{status}</p>}
      {checks && (
        <ul className="text-sm">
          <li>מבנה: {checks.container}{checks.durationSeconds !== null ? ` · ${Math.round(checks.durationSeconds)} שניות` : ""}{checks.width ? ` · ${checks.width}×${checks.height}` : ""}</li>
          {checks.issues.map((i) => <li key={i} className="text-danger-ink">✗ {i}</li>)}
        </ul>
      )}
    </div>
  );
}
