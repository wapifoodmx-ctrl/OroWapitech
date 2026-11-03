import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/SiteChrome";
import { api, formatMxn } from "@/lib/store/client";

const FALLBACK_CATS = [
  { id: "all", label: "Todo" },
  { id: "anillos", label: "Anillos" },
  { id: "collares", label: "Collares" },
  { id: "aretes", label: "Aretes" },
  { id: "pulseras", label: "Pulseras" },
];

export default function Tienda() {
  const [products, setProducts] = useState([]);
  const [cats, setCats] = useState(FALLBACK_CATS);
  const [cat, setCat] = useState("all");
  const [err, setErr] = useState("");

  useEffect(() => {
    api.products().then((d) => setProducts(d.products)).catch((e) => setErr(e.message));
    api
      .publicSettings()
      .then((d) => {
        const extra = (d.categories || [])
          .filter((c) => c && (c.id || c.slug) && c.name)
          .map((c) => ({ id: c.slug || c.id, label: c.name }));
        if (extra.length) setCats([{ id: "all", label: "Todo" }, ...extra]);
      })
      .catch(() => setCats(FALLBACK_CATS));
  }, []);

  const list = useMemo(
    () => (cat === "all" ? products : products.filter((p) => p.category === cat)),
    [products, cat],
  );

  return (
    <>
      <Head>
        <title>Colección — Oro Lozano</title>
      </Head>
      <PageShell>
        <section className="mx-auto max-w-6xl px-5 py-12 md:px-8">
          <p className="text-xs tracking-[0.28em] uppercase text-gold">Colección</p>
          <h1 className="mt-2 text-4xl">Piezas únicas</h1>
          <p className="mt-2 text-sm text-muted">Oro y plata sin piedras. Una sola existencia por diseño.</p>
          <div className="mt-8 flex flex-wrap gap-2">
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className={`h-10 rounded-full border px-4 text-xs tracking-[0.16em] uppercase ${
                  cat === c.id
                    ? "border-gold bg-gold text-bg"
                    : "border-border text-muted hover:border-gold hover:text-gold"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {err ? <p className="mt-8 text-danger">{err}</p> : null}
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => (
              <Link
                key={p.id}
                href={`/producto/${p.id}`}
                className="group overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface"
              >
                <div className="aspect-square overflow-hidden bg-elevated">
                  <img src={p.image} alt={p.name} className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                </div>
                <div className="p-5">
                  <p className="text-[11px] tracking-[0.2em] uppercase text-gold">
                    {p.category} · {p.karat}
                  </p>
                  <h2 className="mt-1 font-display text-2xl">{p.name}</h2>
                  <p className="mt-2 text-sm tabular-nums text-muted">{formatMxn(p.price)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </PageShell>
    </>
  );
}
