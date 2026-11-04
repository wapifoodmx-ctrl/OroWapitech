import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { PageShell } from "@/components/SiteChrome";
import { api } from "@/lib/store/client";

export default function Restablecer() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <>
      <Head>
        <title>Nueva contraseña — Oro Lozano</title>
      </Head>
      <PageShell>
        <section className="mx-auto max-w-md px-5 py-16">
          <p className="text-xs tracking-[0.28em] uppercase text-gold">Cuenta</p>
          <h1 className="mt-2 text-4xl">Nueva contraseña</h1>
          <p className="mt-3 text-sm text-muted">
            Abre esta página desde el enlace del correo. Si el enlace venció, pide otro desde Entrar.
          </p>
          <form
            className="mt-8 space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setError("");
              setMessage("");
              if (password !== confirm) {
                setError("Las contraseñas no coinciden");
                return;
              }
              setBusy(true);
              try {
                const result = await api.resetPassword({ newPassword: password });
                setMessage(result.message || "Contraseña actualizada");
                setPassword("");
                setConfirm("");
              } catch (err) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="block">
              <span className="mb-1 block text-xs tracking-[0.16em] uppercase text-subtle">Nueva contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 w-full rounded-[var(--radius-md)] border border-border bg-bg px-4"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs tracking-[0.16em] uppercase text-subtle">Confirmar</span>
              <input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="h-12 w-full rounded-[var(--radius-md)] border border-border bg-bg px-4"
              />
            </label>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            {message ? <p className="text-sm text-gold">{message}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="h-12 w-full rounded-full bg-gold text-xs tracking-[0.2em] uppercase text-bg disabled:opacity-50"
            >
              {busy ? "Guardando…" : "Guardar contraseña"}
            </button>
          </form>
          <Link href="/cuenta" className="mt-6 inline-block text-sm text-gold">
            Volver a entrar
          </Link>
        </section>
      </PageShell>
    </>
  );
}
