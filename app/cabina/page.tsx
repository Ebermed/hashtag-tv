import { redirect } from "next/navigation";
import { getCabinaSession } from "@/lib/cabina-auth";
import { CabinaClient } from "./cabina-client";
import "./cabina.css";

export const dynamic = "force-dynamic";

export default async function CabinaPage() {
  const session = await getCabinaSession();
  if (!session) redirect("/cabina/login");
  return <CabinaClient operatorName={session.username} />;
}
