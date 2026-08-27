import { createCabinaSession, verifyCabinaCredentials } from "@/lib/cabina-auth";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { username?: unknown; password?: unknown };
    const username = typeof payload.username === "string" ? payload.username.trim() : "";
    const password = typeof payload.password === "string" ? payload.password : "";

    if (!await verifyCabinaCredentials(username, password)) {
      return Response.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
    }

    await createCabinaSession(username);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "No fue posible iniciar la sesión." }, { status: 400 });
  }
}
