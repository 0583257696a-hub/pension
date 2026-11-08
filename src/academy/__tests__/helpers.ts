import { NodeSqliteDb } from "../db/node-sqlite";
import { migrate } from "../db/migrate";
import { seedCourse } from "../content/seed";
import { financeStatisticsCourse } from "../content/course";
import { AuthService } from "../auth/service";
import type { User } from "../auth/types";

export async function freshDb(seed = true) {
  const db = new NodeSqliteDb(":memory:");
  await migrate(db);
  if (seed) await seedCourse(db, financeStatisticsCourse);
  return db;
}

export async function makeUser(db: NodeSqliteDb, email: string, role?: User["role"]) {
  const auth = new AuthService(db);
  const session = await auth.register({ email, password: "Passw0rd!", full_name: email.split("@")[0] });
  if (role && session.user.role !== role) await auth.setRole(session.user.id, role);
  return (await auth.getUserById(session.user.id))!;
}

/** Minimal valid MP4: ftyp + moov(mvhd 10s, trak/tkhd 1280x720) + free padding. */
export function tinyMp4(seconds = 10, padTo = 20 * 1024): Uint8Array {
  const box = (type: string, payload: Uint8Array) => {
    const out = new Uint8Array(8 + payload.length);
    new DataView(out.buffer).setUint32(0, out.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(payload, 8);
    return out;
  };
  const ftyp = box("ftyp", new TextEncoder().encode("isom\0\0\x02\0isomiso2mp41"));
  const mvhd = new Uint8Array(100);
  new DataView(mvhd.buffer).setUint32(12, 1000); // timescale
  new DataView(mvhd.buffer).setUint32(16, seconds * 1000); // duration
  const tkhd = new Uint8Array(84);
  new DataView(tkhd.buffer).setUint32(76, 1280 * 65536);
  new DataView(tkhd.buffer).setUint32(80, 720 * 65536);
  const moov = box("moov", concat(box("mvhd", mvhd), box("trak", box("tkhd", tkhd))));
  const head = concat(ftyp, moov);
  const free = box("free", new Uint8Array(Math.max(0, padTo - head.length - 8)));
  return concat(head, free);
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
