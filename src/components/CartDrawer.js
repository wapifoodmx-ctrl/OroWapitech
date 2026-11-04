import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getGuestCart, setGuestCart } from "@/lib/store/auth-client";
import { api, formatMxn } from "@/lib/store/client";

export function CartDrawer({ open, onClose }) {
  const { user, token } = useAuth();
  const [items, setItems] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [msg, setMsg] = useState("");

  async function load() {
    setMsg("");
    try {
      const { products } = await api.products();
      setCatalog(products);
      if (token && user && user.role !== "admin") {
        const { cart, products: mine } = await api.cart();
        setCatalog(mine || []);
        setItems((cart.items || []).map((item) => ({ ...item, quantity: 1 })));
      } else if (!token || !user) {
        setItems(getGuestCart().map((item) => ({ ...item, quantity: 1 })));
      } else {
        setItems([]);
      }
    } catch (e) {
      setMsg(e.message);
    }
  }

  useEffect(() => {
    if (!open) return;
    load();
    const onCart = () => load();
    window.addEventListener("ol-cart-change", onCart);
    return () => window.removeEventListener("ol-cart-change", onCart);
  }, [open, token, user]);

  const rows = useMemo(() => {
    return items.map((i) => {
      const p = catalog.find((x) => x.id === i.productId) || null;
      return { ...i, quantity: 1, product: p };
    });
  }, [items, catalog]);

  const total = rows.reduce((s, r) => s + (r.product ? r.product.price : 0), 0);
  const count = rows.reduce((s, r) => s + r.quantity, 0);

  async function setQty(productId, quantity) {
    if (token && user) {
      const { cart } = await api.updateCart(productId, quantity);
      setItems(cart.items);
    } else {
      const next =
        quantity <= 0
          ? getGuestCart().filter((i) => i.productId !== productId)
          : getGuestCart().map((i) =>
              i.productId === productId ? { ...i, quantity: 1 } : i,
            );
      setGuestCart(next);
      setItems(next);
    }
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-bg shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-gold">Carrito</p>
            <h2 className="font-display text-2xl">{count} pieza{count === 1 ? "" : "s"}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-fg">
            Cerrar
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {rows.length === 0 ? (
            <p className="text-muted">Tu carrito está vacío. Explora la colección.</p>
          ) : (
            <div className="space-y-4">
              {rows.map((r) => (
                <div key={r.productId} className="flex gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3">
                  <img src={r.product?.image || ""} alt="" className="size-16 rounded-md object-cover bg-elevated" />
                  <div className="flex-1">
                    <p className="font-display text-lg leading-tight">{r.product?.name || "Pieza no disponible"}</p>
                    <p className="text-sm tabular-nums text-muted">
                      {r.product ? formatMxn(r.product.price) : "Quítala del carrito"}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" className="size-8 rounded-full border border-border" onClick={() => setQty(r.productId, r.quantity - 1)}>−</button>
                      <span className="tabular-nums text-sm">{r.quantity}</span>
                      <button type="button" className="size-8 rounded-full border border-border" onClick={() => setQty(r.productId, Math.min(1, r.quantity + 1))}>+</button>
                    </div>
                    <p className="mt-1 text-[11px] text-subtle">Pieza única · máx. 1</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {msg ? <p className="mt-3 text-sm text-danger">{msg}</p> : null}
        </div>
        <div className="border-t border-border px-5 py-4">
          <p className="mb-3 text-lg tabular-nums">Total {formatMxn(total)}</p>
          {!user ? (
            <p className="mb-3 text-xs text-muted">
              Puedes armar tu carrito sin cuenta. Para comprar, inicia sesión.
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <Link
              href="/carrito"
              onClick={onClose}
              className="inline-flex h-11 items-center justify-center rounded-full bg-gold text-xs tracking-[0.18em] uppercase text-bg"
            >
              Ver carrito completo
            </Link>
            <Link
              href="/tienda"
              onClick={onClose}
              className="inline-flex h-11 items-center justify-center rounded-full border border-border text-xs tracking-[0.18em] uppercase"
            >
              Seguir viendo
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}

export function FloatingCartButton({ onOpen, count }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed bottom-5 right-5 z-40 flex h-14 items-center gap-2 rounded-full border border-gold/40 bg-surface px-5 text-xs tracking-[0.18em] uppercase text-gold shadow-lg backdrop-blur-md transition hover:bg-elevated md:bottom-8 md:right-8"
      aria-label="Abrir carrito"
    >
      <span>Carrito</span>
      {count > 0 ? (
        <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-gold px-1.5 py-0.5 text-[11px] font-medium text-bg tabular-nums">
          {count}
        </span>
      ) : null}
    </button>
  );
}
