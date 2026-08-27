"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, LockKeyhole, RadioTower } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CabinaLoginClient() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/cabina/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "No se pudo iniciar la sesión.");
      window.location.assign("/cabina");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo iniciar la sesión.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="cabina-login">
    <Link className="login-back" href="/"><ArrowLeft /> Volver a la señal</Link>
    <section className="login-console">
      <div className="login-brand"><span>#</span><div>HASHTAG <b>TV</b><small>ACCESO DE OPERADOR</small></div></div>
      <div className="login-heading"><RadioTower /><span>CONTROL MAESTRO</span><h1>Entrar a cabina</h1><p>Identifícate para tomar señales, lanzar piezas y modificar la programación.</p></div>
      <form onSubmit={submit}>
        <label htmlFor="cabina-username">Usuario</label>
        <Input id="cabina-username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required autoFocus />
        <label htmlFor="cabina-password">Contraseña</label>
        <Input id="cabina-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error && <div className="login-error" role="alert">{error}</div>}
        <Button type="submit" disabled={busy}><LockKeyhole /> {busy ? "VERIFICANDO..." : "ABRIR CABINA"}</Button>
      </form>
      <small className="login-note">Sesión protegida · cierre automático en 8 horas</small>
    </section>
  </main>;
}
