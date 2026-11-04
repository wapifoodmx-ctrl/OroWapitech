export const ORDER_STATUSES = [
  { id: "recibido", label: "Pedido recibido por la tienda", step: 1 },
  { id: "confirmado", label: "Pedido confirmado por la tienda", step: 2 },
  { id: "en_envio", label: "Pedido en proceso de envío", step: 3 },
  { id: "enviado", label: "Pedido enviado", step: 4 },
  { id: "finalizado", label: "Pedido finalizado", step: 5 },
  { id: "cancelado", label: "Pedido cancelado", step: 0 },
];

export function statusLabel(id) {
  return ORDER_STATUSES.find((s) => s.id === id)?.label || id || "Pedido recibido por la tienda";
}

/** Estatus a los que se puede avanzar. Cancelado es terminal. */
export function nextStatuses(current) {
  if (current === "cancelado") return [{ id: "cancelado", label: "Pedido cancelado", step: 0 }];
  const progressive = ORDER_STATUSES.filter((s) => s.id !== "cancelado");
  const idx = progressive.findIndex((s) => s.id === current);
  if (idx < 0) return ORDER_STATUSES;
  return [...progressive.slice(idx), ORDER_STATUSES.find((s) => s.id === "cancelado")];
}

export function isOrderLocked(status) {
  return status === "cancelado" || status === "finalizado";
}

export function canEditShipping(status) {
  return status === "recibido" || status === "confirmado";
}

const FLOW = ["recibido", "confirmado", "en_envio", "enviado", "finalizado"];

/** Impide regresos. Cancelar siempre se puede, salvo finalizado. Un pago aprobado puede reabrir un cancelado. */
export function assertStatusTransition(from, to, { allowReopen = false } = {}) {
  if (!to || from === to) return;
  if (from === "finalizado") {
    throw new Error("Un pedido finalizado no puede cambiar de estatus");
  }
  if (from === "cancelado") {
    if (allowReopen && to === "confirmado") return;
    throw new Error("Un pedido cancelado no puede cambiar de estatus");
  }
  if (to === "cancelado") return;
  const fromIdx = FLOW.indexOf(from);
  const toIdx = FLOW.indexOf(to);
  if (fromIdx < 0 || toIdx < 0 || toIdx < fromIdx) {
    throw new Error("No se puede regresar el estatus del pedido");
  }
}

export const PAYMENT_LABELS = {
  pendiente: "Pago pendiente",
  pagado: "Pagado",
  rechazado: "Pago rechazado",
  cancelado: "Pago cancelado",
  reembolsado: "Pago reembolsado",
};

export function paymentLabel(status) {
  if (!status) return "Sin registro de pago";
  return PAYMENT_LABELS[status] || status;
}

/** Pedidos viejos (sin payment_status) y los pagados sí se pueden despachar. */
export function canAdvanceFulfillment(order) {
  const pay = order?.paymentStatus;
  if (!pay || pay === "pagado") return true;
  return false;
}
