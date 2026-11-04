import assert from "node:assert/strict";
import test from "node:test";
import { buildPaymentPatch, readOrderIdFromPayment, reservationIsStale, centavosToUnitPrice, RESERVATION_TTL_MS } from "../src/lib/store/payment-decision.js";
import {
  createCheckoutPreference,
  mpCurrency,
  readWebhookNotification,
  signMercadoPagoWebhook,
  verifyMercadoPagoWebhook,
} from "../src/lib/store/mercadopago.js";
import { createPreferenceForOrder } from "../src/lib/store/payments.js";
import { calculateSalePrice, normalizeSpotMap, validateShippingMx } from "../src/lib/store/mx-validate.js";
import { assertStatusTransition } from "../src/lib/store/order-status.js";

process.env.MERCADO_PAGO_MOCK = "1";
process.env.MERCADO_PAGO_COUNTRY = "MX";
process.env.MERCADO_PAGO_WEBHOOK_SECRET = "secreto-de-prueba";

const baseOrder = {
  id: "ord_1",
  status: "recibido",
  paymentStatus: "pendiente",
  mpPaymentId: null,
  mpStatus: null,
  mpPreferenceId: null,
};

test("precio spot: spot × peso × 1.35 × 1.16", () => {
  const sale = calculateSalePrice({ weightGrams: 2, spotPerGram: 100, marginPercent: 35, ivaPercent: 16 });
  assert.equal(sale.pesos, 313.2);
  assert.equal(sale.centavos, 31320);
});

test("spot 18k y 18K se unifican", () => {
  const map = normalizeSpotMap({ "18k": "100", "18K": 80, "14k": "", "99K": 10 });
  assert.deepEqual(map, { "18K": 100 });
});

test("envío de México exige todos los campos", () => {
  assert.match(validateShippingMx({ fullName: "Ana" }) || "", /obligatorios/);
  const ok = {
    fullName: "Ana López",
    phone: "5512345678",
    street: "Reforma",
    extNumber: "10",
    intNumber: "S/N",
    neighborhood: "Centro",
    city: "CDMX",
    state: "Ciudad de México",
    zip: "06000",
    betweenStreets: "Insurgentes y Balderas",
    references: "Portón negro",
  };
  assert.equal(validateShippingMx(ok), null);
  assert.match(validateShippingMx({ ...ok, state: "Texas" }) || "", /estado/i);
});

test("centavos a pesos de Mercado Pago", () => {
  assert.equal(centavosToUnitPrice(1999), 19.99);
  assert.equal(mpCurrency(), "MXN");
});

test("firma de webhook igual al manifiesto de WapiFood", () => {
  const dataId = "PAY123abc";
  const requestId = "req-1";
  const ts = "1700000000";
  const header = signMercadoPagoWebhook({
    secret: process.env.MERCADO_PAGO_WEBHOOK_SECRET,
    dataId,
    requestId,
    ts,
  });
  const req = { headers: { "x-signature": header, "x-request-id": requestId } };
  assert.deepEqual(verifyMercadoPagoWebhook(req, dataId), { ok: true });
  assert.equal(verifyMercadoPagoWebhook(req, "otro").ok, false);
  assert.equal(verifyMercadoPagoWebhook({ headers: {} }, dataId).reason, "sin firma");
});

test("lee topic payment.created y data.id", () => {
  const note = readWebhookNotification({
    method: "POST",
    url: "/api/mercadopago/webhook?data.id=999&type=payment",
    body: { action: "payment.created", data: { id: "999" } },
  });
  assert.equal(note.topic, "payment");
  assert.equal(note.paymentId, "999");
  assert.equal(note.signatureId, "999");
});

test("preferencia: external_reference es el pedido y el precio va en pesos", async () => {
  const pref = await createPreferenceForOrder({
    order: {
      id: "ord_test",
      userId: "usr_1",
      items: [{ productId: "prd_1", name: "Anillo sello", price: 1999 }],
    },
    payer: { id: "usr_1", email: "ana@correo.mx", name: "Ana" },
    req: { headers: { host: "localhost:3000", "x-forwarded-proto": "http" } },
  });
  assert.equal(pref.external_reference, "ord_test");
  assert.equal(pref.items[0].unit_price, 19.99);
  assert.equal(pref.items[0].currency_id, "MXN");
  assert.equal(pref.items[0].quantity, 1);
  assert.equal(pref.notification_url, "http://localhost:3000/api/mercadopago/webhook");
  assert.equal(pref.back_urls.success, "http://localhost:3000/pago/exito");
  assert.equal(pref.back_urls.pending, "http://localhost:3000/pago/pendiente");
  assert.equal(pref.back_urls.failure, "http://localhost:3000/pago/fallo");
  assert.match(pref.init_point, /pago\/exito/);
});

