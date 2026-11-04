import Head from "next/head";
import Link from "next/link";
import { PageShell } from "@/components/SiteChrome";

export default function AuthCallback({ error }) {
  return (
    <>
      <Head>
        <title>Confirmando cuenta — Oro Lozano</title>
      </Head>
      <PageShell>
        <section className="mx-auto max-w-md px-5 py-20 text-center">
          <p className="text-xs tracking-[0.28em] uppercase text-gold">Cuenta</p>
          <h1 className="mt-3 text-4xl">{error ? "No se pudo confirmar" : "Listo"}</h1>
          <p className="mt-4 text-muted">
            {error || "Tu enlace ya se usó. Puedes entrar a tu cuenta."}
          </p>
          <Link href="/cuenta" className="mt-8 inline-flex h-12 items-center rounded-full bg-gold px-8 text-xs tracking-[0.18em] uppercase text-bg">
            Ir a mi cuenta
          </Link>
        </section>
      </PageShell>
    </>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const { safeNextPath } = await import("@/lib/store/roles");
  const { createSupabaseRouteClient } = await import("@/lib/store/supabase");
  const next = safeNextPath(query.next, "/cuenta");
  try {
    const supabase = createSupabaseRouteClient(req, res);
    if (query.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(String(query.code));
      if (error) return { props: { error: error.message } };
      return { redirect: { destination: next, permanent: false } };
    }
    if (query.token_hash && query.type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: String(query.token_hash),
        type: String(query.type),
      });
      if (error) return { props: { error: error.message } };
      return { redirect: { destination: next, permanent: false } };
    }
    return { props: { error: "El enlace no trae un código válido. Pide otro correo." } };
  } catch (error) {
    console.error("[orolozano] auth/callback", error.message);
    return { props: { error: error.message || "No se pudo confirmar el enlace" } };
  }
}
