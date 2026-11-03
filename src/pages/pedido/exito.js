import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { PageShell } from "@/components/SiteChrome";

export default function PedidoExito() {
  const router = useRouter();
  const { id } = router.query;

  return (
    <>
      <Head>
        <title>Pedido confirmado — Oro Lozano</title>
      </Head>
      <PageShell>
        <section className="mx-auto max-w-lg px-5 py-20 text-center md:px-8">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full border border-gold/40 bg-gold/10">
            <svg className="size-8 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <p className="text-xs tracking-[0.28em] uppercase text-gold">Pedido registrado</p>
          <h1 className="mt-3 font-display text-4xl">¡Gracias por tu compra!</h1>
          <p className="mt-4 text-muted">
            Si acabas de pagar, Mercado Pago confirma el cargo y el pedido pasa a confirmado.
            También puedes revisar el estado en Mi cuenta.
          </p>
          {id ? <p className="mt-4 text-sm text-gold">Folio: {id}</p> : null}
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/cuenta"
              className="inline-flex h-12 items-center justify-center rounded-full bg-gold px-8 text-xs tracking-[0.18em] uppercase text-bg"
            >
              Ver mis pedidos
            </Link>
            <Link
              href="/tienda"
              className="inline-flex h-12 items-center justify-center rounded-full border border-border px-8 text-xs tracking-[0.18em] uppercase"
            >
              Seguir explorando
            </Link>
          </div>
        </section>
      </PageShell>
    </>
  );
}
