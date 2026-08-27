import { clearCabinaSession } from "@/lib/cabina-auth";

export async function POST() {
  await clearCabinaSession();
  return Response.json({ ok: true });
}
