import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { BrandMark } from "@/components/BrandMark";
import { CartDrawer, FloatingCartButton } from "@/components/CartDrawer";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { getGuestCart } from "@/lib/store/auth-client";
import { api } from "@/lib/store/client";

export function SiteHeader() {
  const { user, token, logout } = useAuth();
  const isLoggedIn = Boolean(token && user);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:h-20 md:px-8">
        <Link href="/" className="flex items-center gap-3 text-gold">
          <BrandMark className="size-9 md:size-10" />
          <span className="font-display text-lg tracking-[0.22em] text-fg md:text-xl">
            ORO<span className="mx-1.5 text-gold">|</span>LOZANO
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-xs tracking-[0.22em] uppercase text-muted md:flex">
          <Link href="/tienda" className="hover:text-gold">
            Colección
          </Link>
          <Link href="/guias" className="hover:text-gold">
            Guías
          </Link>
          <Link href="/cuenta" className="hover:text-gold">
            {isLoggedIn ? "Mi cuenta" : "Entrar"}
          </Link>
          {user?.role === "admin" ? (
            <Link href="/admin" className="text-gold">
              Atelier
            </Link>
          ) : null}
          {isLoggedIn ? (
            <button
              type="button"
              className="hover:text-gold"
              onClick={async () => {
                await logout();
                router.push("/");
              }}
            >
              Salir
            </button>
          ) : null}
        </nav>
        <button type="button" className="md:hidden text-fg" onClick={() => setOpen((v) => !v)}>
          {open ? "Cerrar" : "Menú"}
        </button>
      </div>
      {open ? (
        <div className="flex flex-col gap-4 border-t border-border px-5 py-5 text-xs tracking-[0.2em] uppercase text-muted md:hidden">
          <Link href="/tienda" onClick={() => setOpen(false)}>Colección</Link>
          <Link href="/guias" onClick={() => setOpen(false)}>Guías</Link>
          <Link href="/cuenta" onClick={() => setOpen(false)}>{isLoggedIn ? "Mi cuenta" : "Entrar"}</Link>
          {user?.role === "admin" ? (
            <Link href="/admin" onClick={() => setOpen(false)}>Atelier</Link>
          ) : null}
          {isLoggedIn ? (
            <button
              type="button"
              className="text-left hover:text-gold"
              onClick={async () => {
                setOpen(false);
                await logout();
                router.push("/");
              }}
            >
              Salir
            </button>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 md:flex-row md:items-center md:justify-between md:px-8">
        <div>
          <p className="font-display tracking-[0.22em] text-gold">ORO | LOZANO</p>
          <p className="mt-2 text-sm text-muted">Oro y plata premium. Piezas únicas sin piedras.</p>
        </div>
        <div className="flex flex-col gap-2 text-xs tracking-[0.16em] uppercase text-subtle">
          <Link href="/guias" className="hover:text-gold">Guías de cuidado</Link>
          <span>Atelier · Ciudad de México</span>
        </div>
      </div>
    </footer>
  );
}

export function PageShell({ children }) {
  const { user, token } = useAuth();
  const [cartOpen, setCartOpen] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    async function refreshCount() {
      try {
        if (token && user) {
          const { cart } = await api.cart();
          setCount((cart.items || []).reduce((s, i) => s + i.quantity, 0));
        } else {
          setCount(getGuestCart().reduce((s, i) => s + i.quantity, 0));
        }
      } catch {
        setCount(getGuestCart().reduce((s, i) => s + i.quantity, 0));
      }
    }
    refreshCount();
    const onCart = () => refreshCount();
    window.addEventListener("ol-cart-change", onCart);
    window.addEventListener("ol-auth-change", onCart);
    return () => {
      window.removeEventListener("ol-cart-change", onCart);
      window.removeEventListener("ol-auth-change", onCart);
    };
  }, [token, user]);

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <WhatsAppButton />
      <FloatingCartButton onOpen={() => setCartOpen(true)} count={count} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}

// re-export for pages that imported useAuth from here
export { useAuth } from "@/components/AuthProvider";
