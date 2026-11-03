import { centavosToUnitPrice, buildPaymentPatch, readOrderIdFromPayment } from "./payment-decision.js";
import { createCheckoutPreference, getMpToken, getSiteUrl, mpCurrency, mpFetch } from "./mercadopago.js";
import { sanitizeShipping, validateShippingMx } from "./mx-validate.js";
import {
  confirmProductSold,
  createOrder,
  getCart,
  getOrder,
  getProduct,
  newId,
  releaseProductIfHeldBy,
  reserveProductForOrder,
  saveOrderPayment,
  setCart,
  updateOrderStatus,
} from "./services.js";

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function createPreferenceForOrder({ order, payer, req }) {
  const origin = getSiteUrl(req);
  const currency = mpCurrency();
  const items = (order.items || []).map((item) => ({
    id: String(item.productId || "pieza"),
    title: `Oro Lozano · ${item.name || "Pieza"}`.slice(0, 120),
    description: "Pieza única de oro o plata",
    quantity: 1,
    unit_price: centavosToUnitPrice(item.price),
    currency_id: currency,
  }));
  if (!items.length) throw httpError("El pedido no tiene piezas", 400);
  if (items.some((item) => !(item.unit_price > 0))) {
    throw httpError("El pedido tiene un precio inválido", 400);
  }

  return createCheckoutPreference({
    items,
    payer: {
      email: payer?.email || undefined,
      name: payer?.name || undefined,
    },
    external_reference: String(order.id),
    metadata: {
      order_id: String(order.id),
      user_id: String(order.userId || payer?.id || ""),
    },
    back_urls: {
      success: `${origin}/pago/exito`,
      failure: `${origin}/pago/fallo`,
      pending: `${origin}/pago/pendiente`,
    },
    auto_return: "approved",
    notification_url: `${origin}/api/mercadopago/webhook`,
    payment_methods: { installments: 1 },
  });
}

export async function placeOrderAndPreference({ user, shipping, req }) {
  if (!getMpToken()) {
    throw httpError("Pagos en línea no configurados. Falta MERCADO_PAGO_ACCESS_TOKEN", 503);
  }
  const clean = sanitizeShipping(shipping);
  const shipError = validateShippingMx(clean);
  if (shipError) throw httpError(shipError, 400);

  const cart = await getCart(user.id);
  if (!cart.items?.length) throw httpError("El carrito está vacío", 400);

  const lines = [];
  let total = 0;
  for (const item of cart.items) {
    const product = await getProduct(item.productId);
    if (!product || product.stock < 1 || product.sold || !product.active || product.reservedOrderId) {
      throw httpError(`Pieza no disponible: ${product?.name || "del carrito"}`, 400);
    }
    lines.push({
      productId: product.id,
      name: product.name,
      price: Number(product.price) || 0,
      quantity: 1,
      certificateUuid: product.certificate?.uuid || null,
      serial: product.certificate?.serial || null,
    });
    total += Number(product.price) || 0;
  }

  const orderId = newId("ord");
  const reserved = [];
  let order = null;
  try {
    for (const line of lines) {
      const held = await reserveProductForOrder(line.productId, orderId);
      if (!held) throw httpError(`Pieza no disponible: ${line.name}`, 409);
      reserved.push(line.productId);
    }
    order = await createOrder({
      id: orderId,
      userId: user.id,
      items: lines,
      total,
      shippingName: clean.fullName,
      shippingCity: clean.city,
      shipping: clean,
      paymentStatus: "pendiente",
      note: "Pedido registrado. Pago pendiente en Mercado Pago",
    });
    const preference = await createPreferenceForOrder({ order, payer: user, req });
    const saved = await saveOrderPayment(order.id, {
      mpPreferenceId: preference.id,
      paymentStatus: "pendiente",
    });
    try {
      await setCart(user.id, []);
    } catch (cartError) {
      console.error("No se pudo vaciar el carrito", cartError);
    }
    return { order: saved || order, preference };
  } catch (error) {
    if (order) {
      try {
        await updateOrderStatus(order.id, "cancelado", "No se pudo abrir el cobro en Mercado Pago");
      } catch (cancelError) {
        console.error("rollback pedido", cancelError);
        for (const id of reserved) {
          try {
            await releaseProductIfHeldBy(id, orderId);
          } catch (releaseError) {
            console.error("rollback pieza", releaseError);
          }
        }
      }
    } else {
      for (const id of reserved) {
        try {
          await releaseProductIfHeldBy(id, orderId);
        } catch (releaseError) {
          console.error("rollback pieza", releaseError);
        }
      }
    }
    throw error;
  }
}

export async function reopenOrderPreference({ order, payer, req }) {
  if (!getMpToken()) {
    throw httpError("Pagos en línea no configurados. Falta MERCADO_PAGO_ACCESS_TOKEN", 503);
  }
  if (order.paymentStatus === "pagado") throw httpError("Este pedido ya está pagado", 400);
  if (order.status === "cancelado") {
    throw httpError("El pedido está cancelado. Vuelve a armar el carrito.", 400);
  }
  if (!["recibido", "confirmado"].includes(order.status)) {
    throw httpError("Este pedido ya no se puede pagar en línea", 400);
  }
  for (const item of order.items || []) {
    const product = await getProduct(item.productId);
    if (product?.reservedOrderId === order.id && !product.sold) continue;
    const reserved = await reserveProductForOrder(item.productId, order.id);
    if (!reserved) throw httpError(`Pieza no disponible: ${item.name || "del pedido"}`, 409);
  }
  const preference = await createPreferenceForOrder({ order, payer, req });
  const saved = await saveOrderPayment(order.id, {
    mpPreferenceId: preference.id,
    paymentStatus: "pendiente",
  });
  return { order: saved || order, preference };
}

export async function applyMercadoPagoPayment(payment) {
  const orderId = readOrderIdFromPayment(payment);
  if (!orderId) return { ok: false, reason: "sin external_reference" };
  const order = await getOrder(orderId);
  if (!order) return { ok: false, reason: "pedido no encontrado" };

  const decision = buildPaymentPatch(order, payment);
  if (decision.action === "noop" || !decision.patch) {
    return { ok: true, reason: decision.reason || "sin cambios", orderId };
  }

  let conflict = false;
  if (decision.confirm) {
    for (const item of order.items || []) {
      if (!item.productId) continue;
      const result = await confirmProductSold(item.productId, order.id);
      if (!result.ok) conflict = true;
    }
    if (conflict) {
      decision.patch.status = undefined;
      decision.patch.allowReopen = false;
      decision.patch.note =
        "Pago aprobado, pero la pieza ya no estaba disponible. Hay que revisarlo en Mercado Pago.";
    }
  }

  const updated = await saveOrderPayment(order.id, decision.patch);
  if (decision.release) {
    for (const item of order.items || []) {
      if (item.productId) await releaseProductIfHeldBy(item.productId, order.id);
    }
  }

  console.info("MP payment", payment?.id, payment?.status, orderId, decision.action);
  return {
    ok: true,
    reason: conflict ? "pagado_sin_pieza" : decision.action,
    orderId,
    paymentStatus: updated?.paymentStatus || decision.patch.paymentStatus,
    conflict,
  };
}

export async function fetchAndApplyPayment(paymentId) {
  const payment = await mpFetch(`/v1/payments/${paymentId}`);
  const result = await applyMercadoPagoPayment(payment);
  return { payment, result };
}