test("createCheckoutPreference reintenta sin auto_return si MP lo rechaza", async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async (_url, init) => {
    calls += 1;
    const body = JSON.parse(init.body);
    if (calls === 1) {
      assert.equal(body.auto_return, "approved");
      return new Response(JSON.stringify({ message: "auto_return invalid" }), { status: 400 });
    }
    assert.equal(body.auto_return, undefined);
    assert.equal(body.external_reference, "ord_retry");
    return new Response(JSON.stringify({ id: "pref_ok", init_point: "https://mp.test/ok" }), { status: 201 });
  };
  process.env.MERCADO_PAGO_MOCK = "0";
  process.env.MERCADO_PAGO_ACCESS_TOKEN = "TEST-token";
  try {
    const pref = await createCheckoutPreference({
      items: [{ title: "Pieza", quantity: 1, unit_price: 10, currency_id: "MXN" }],
      external_reference: "ord_retry",
      auto_return: "approved",
      notification_url: "https://ejemplo.mx/api/mercadopago/webhook",
    });
    assert.equal(pref.id, "pref_ok");
    assert.equal(calls, 2);
  } finally {
    global.fetch = original;
    process.env.MERCADO_PAGO_MOCK = "1";
    delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
  }
});

test("aprobado confirma y vende; el repetido no hace nada", () => {
  const first = buildPaymentPatch(baseOrder, { id: 55, status: "approved", preference_id: "pref_1" });
  assert.equal(first.action, "approve");
  assert.equal(first.confirm, true);
  assert.equal(first.release, false);
  assert.equal(first.patch.paymentStatus, "pagado");
  assert.equal(first.patch.status, "confirmado");

  const again = buildPaymentPatch(
    { ...baseOrder, paymentStatus: "pagado", mpPaymentId: "55", mpStatus: "approved", status: "confirmado" },
    { id: 55, status: "approved" },
  );
  assert.equal(again.action, "noop");
});

test("pendiente no libera; rechazado cancela y libera; reembolso también", () => {
  const pending = buildPaymentPatch(baseOrder, { id: 7, status: "pending" });
  assert.equal(pending.action, "pending");
  assert.equal(pending.release, false);
  assert.equal(pending.patch.paymentStatus, "pendiente");

  const rejected = buildPaymentPatch(
    { ...baseOrder, mpPaymentId: "7", mpStatus: "pending" },
    { id: 7, status: "rejected" },
  );
  assert.equal(rejected.action, "fail");
  assert.equal(rejected.release, true);
  assert.equal(rejected.patch.status, "cancelado");
  assert.equal(rejected.patch.paymentStatus, "rechazado");

  const refund = buildPaymentPatch(
    { ...baseOrder, status: "confirmado", paymentStatus: "pagado", mpPaymentId: "7", mpStatus: "approved" },
    { id: 7, status: "refunded" },
  );
  assert.equal(refund.action, "refund");
  assert.equal(refund.release, true);
  assert.equal(refund.patch.paymentStatus, "reembolsado");
});

test("un pago ya aprobado no se degrada con un rechazo tardío", () => {
  const late = buildPaymentPatch(
    { ...baseOrder, status: "confirmado", paymentStatus: "pagado", mpPaymentId: "9", mpStatus: "approved" },
    { id: 10, status: "rejected" },
  );
  assert.equal(late.action, "noop");
  assert.equal(late.reason, "ya pagado");
});

test("external_reference plano y metadata", () => {
  assert.equal(readOrderIdFromPayment({ external_reference: "ord_abc" }), "ord_abc");
  assert.equal(readOrderIdFromPayment({ metadata: { order_id: "ord_meta" } }), "ord_meta");
});

test("la reserva de una pieza en envío no vence; la abandonada sí", () => {
  const product = { reservedOrderId: "ord_1", sold: false, reservedAt: new Date(Date.now() - RESERVATION_TTL_MS - 1000).toISOString() };
  assert.equal(reservationIsStale(product, { ...baseOrder, status: "en_envio", paymentStatus: "pendiente" }), false);
  assert.equal(reservationIsStale(product, { ...baseOrder, mpStatus: "pending" }), false);
  assert.equal(reservationIsStale(product, { ...baseOrder, paymentStatus: "pendiente", mpStatus: null }), true);
});

test("no se puede regresar el estatus ni reabrir un cancelado sin el pago", () => {
  assert.throws(() => assertStatusTransition("enviado", "recibido"), /regresar/);
  assert.throws(() => assertStatusTransition("cancelado", "confirmado"), /cancelado/);
  assert.doesNotThrow(() => assertStatusTransition("cancelado", "confirmado", { allowReopen: true }));
  assert.doesNotThrow(() => assertStatusTransition("recibido", "cancelado"));
});
