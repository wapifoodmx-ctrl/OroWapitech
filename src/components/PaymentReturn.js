import Link from "next/link";
import { PageShell } from "@/components/SiteChrome";

export function PaymentReturn({ kicker, title, children }) {
  return (
    <PageShell>
      <section className="mx-auto max-w-lg px-5 py-20 text-center md:px-8">
        <p className="text-xs tracking-[0.28em] uppercase text-gold">{kicker}</p>
        <h1 className="mt-3 font-display text-4xl">{title}</h1>
        <div className="mt-4 space-y-3 text-muted">{children}</div>
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
            Volver a la colección
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
