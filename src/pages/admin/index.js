import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CertificateBadge } from "@/components/CertificateBadge";
import { PageShell, useAuth } from "@/components/SiteChrome";
import { Toast } from "@/components/Toast";
import { ORDER_STATUSES, statusLabel, nextStatuses, paymentLabel, canAdvanceFulfillment } from "@/lib/store/order-status";
import { calculateSalePrice, formatMxnFromCentavos, KARAT_OPTIONS, normalizeKaratKey } from "@/lib/store/mx-validate";
import { api, formatMxn } from "@/lib/store/client";

const emptyForm = {
  id: null,
  name: "",
  category: "anillos",
  metal: "Oro amarillo",
  purity: "18K",
  description: "",
  weightGrams: "",
  image: "",
  images: [],
  featured: false,
};

export default function Admin() {
  const { user, token, loading } = useAuth();
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState(null);
  const [tab, setTab] = useState("piezas");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [certModal, setCertModal] = useState(null);
  const [certForm, setCertForm] = useState({});
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("success");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const isAdmin = user?.role === "admin" && token;
  const categories = settings?.categories || [
    { id: "anillos", name: "Anillos" },
    { id: "collares", name: "Collares" },
    { id: "aretes", name: "Aretes" },
    { id: "pulseras", name: "Pulseras" },
  ];

  const pricePreview = useMemo(() => {
    const karat = normalizeKaratKey(form.purity || "18K");
    const spot = Number(settings?.goldSpotByKarat?.[karat] || 0);
    if (!spot || !form.weightGrams) return null;
    return calculateSalePrice({
      weightGrams: form.weightGrams,
      spotPerGram: spot,
      marginPercent: settings?.marginPercent ?? 35,
      ivaPercent: settings?.ivaPercent ?? 16,
    });
  }, [form.purity, form.weightGrams, settings]);

  async function load() {
    const [p, o, s] = await Promise.all([
      api.adminProducts(),
      api.adminOrders(),
      api.adminSettings().catch(() => ({ settings: null })),
    ]);
    setProducts(p.products || []);
    setOrders(o.orders || []);
    setSettings(s.settings);
  }

  useEffect(() => {
    if (isAdmin) load().catch((e) => showToast(e.message, "error"));
  }, [user, token]);

  function showToast(msg, type = "success") {
    setToastType(type);
    setToast(msg);
  }

  function openCreate() {
    setForm({ ...emptyForm, category: categories[0]?.id || "anillos" });
    setModalOpen(true);
  }

  function openEdit(p) {
    if (p.sold || p.reservedOrderId) {
      showToast(
        p.sold
          ? "Pieza vendida: no se puede editar hasta liberarla (pedido cancelado)"
          : "Pieza reservada por un pago en curso",
        "error",
      );
      return;
    }
    const imgs = [...(p.images || [])];
    if (p.image && !imgs.includes(p.image)) imgs.unshift(p.image);
    setForm({
      id: p.id,
      name: p.name || "",
      category: p.category || "anillos",
      metal: p.metal || "Oro amarillo",
      purity: (p.purity || p.karat || "18K").toUpperCase().replace(/K$/i, "K"),
      description: p.description || "",
      weightGrams: String(p.weightGrams ?? ""),
      image: imgs[0] || "",
      images: imgs,
      featured: Boolean(p.featured),
    });
    setModalOpen(true);
  }

  async function uploadFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      bytes.forEach((b) => {
        binary += String.fromCharCode(b);
      });
      const { url } = await api.adminUploadImage({
        filename: file.name,
        contentType: file.type || "image/jpeg",
        dataBase64: btoa(binary),
      });
      setForm((f) => {
        const images = [...(f.images || []), url];
        return { ...f, images, image: images[0] || url };
      });
      showToast("Imagen añadida");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setUploading(false);
    }
  }

  async function saveProduct(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (!form.name.trim()) throw new Error("Nombre requerido");
      if (!form.weightGrams) throw new Error("Peso requerido");
      const purity = form.purity.toUpperCase().endsWith("K")
        ? form.purity.toUpperCase()
        : `${form.purity}K`;
      let price = 0;
      let priceBreakdown = null;
      if (pricePreview) {
        price = pricePreview.centavos;
        priceBreakdown = pricePreview.breakdown;
      } else {
        throw new Error(
          `Configura el precio spot de ${purity} en Settings antes de guardar`,
        );
      }
      const payload = {
        name: form.name.trim().slice(0, 80),
        category: form.category,
        metal: form.metal,
        purity,
        karat: purity,
        description: form.description.slice(0, 500),
        weightGrams: Number(form.weightGrams),
        price,
        image: (form.images && form.images[0]) || form.image || "",
        images: form.images && form.images.length ? form.images : form.image ? [form.image] : [],
        featured: form.featured,
        active: true,
        priceBreakdown,
      };
      if (form.id) {
        await api.adminUpdateProduct(form.id, payload);
        showToast("Pieza actualizada");
      } else {
        await api.adminCreateProduct(payload);
        showToast("Pieza creada");
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head>
        <title>Atelier — Oro Lozano</title>
      </Head>
      <PageShell>
        <Toast message={toast} type={toastType} onClose={() => setToast("")} />
        {loading ? (
          <p className="py-20 text-center text-muted">Cargando…</p>
        ) : !isAdmin ? (
          <div className="px-5 py-20 text-center">
            <h1 className="text-3xl">Atelier reservado</h1>
            <Link href="/cuenta" className="mt-6 inline-block text-gold">
              Ir a entrar
            </Link>
          </div>
        ) : (
          <section className="mx-auto max-w-6xl px-5 py-12 md:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs tracking-[0.28em] uppercase text-gold">Atelier</p>
                <h1 className="mt-2 text-4xl">Catálogo y despacho</h1>
              </div>
              {tab === "piezas" ? (
                <button
                  type="button"
                  onClick={openCreate}
                  className="h-11 rounded-full bg-gold px-6 text-xs tracking-[0.18em] uppercase text-bg"
                >
                  + Nueva pieza
                </button>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {[
                { id: "piezas", label: "Piezas" },
                { id: "pedidos", label: "Despachar pedidos" },
                { id: "settings", label: "Settings" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`h-10 rounded-full border px-4 text-xs uppercase tracking-[0.16em] ${
                    tab === t.id ? "border-gold bg-gold text-bg" : "border-border text-muted"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "piezas" ? (
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((p) => {
                  const hasCert = Boolean(p.certificate?.uuid);
                  return (
                    <div
                      key={p.id}
                      className={`rounded-[var(--radius-xl)] border border-border bg-surface p-4 ${
                        p.sold || p.reservedOrderId ? "opacity-80" : ""
                      }`}
                    >
                      <div className="relative aspect-square overflow-hidden rounded-[var(--radius-lg)] bg-elevated">
                        {p.image ? (
                          <img src={p.image} alt="" className="size-full object-cover" />
                        ) : (
                          <div className="flex size-full items-center justify-center text-subtle">Sin imagen</div>
                        )}
                        {p.sold || p.reservedOrderId ? (
                          <span className="absolute left-2 top-2 rounded-full bg-gold px-2 py-1 text-[10px] uppercase tracking-wide text-bg">
                            {p.sold ? "Vendido" : "Reservada"}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-display text-xl">{p.name}</h3>
                          <p className="text-sm tabular-nums text-muted">
                            {formatMxn(p.price)} · {p.weightGrams || "—"} g · {p.purity || p.karat}
                          </p>
                          <p className="text-xs text-subtle">{p.category}</p>
                        </div>
                        <CertificateBadge
                          hasCertificate={hasCert}
                          onClick={() => {
                            if (p.sold || p.reservedOrderId) {
                              showToast(
                                p.sold ? "Pieza vendida: el certificado queda en solo lectura" : "Pieza reservada por un pago en curso",
                                "error",
                              );
                              return;
                            }
                            setCertModal(p);
                            setCertForm({
                              weightGrams: String(p.certificate?.weightGrams ?? p.weightGrams ?? ""),
                              density: String(p.certificate?.density ?? "15.5"),
                              densityMethod: p.certificate?.densityMethod || "densímetro",
                              touchstone: p.certificate?.touchstone || "Prueba de toque positiva",
                              ultrasound: p.certificate?.ultrasound || "Metal macizo",
                              notes: p.certificate?.notes || "",
                              serial: p.certificate?.serial || "",
                            });
                          }}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {p.sold || p.reservedOrderId ? (
                          <span className="inline-flex h-9 items-center rounded-full border border-gold/40 bg-gold/10 px-3 text-xs uppercase tracking-wide text-gold">
                            {p.sold ? "Vendido — solo lectura" : "Reservada — pago en curso"}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="h-9 rounded-full border border-border px-3 text-xs"
                            onClick={() => openEdit(p)}
                          >
                            Editar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : tab === "settings" ? (
              <AdminSettingsPanel
                settings={settings}
                products={products}
                onSaved={async (s) => {
                  setSettings(s);
                  showToast("Settings guardados");
                }}
                onError={(m) => showToast(m, "error")}
              />
            ) : (
              <div className="mt-8 space-y-4">
                {orders.length === 0 ? (
                  <p className="text-muted">Sin pedidos.</p>
                ) : (
                  orders.map((o) => (
                    <div key={o.id} className="rounded-[var(--radius-xl)] border border-border bg-surface p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-gold">{o.id}</p>
                          <p className="tabular-nums text-lg">{formatMxn(o.total)}</p>
                          <p className="text-sm text-muted">
                            {o.shippingName} · {o.shippingCity}
                          </p>
                          <p className="mt-2 text-xs text-gold-strong">{statusLabel(o.status || "recibido")}</p>
                          <p className="text-xs text-muted">{paymentLabel(o.paymentStatus)}</p>
                          {o.mpPaymentId ? (
                            <p className="text-[11px] text-subtle">MP {o.mpPaymentId}</p>
                          ) : null}
                          {(o.items || []).map((item) => (
                            <p key={item.productId} className="text-sm text-muted">
                              {item.name}
                            </p>
                          ))}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {o.status === "cancelado" ? (
                            <>
                              <span className="rounded-full border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                                Pedido cancelado (estatus cerrado)
                              </span>
                              <button
                                type="button"
                                className="h-9 rounded-full border border-gold/40 px-3 text-xs text-gold"
                                onClick={async () => {
                                  try {
                                    const res = await api.adminReleaseOrderProducts(o.id);
                                    showToast(res.message || "Piezas liberadas: ya puedes editarlas en Piezas");
                                    await load();
                                  } catch (err) {
                                    showToast(err.message, "error");
                                  }
                                }}
                              >
                                Liberar producto(s) al catálogo
                              </button>
                            </>
                          ) : (
                            <select
                              className="h-10 min-w-[220px] rounded-md border border-border bg-bg px-3 text-xs"
                              value={o.status || "recibido"}
                              disabled={o.status === "finalizado"}
                              onChange={async (e) => {
                                try {
                                  await api.adminUpdateOrder(o.id, { status: e.target.value });
                                  showToast(`Estatus: ${statusLabel(e.target.value)}`);
                                  await load();
                                } catch (err) {
                                  showToast(err.message, "error");
                                }
                              }}
                            >
                              {(canAdvanceFulfillment(o)
                                ? nextStatuses(o.status || "recibido")
                                : [
                                    ORDER_STATUSES.find((s) => s.id === (o.status || "recibido")),
                                    ORDER_STATUSES.find((s) => s.id === "cancelado"),
                                  ].filter(Boolean)
                              ).map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.step ? `${s.step}. ` : ""}{s.label}
                                </option>
                              ))}
                            </select>
                          )}
                          {!canAdvanceFulfillment(o) && o.status !== "cancelado" ? (
                            <p className="max-w-[220px] text-right text-[11px] text-subtle">
                              El despacho se habilita cuando el pago queda aprobado.
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Modal nueva / editar pieza */}
            {modalOpen ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                <form
                  onSubmit={saveProduct}
                  className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius-xl)] border border-border bg-bg p-6 shadow-2xl"
                >
                  <div className="flex items-start justify-between">
                    <h2 className="font-display text-2xl">{form.id ? "Editar pieza" : "Nueva pieza"}</h2>
                    <button type="button" className="text-sm text-muted" onClick={() => setModalOpen(false)}>
                      Cerrar
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    <input
                      className="h-11 w-full rounded-md border border-border bg-surface px-3"
                      placeholder="Nombre (máx. 80)"
                      maxLength={80}
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                    <select
                      className="h-11 w-full rounded-md border border-border bg-surface px-3"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-11 w-full rounded-md border border-border bg-surface px-3"
                      value={form.metal}
                      onChange={(e) => setForm({ ...form, metal: e.target.value })}
                    >
                      <option value="Oro amarillo">Oro amarillo</option>
                      <option value="Oro blanco">Oro blanco</option>
                      <option value="Oro rosa">Oro rosa</option>
                      <option value="Plata">Plata</option>
                    </select>
                    <label className="block text-xs text-subtle">
                      Kilataje (1K–24K)
                      <select
                        className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg"
                        value={form.purity}
                        onChange={(e) => setForm({ ...form, purity: e.target.value })}
                      >
                        {KARAT_OPTIONS.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </label>
                    <input
                      className="h-11 w-full rounded-md border border-border bg-surface px-3"
                      placeholder="Peso (gramos)"
                      inputMode="decimal"
                      value={form.weightGrams}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          weightGrams: e.target.value.replace(/[^\d.]/g, "").slice(0, 8),
                        })
                      }
                      required
                    />
                    <textarea
                      className="min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2"
                      placeholder="Descripción (máx. 500)"
                      maxLength={500}
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />

                    {/* Multi-imagen */}
                    <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-elevated p-4">
                      <p className="mb-2 text-xs uppercase tracking-wide text-subtle">Fotos de la pieza (varias)</p>
                      {(form.images || []).length ? (
                        <div className="mb-3 flex flex-wrap gap-2">
                          {(form.images || []).map((src, i) => (
                            <div key={i} className="relative">
                              <img src={src} alt="" className="h-20 w-20 rounded-md object-cover" />
                              <button
                                type="button"
                                className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-danger text-[10px] text-white"
                                onClick={() =>
                                  setForm((f) => {
                                    const images = (f.images || []).filter((_, j) => j !== i);
                                    return { ...f, images, image: images[0] || "" };
                                  })
                                }
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mb-3 text-sm text-muted">Sin imágenes</p>
                      )}
                      <label className="inline-flex cursor-pointer items-center justify-center rounded-full bg-gold px-5 py-2 text-xs tracking-[0.16em] uppercase text-bg">
                        {uploading ? "Subiendo…" : "+ Añadir foto"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploading}
                          onChange={(e) => uploadFile(e.target.files?.[0])}
                        />
                      </label>
                      <p className="mt-2 text-[11px] text-subtle">Cada foto se sube al bucket · puedes agregar varias</p>
                    </div>

                    {pricePreview ? (
                      <div className="rounded-md border border-gold/30 bg-gold/5 p-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-gold">Precio calculado</p>
                        <p className="mt-1 tabular-nums text-lg">{formatMxnFromCentavos(pricePreview.centavos)}</p>
                        <p className="mt-1 text-xs text-muted">
                          Spot {pricePreview.breakdown.spotPerGram} × {pricePreview.breakdown.weightGrams} g → +
                          {pricePreview.breakdown.marginPercent}% → +IVA {pricePreview.breakdown.ivaPercent}%
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-danger">
                        Define el spot de {form.purity} en Settings para calcular el precio.
                      </p>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="mt-5 h-11 w-full rounded-full bg-gold text-xs tracking-[0.18em] uppercase text-bg disabled:opacity-50"
                  >
                    {busy ? "Guardando…" : form.id ? "Actualizar" : "Crear pieza"}
                  </button>
                </form>
              </div>
            ) : null}

            {/* Cert modal */}
            {certModal ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                <form
                  className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius-xl)] border border-border bg-bg p-6"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const existing = certModal.certificate || {};
                      const certPayload = {
                        serial: certForm.serial || existing.serial || "",
                        weightGrams: Number(certForm.weightGrams) || 0,
                        density: Number(certForm.density) || 0,
                        densityMethod: certForm.densityMethod,
                        touchstone: certForm.touchstone,
                        ultrasound: certForm.ultrasound,
                        notes: certForm.notes,
                        tests: { touchstone: true, densimeter: true, ultrasound: true },
                        issuedAt: existing.issuedAt || new Date().toISOString(),
                        issuedBy: existing.issuedBy || "Oro Lozano Atelier",
                      };
                      if (existing.uuid) certPayload.uuid = existing.uuid;
                      await api.adminUpdateProduct(certModal.id, {
                        weightGrams: Number(certForm.weightGrams) || 0,
                        certificate: certPayload,
                      });
                      showToast("Certificado guardado");
                      setCertModal(null);
                      await load();
                    } catch (err) {
                      showToast(err.message, "error");
                    }
                  }}
                >
                  <div className="flex justify-between">
                    <h3 className="font-display text-2xl">Certificado — {certModal.name}</h3>
                    <button type="button" onClick={() => setCertModal(null)}>
                      Cerrar
                    </button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {["weightGrams", "density", "densityMethod", "touchstone", "ultrasound", "serial", "notes"].map(
                      (k) => (
                        <input
                          key={k}
                          className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                          placeholder={k}
                          value={certForm[k] || ""}
                          onChange={(e) => setCertForm({ ...certForm, [k]: e.target.value })}
                        />
                      ),
                    )}
                  </div>
                  <button type="submit" className="mt-4 h-11 w-full rounded-full bg-gold text-xs uppercase tracking-wide text-bg">
                    Guardar certificado
                  </button>
                </form>
              </div>
            ) : null}
          </section>
        )}
      </PageShell>
    </>
  );
}


function AdminSettingsPanel({ settings, products, onSaved, onError }) {
  const [categories, setCategories] = useState(settings?.categories || []);
  const [spot, setSpot] = useState(settings?.goldSpotByKarat || {});
  const [margin, setMargin] = useState(settings?.marginPercent ?? 35);
  const [iva, setIva] = useState(settings?.ivaPercent ?? 16);
  const [newCat, setNewCat] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setCategories(settings.categories || []);
    setSpot(settings.goldSpotByKarat || {});
    setMargin(settings.marginPercent ?? 35);
    setIva(settings.ivaPercent ?? 16);
  }, [settings]);

  const usedKarats = KARAT_OPTIONS;
  const karatsInCatalog = new Set(
    (products || []).map((p) => {
      const k = String(p.purity || p.karat || "").toUpperCase();
      return k.endsWith("K") ? k : k ? `${k}K` : "";
    }),
  );

  async function save() {
    setBusy(true);
    try {
      const { settings: next } = await api.adminUpdateSettings({
        categories,
        goldSpotByKarat: spot,
        marginPercent: Number(margin),
        ivaPercent: Number(iva),
      });
      onSaved?.(next);
    } catch (e) {
      onError?.(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="rounded-[var(--radius-xl)] border border-border bg-surface p-6">
        <h2 className="font-display text-2xl">Categorías</h2>
        <ul className="mt-4 space-y-2">
          {categories.map((c) => (
            <li key={c.id} className="flex justify-between text-sm">
              <span>{c.name}</span>
              <button type="button" className="text-xs text-danger" onClick={() => setCategories(categories.filter((x) => x.id !== c.id))}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <input className="h-11 flex-1 rounded-md border border-border bg-bg px-3" value={newCat} maxLength={40} onChange={(e) => setNewCat(e.target.value)} placeholder="Nueva categoría" />
          <button
            type="button"
            className="h-11 rounded-full border border-border px-4 text-xs uppercase"
            onClick={() => {
              const name = newCat.trim();
              if (!name) return;
              const id = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");
              if (categories.some((c) => c.id === id)) return;
              setCategories([...categories, { id, name, slug: id }]);
              setNewCat("");
            }}
          >
            Añadir
          </button>
        </div>
      </div>
      <div className="rounded-[var(--radius-xl)] border border-border bg-surface p-6">
        <h2 className="font-display text-2xl">Precio spot oro (MXN / g)</h2>
        <p className="mt-2 text-sm text-muted">
          Del 1K al 24K, para poder cotizar antes de publicar la pieza. Fórmula: spot × peso × (1+margen) × (1+IVA).
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {usedKarats.map((k) => (
            <label key={k} className="block text-xs text-subtle">
              Spot {k}
              {karatsInCatalog.has(k) ? " · en catálogo" : ""}
              <input
                className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3 tabular-nums"
                value={spot[k] ?? ""}
                onChange={(e) => setSpot({ ...spot, [k]: e.target.value.replace(/[^\d.]/g, "").slice(0, 12) })}
              />
            </label>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-subtle">
            Margen %
            <input className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3" value={margin} onChange={(e) => setMargin(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} />
          </label>
          <label className="block text-xs text-subtle">
            IVA %
            <input className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3" value={iva} onChange={(e) => setIva(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} />
          </label>
        </div>
      </div>
      <button type="button" disabled={busy} onClick={save} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gold text-xs tracking-[0.2em] uppercase text-bg disabled:opacity-50">
        {busy ? "Guardando…" : "Guardar settings"}
      </button>
    </div>
  );
}
