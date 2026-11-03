/**
 * Decisiones puras del pago (sin red ni base de datos).
 * El webhook de Mercado Pago consulta el pago y luego aplica este resultado.
 */

export const RESERVATION_TTL_MS = 2 * 60 * 60 * 1000;

const PENDING_MP = new Set(["pending", "in_process", "in_mediation", "authorized"]);
const UNSHIPPED = new Set(["recibido", "confirmado"]);

export function centavosToUnitPrice(cents) {
  const n = Math.round(Number(cents) || 0);
  return n / 100;
}

export function readOrderIdFromPayment(payment) {
  const ref = payment?.external_reference;
  if (ref && typeof ref === "object") {
    if (ref.orderId) return String(ref.orderId);
    if (ref.order_id) return String(ref.order_id);
  }
  const text = ref == null ? "" : String(ref).trim();
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.orderId || parsed.order_id) return String(parsed.orderId || parsed.order_id);
    } catch {
      /* external_reference plano */
    }
  }
  if (text && !text.includes("|")) return text;
  const meta = payment?.metadata || {};
  if (meta.order_id) return String(meta.order_id);
  if (meta.orderId) return String(meta.orderId);
  return "";
}

/**
 * Reserva vencida solo si nadie empezó un pago en efectivo / en proceso.
 * Un ticket pendiente (OXXO, SPEI) no se libera a las 2 horas.
 */
export function reservationIsStale(product, order, now = Date.now()) {
  if (!product?.reservedOrderId) return false;
  if (product.sold) return false;
  if (!order) return true;
  if (order.paymentStatus === "pagado") return false;
  if (["en_envio", "enviado", "finalizado"].includes(order.status)) return false;
  const mp = String(order.mpStatus || "");
  if (PENDING_MP.has(mp)) return false;
  const started = new Date(product.reservedAt || order.createdAt || 0).getTime();
  if (!Number.isFinite(started) || started <= 0) return false;
  return now - started > RESERVATION_TTL_MS;
}

function basePatch(order, payment) {
  const paymentId = payment?.id != null ? String(payment.id) : "";
  return {
    mpPaymentId: paymentId || order.mpPaymentId || null,
    mpPreferenceId: payment?.preference_id || order.mpPreferenceId || null,
    mpStatus: payment?.status ? String(payment.status) : order.mpStatus || null,
    mpStatusDetail: payment?.status_detail ? String(payment.status_detail) : "",
  };
}

/**
 * @returns {{
 *   action: "noop"|"approve"|"pending"|"fail"|"refund",
 *   reason?: string,
 *   patch: object|null,
 *   release: boolean,
 *   confirm: boolean,
 * }}
 */
export function buildPaymentPatch(order, payment) {
  const mpStatus = String(payment?.status || "");
  const paymentId = payment?.id != null ? String(payment.id) : "";
  const base = basePatch(order, payment);

  if (
    paymentId &&
    order.mpPaymentId === paymentId &&
    order.mpStatus === mpStatus &&
    order.paymentStatus
  ) {
    return { action: "noop", reason: "ya procesado", patch: null, release: false, confirm: false };
  }

  if (order.paymentStatus === "pagado" && mpStatus !== "refunded" && mpStatus !== "charged_back") {
    return { action: "noop", reason: "ya pagado", patch: null, release: false, confirm: false };
  }

  if (mpStatus === "approved") {
    const canConfirm = order.status === "recibido" || order.status === "cancelado";
    return {
      action: "approve",
      patch: {
        ...base,
        paymentStatus: "pagado",
        paidAt: payment.date_approved || new Date().toISOString(),
        status: canConfirm ? "confirmado" : undefined,
        allowReopen: order.status === "cancelado",
        note: "Pago aprobado en Mercado Pago",
      },
      release: false,
      confirm: true,
    };
  }

  if (PENDING_MP.has(mpStatus)) {
    return {
      action: "pending",
      patch: {
        ...base,
        paymentStatus: "pendiente",
        note: "Pago pendiente en Mercado Pago",
      },
      release: false,
      confirm: false,
    };
  }

  if (mpStatus === "rejected" || mpStatus === "cancelled") {
    const unshipped = UNSHIPPED.has(order.status);
    const paymentStatus = mpStatus === "cancelled" ? "cancelado" : "rechazado";
    return {
      action: "fail",
      patch: {
        ...base,
        paymentStatus,
        status: unshipped ? "cancelado" : undefined,
        note:
          mpStatus === "cancelled"
            ? "Pago cancelado en Mercado Pago"
            : "Pago rechazado en Mercado Pago",
      },
      release: unshipped || order.status === "cancelado",
      confirm: false,
    };
  }

  if (mpStatus === "refunded" || mpStatus === "charged_back") {
    const unshipped = UNSHIPPED.has(order.status);
    return {
      action: "refund",
      patch: {
        ...base,
        paymentStatus: "reembolsado",
        status: unshipped ? "cancelado" : undefined,
        note: "Pago reembolsado o contracargo en Mercado Pago",
      },
      release: unshipped,
      confirm: false,
    };
  }

  return {
    action: "noop",
    reason: `status=${mpStatus || "vacío"}`,
    patch: null,
    release: false,
    confirm: false,
  };
}
