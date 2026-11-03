import { api } from "./client";
import { clearGuestCart, getGuestCart } from "./auth-client";

let inflight = null;

/** Pasa el carrito local al carrito del cliente. Las piezas que ya no existen se descartan. */
export function mergeGuestCart() {
  if (typeof window === "undefined") return Promise.resolve({ merged: 0, dropped: 0 });
  if (inflight) return inflight;
  const guest = getGuestCart();
  if (!guest.length) return Promise.resolve({ merged: 0, dropped: 0 });

  inflight = (async () => {
    let merged = 0;
    let dropped = 0;
    for (const item of guest) {
      if (!item?.productId) {
        dropped += 1;
        continue;
      }
      try {
        await api.addToCart(item.productId, 1);
        merged += 1;
      } catch {
        dropped += 1;
      }
    }
    clearGuestCart();
    return { merged, dropped };
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
