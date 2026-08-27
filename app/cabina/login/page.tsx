import { redirect } from "next/navigation";
import { getCabinaSession } from "@/lib/cabina-auth";
import { CabinaLoginClient } from "./login-client";
import "../cabina.css";

export const dynamic = "force-dynamic";

export default async function CabinaLoginPage() {
  if (await getCabinaSession()) redirect("/cabina");
  return <CabinaLoginClient />;
}
