import { currentUserFromRequest, json } from "@/lib/store/http";
import { getCart, getProduct, getProductsByIds, setCart } from "@/lib/store/services";

function unavailable(product) {
  return !product || product.stock < 1 || product.sold || !product.active || product.reservedOrderId;
}

export default async function handler(req, res) {
  const user = await currentUserFromRequest(req);
  if (!user) return json(res, { error: "Inicia sesión" }, 401);

  if (req.method === "GET") {
    const cart = await getCart(user.id);
    const products = await getProductsByIds((cart.items || []).map((item) => item.productId));
    return json(res, { cart, products });
  }

  if (req.method === "POST") {
    if (user.role === "admin") {
      return json(res, { error: "El admin no compra desde esta cuenta" }, 403);
    }
    const productId = req.body?.productId;
    if (!productId) return json(res, { error: "Producto requerido" }, 400);
    const product = await getProduct(productId);
    if (unavailable(product)) {
      return json(res, { error: "Pieza no disponible" }, 404);
    }
    const cart = await getCart(user.id);
    const exists = cart.items.find((i) => i.productId === productId);
    const items = exists
      ? cart.items
      : [...cart.items, { productId, quantity: 1 }];
    const next = await setCart(user.id, items);
    return json(res, { cart: next });
  }

  if (req.method === "PUT") {
    if (user.role === "admin") {
      return json(res, { error: "El admin no compra desde esta cuenta" }, 403);
    }
    const productId = req.body?.productId;
    const quantity = Number(req.body?.quantity ?? 0);
    if (!productId) return json(res, { error: "Producto requerido" }, 400);
    const cart = await getCart(user.id);
    let items;
    if (quantity <= 0) {
      items = cart.items.filter((i) => i.productId !== productId);
    } else {
      const exists = cart.items.find((i) => i.productId === productId);
      if (exists) {
        items = cart.items.map((i) =>
          i.productId === productId ? { ...i, quantity: 1 } : i,
        );
      } else {
        // Si no estaba, añadirlo (mismo efecto que POST)
        const product = await getProduct(productId);
        if (unavailable(product)) {
          return json(res, { error: "Pieza no disponible" }, 404);
        }
        items = [...cart.items, { productId, quantity: 1 }];
      }
    }
    const next = await setCart(user.id, items);
    return json(res, { cart: next });
  }

  return json(res, { error: "Método no permitido" }, 405);
}
