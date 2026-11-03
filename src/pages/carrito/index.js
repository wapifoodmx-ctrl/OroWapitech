import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageShell, useAuth } from "@/components/SiteChrome";
import { Loader, ButtonSpinner } from "@/components/Loader";
import { Toast } from "@/components/Toast";
import { clearGuestCart, getGuestCart, setGuestCart } from "@/lib/store/auth-client";
import { mergeGuestCart } from "@/lib/store/guest-cart";
import {
  MX_STATES,
  onlyDigits,
  onlyLettersSpaces,
  validatePhoneMx,
  validateShippingMx,
  validateZipMx,
} from "@/lib/store/mx-validate";
import { api, formatMxn } from "@/lib/store/client";

const emptyShip = {
  fullName: "",
  phone: "",
  street: "",
  extNumber: "",
  intNumber: "",
  neighborhood: "",
  city: "",
  state: "",
  zip: "",
  references: "",
  betweenStreets: "",
};

function isShippingComplete(s) {
  return !validateShippingMx(s);
}

export default function Carrito() {
  const { user, token, loading } = useAuth();
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [shipping, setShipping] = useState(emptyShip);
  const [editShip, setEditShip] = useState(false);
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("success");
  const [busy, setBusy] = useState(false);
  const [loadingCart, setLoadingCart] = useState(true);

  useEffect(() => {
    async function load() {
      setLoadingCart(true);
      try {
        const notice = sessionStorage.getItem("ol_cart_notice");
        if (notice) {
          sessionStorage.removeItem("ol_cart_notice");
          setToastType("error");
          setToast(notice);
        }
        if (token && user && user.role !== "admin") {
          const merged = await mergeGuestCart();
          if (merged?.dropped) {
            setToastType("error");
            setToast("Algunas piezas del carrito ya no estaban disponibles");
          }
          const { cart, products: mine } = await api.cart();
          setProducts(mine || []);
          setItems((cart.items || []).map((item) => ({ ...item, quantity: 1 })));
          const saved = { ...emptyShip, ...(user.shipping || {}) };
          if (!saved.fullName) saved.fullName = user.name || "";
          if (!saved.phone) saved.phone = user.phone || "";
          setShipping(saved);
          setEditShip(!isShippingComplete(saved));
        } else {
          const { products: catalog } = await api.products();
          setProducts(catalog);
          setItems(getGuestCart().map((item) => ({ ...item, quantity: 1 })));
        }
      } catch (e) {
        setToastType("error");
        setToast(e.message);
      } finally {
        setLoadingCart(false);
      }
    }
    if (!loading) load();
  }, [user, token, loading]);

  const rows = useMemo(
    () =>
      items.map((i) => {
        const p = products.find((x) => x.id === i.productId) || null;
        return { ...i, quantity: 1, product: p };
      }),
    [items, products],
  );
  const payable = rows.filter((r) => r.product && r.product.stock >= 1 && !r.product.sold && r.product.active);
  const total = payable.reduce((s, r) => s + r.product.price, 0);
  const shipOk = isShippingComplete(shipping);

  async function checkout() {
    if (!shipOk) {
      setEditShip(true);
      setToastType("error");
      setToast("Completa todos los datos de envío (todos son obligatorios)");
      return;
    }
    const phoneErr = validatePhoneMx(shipping.phone);
    const zipErr = validateZipMx(shipping.zip);
    if (phoneErr || zipErr) {
      setToastType("error");
      setToast(phoneErr || zipErr);
      return;
    }
    setBusy(true);
    try {
      // Guardar dirección preferida para próximas compras
      try {
        await api.updateProfile({ shipping });
      } catch (_) {}
      const data = await api.checkout({
        shippingName: shipping.fullName,
        shippingCity: shipping.city,
        shipping,
      });
      clearGuestCart();
      setItems([]);
      const url = data.init_point || data.sandbox_init_point;
      if (!url) throw new Error("Mercado Pago no devolvió el link de pago");
      window.location.href = url;
      return;
    } catch (e) {
      setToastType("error");
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head>
        <title>Carrito — Oro Lozano</title>
      </Head>
      <PageShell>
        <Toast message={toast} type={toastType} onClose={() => setToast("")} />
        <section className="mx-auto max-w-4xl px-5 py-12 md:px-8">
          <h1 className="text-4xl">Carrito</h1>
          {loading || loadingCart ? (
            <Loader label="Cargando carrito…" />
          ) : rows.length === 0 ? (
            <p className="mt-8 text-muted">
              Vacío. Explora la{" "}
              <Link href="/tienda" className="text-gold">
                colección
              </Link>
              .
            </p>
          ) : (
            <div className="mt-8 space-y-4">
              {rows.map((r) => (
                <div
                  key={r.productId}
                  className="flex gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-4"
                >
                  <img
                    src={r.product?.image || (r.product?.images && r.product.images[0]) || ""}
                    alt=""
                    className="size-24 rounded-[var(--radius-md)] object-cover bg-elevated"
                  />
                  <div className="flex-1">
                    <h2 className="font-display text-xl">{r.product?.name || "Pieza no disponible"}</h2>
                    <p className="text-sm tabular-nums text-muted">
                      {r.product ? formatMxn(r.product.price) : "Ya no está disponible"}
                    </p>
                    <button
                      type="button"
                      className="mt-3 text-xs text-danger"
                      onClick={async () => {
                        if (token && user) {
                          const { cart } = await api.updateCart(r.productId, 0);
                          setItems(cart.items);
                        } else {
                          const next = getGuestCart().filter((i) => i.productId !== r.productId);
                          setGuestCart(next);
                          setItems(next);
                        }
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}

              <div className="rounded-[var(--radius-xl)] border border-border bg-elevated p-6">
                <p className="text-lg tabular-nums">Total {formatMxn(total)}</p>
                {!token || !user ? (
                  <Link
                    href="/cuenta"
                    className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-gold text-xs tracking-[0.2em] uppercase text-bg"
                  >
                    Entrar para comprar
                  </Link>
                ) : user.role === "admin" ? (
                  <p className="mt-4 text-sm text-muted">La cuenta de atelier no realiza compras.</p>
                ) : (
                  <>
                    <h3 className="mt-6 font-display text-xl">Datos de envío</h3>
                    <p className="mt-1 text-sm text-muted">Todos los campos son obligatorios.</p>

                    {shipOk && !editShip ? (
                      <div className="mt-4 rounded-[var(--radius-lg)] border border-border bg-surface p-4 text-sm">
                        <p className="font-medium">{shipping.fullName}</p>
                        <p className="text-muted">
                          {shipping.street} {shipping.extNumber}
                          {shipping.intNumber ? ` Int. ${shipping.intNumber}` : ""}
                        </p>
                        <p className="text-muted">
                          {shipping.neighborhood}, {shipping.city}, {shipping.state} CP {shipping.zip}
                        </p>
                        <p className="text-muted">Tel. {shipping.phone}</p>
                        <p className="text-muted">Entre: {shipping.betweenStreets}</p>
                        <p className="text-muted">Ref: {shipping.references}</p>
                        <button
                          type="button"
                          className="mt-3 text-xs text-gold hover:underline"
                          onClick={() => setEditShip(true)}
                        >
                          Modificar dirección
                        </button>
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <ShipField
                          label="Nombre quien recibe *"
                          value={shipping.fullName}
                          onChange={(v) => setShipping({ ...shipping, fullName: onlyLettersSpaces(v, 80) })}
                          required
                        />
                        <ShipField
                          label="Teléfono 10 dígitos *"
                          value={shipping.phone}
                          onChange={(v) => setShipping({ ...shipping, phone: onlyDigits(v, 10) })}
                          required
                        />
                        <ShipField
                          label="Calle *"
                          value={shipping.street}
                          onChange={(v) => setShipping({ ...shipping, street: v.slice(0, 80) })}
                          required
                        />
                        <ShipField
                          label="No. exterior *"
                          value={shipping.extNumber}
                          onChange={(v) => setShipping({ ...shipping, extNumber: v.slice(0, 10) })}
                          required
                        />
                        <ShipField
                          label="No. interior *"
                          value={shipping.intNumber}
                          onChange={(v) => setShipping({ ...shipping, intNumber: v.slice(0, 10) })}
                          required
                        />
                        <ShipField
                          label="Colonia *"
                          value={shipping.neighborhood}
                          onChange={(v) => setShipping({ ...shipping, neighborhood: v.slice(0, 60) })}
                          required
                        />
                        <ShipField
                          label="Ciudad *"
                          value={shipping.city}
                          onChange={(v) => setShipping({ ...shipping, city: onlyLettersSpaces(v, 60) })}
                          required
                        />
                        <label className="block">
                          <span className="mb-1 block text-xs uppercase tracking-wide text-subtle">Estado *</span>
                          <select
                            required
                            className="h-12 w-full rounded-md border border-border bg-bg px-3"
                            value={shipping.state}
                            onChange={(e) => setShipping({ ...shipping, state: e.target.value })}
                          >
                            <option value="">Selecciona</option>
                            {MX_STATES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </label>
                        <ShipField
                          label="C.P. (5 dígitos) *"
                          value={shipping.zip}
                          onChange={(v) => setShipping({ ...shipping, zip: onlyDigits(v, 5) })}
                          required
                        />
                        <ShipField
                          label="Entre calles *"
                          value={shipping.betweenStreets}
                          onChange={(v) => setShipping({ ...shipping, betweenStreets: v.slice(0, 80) })}
                          required
                        />
                        <div className="md:col-span-2">
                          <ShipField
                            label="Referencias *"
                            value={shipping.references}
                            onChange={(v) => setShipping({ ...shipping, references: v.slice(0, 120) })}
                            required
                          />
                        </div>
                        {shipOk ? (
                          <button
                            type="button"
                            className="text-xs text-muted md:col-span-2"
                            onClick={() => setEditShip(false)}
                          >
                            Usar esta dirección
                          </button>
                        ) : null}
                      </div>
                    )}

                    {payable.length !== rows.length ? (
                      <p className="mt-4 text-sm text-danger">
                        Hay una pieza que ya no está disponible. Quítala para continuar.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy || !shipOk || payable.length === 0 || payable.length !== rows.length}
                      onClick={checkout}
                      className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gold text-xs tracking-[0.2em] uppercase text-bg disabled:opacity-50"
                    >
                      {busy ? <ButtonSpinner /> : null}
                      Pagar con Mercado Pago
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </PageShell>
    </>
  );
}

function ShipField({ label, value, onChange, required }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wide text-subtle">{label}</span>
      <input
        required={required}
        className="h-12 w-full rounded-md border border-border bg-bg px-3"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
