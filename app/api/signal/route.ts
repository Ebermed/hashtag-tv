import { isChannelId } from "@/lib/control";
import { resolveChannelSignal } from "@/lib/playout";

export async function GET(request: Request) {
  try {
    const channelId = new URL(request.url).searchParams.get("channel");
    if (!isChannelId(channelId)) return Response.json({ error: "Canal inválido" }, { status: 400 });
    return Response.json(await resolveChannelSignal(channelId), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ signal: { mode: "automation" }, schedule: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
