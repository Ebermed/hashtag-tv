import { getPublicChannelIds } from "@/lib/control";

export async function GET() {
  try {
    return Response.json(
      { channels: await getPublicChannelIds() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(JSON.stringify({
      event: "public_channels_failed",
      errorType: error instanceof Error ? error.name : typeof error,
    }));
    return Response.json(
      { channels: ["tv", "byrequest"] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
