import { requireApiUser } from "@/academy/auth/session";
import { isStaff } from "@/academy/auth/service";
import { getDb } from "@/academy/db";
import { assertSameOrigin, errorResponse, json, readJson } from "@/academy/http";
import { HelpService, type HelpStatus } from "@/academy/services/help";

/** Replies in a help thread: students add a message; staff reply, change status or assign. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await params;
    const body = await readJson<{ body?: string; close?: boolean; status?: HelpStatus; assignToMe?: boolean }>(request);
    const help = new HelpService(await getDb());
    if (isStaff(user)) {
      if (body.status) await help.setStatus(user, id, body.status);
      else if (body.assignToMe) await help.assign(user, id, user.id);
      else await help.staffReply(user, id, String(body.body ?? ""), !!body.close);
    } else {
      await help.studentReply(user, id, String(body.body ?? ""));
    }
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
