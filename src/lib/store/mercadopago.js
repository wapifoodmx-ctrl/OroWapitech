import crypto from "crypto";

/**
 * Cliente Mercado Pago adaptado de NewWapifood (`src/lib/mercadopago.js`).
 * Misma API HTTP, misma firma de webhook y las mismas variables de entorno.
 * WapiFood cobra planes (external_reference JSON). Aquí el external_reference
 * es el id del pedido: es el dato que el webhook necesita para esta tienda.
 *
 * No usa el SDK de navegador. Checkout Pro redirige a init_point.
 * MERCADO_PAGO_PUBLIC_KEY queda en el entorno (igual que WapiFood) y no se lee.
 */

const MP_API = "https://api.mercadopago.com";

export function isMpMock() {
  return String(process.env.MERCADO_PAGO_MOCK || "") === "1";
}

export function getMpToken() {
  const token = (process.env.MERCADO_PAGO_ACCESS_TOKEN || "").trim();
  if (!token && isMpMock()) return "TEST-MOCK";
  return token;
}

function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0] || "";
  return raw || "";
}

/**
 * URL pública del sitio sin variable nueva.
 * Igual que WapiFood: origen de la petición y, si no viene,
 * VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL.
 */
export function getSiteUrl(request) {
  if (request) {
    const origin = headerValue(request.headers, "origin");
    if (origin) return String(origin).replace(/\/$/, "");
    const host = headerValue(request.headers, "x-forwarded-host") || headerValue(request.headers, "host");
    if (host) {
      const proto = headerValue(request.headers, "x-forwarded-proto") || "https";
      return `${proto}://${host}`.replace(/\/$/, "");
    }
  }
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "";
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${host}`;
  }
  return "http://localhost:3000";
}

export function mpCurrency() {
  const country = (process.env.MERCADO_PAGO_COUNTRY || "MX").trim().toUpperCase();
  const map = {
    MX: "MXN",
    AR: "ARS",
    BR: "BRL",
    CL: "CLP",
    CO: "COP",
    PE: "PEN",
    UY: "UYU",
  };
  return map[country] || "MXN";
}

export async function mpFetch(path, { method = "GET", body } = {}) {
  if (isMpMock()) {
    if (method === "POST" && path === "/checkout/preferences") {
      const id = `pref_mock_${Date.now().toString(36)}`;
      const back = body?.back_urls?.success || "http://localhost:3000/pago/exito";
      return {
        id,
        init_point: `${back}?preference_id=${id}&mock=1`,
        sandbox_init_point: `${back}?preference_id=${id}&mock=1`,
        external_reference: body?.external_reference || null,
        notification_url: body?.notification_url || null,
        items: body?.items || [],
        back_urls: body?.back_urls || null,
      };
    }
    if (String(path).startsWith("/v1/payments/")) {
      const id = String(path).split("/").pop();
      const stored = globalThis.__OL_MP_PAYMENTS?.[id];
      if (stored) return stored;
      const err = new Error("Pago mock no encontrado");
      err.status = 404;
      throw err;
    }
  }

  const token = getMpToken();
  if (!token) throw new Error("Falta MERCADO_PAGO_ACCESS_TOKEN");
  const res = await fetch(`${MP_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || data?.error || `Mercado Pago HTTP ${res.status}`;
    const err = new Error(msg);
    err.detail = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * Firma oficial de webhooks de Mercado Pago (header x-signature + secreto).
 * data.id se toma de la query. Si es alfanumérico, va en minúsculas.
 * Acepta el Request de App Router y el req de Pages Router.
 */
export function verifyMercadoPagoWebhook(request, dataId) {
  const secret = (process.env.MERCADO_PAGO_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    return { ok: false, reason: "falta MERCADO_PAGO_WEBHOOK_SECRET" };
  }
  const xSignature = headerValue(request?.headers, "x-signature");
  const xRequestId = headerValue(request?.headers, "x-request-id") || "";
  if (!xSignature) {
    return { ok: false, reason: "sin firma" };
  }

  let ts = "";
  let hash = "";
  for (const part of xSignature.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "ts") ts = value;
    if (key === "v1") hash = value;
  }
  if (!ts || !hash || dataId == null || String(dataId).trim() === "") {
    return { ok: false, reason: "firma incompleta" };
  }

  const id = String(dataId).toLowerCase();
  const manifest = `id:${id};request-id:${xRequestId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "firma inválida" };
  }
  return { ok: true };
}

export function signMercadoPagoWebhook({ secret, dataId, requestId, ts }) {
  const id = String(dataId).toLowerCase();
  const manifest = `id:${id};request-id:${requestId || ""};ts:${ts};`;
  const v1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

/** topic/id tal como los lee el webhook de WapiFood (query + body). */
export function readWebhookNotification(req) {
  const rawUrl = req.url || req.originalUrl || "/api/mercadopago/webhook";
  const url = new URL(rawUrl, "http://localhost");
  const q = req.query || {};
  let topic = url.searchParams.get("topic") || url.searchParams.get("type") || q.topic || q.type || "";
  let paymentId =
    url.searchParams.get("id") ||
    url.searchParams.get("data.id") ||
    q.id ||
    q["data.id"] ||
    q.data?.id ||
    "";
  const payload = req.body && typeof req.body === "object" ? req.body : {};

  if (req.method === "POST") {
    topic = topic || payload.topic || payload.type || payload.action;
    paymentId =
      paymentId ||
      payload?.data?.id ||
      (payload?.resource ? String(payload.resource).split("/").pop() : null);
  }

  if (topic && String(topic).includes("payment")) topic = "payment";
  const signatureId = url.searchParams.get("data.id") || q["data.id"] || q.data?.id || paymentId;
  return {
    topic: topic || "",
    paymentId: paymentId != null ? String(paymentId) : "",
    signatureId: signatureId != null ? String(signatureId) : "",
  };
}

/**
 * Crea la preferencia. Si MP rechaza auto_return o notification_url
 * (típico en http://localhost), reintenta sin ese campo.
 */
export async function createCheckoutPreference(body) {
  try {
    return await mpFetch("/checkout/preferences", { method: "POST", body });
  } catch (error) {
    const msg = JSON.stringify(error.detail || error.message || "");
    if (!/auto_return|back_url|notification_url/i.test(msg)) throw error;
    const relaxed = { ...body };
    if (/auto_return|back_url/i.test(msg)) delete relaxed.auto_return;
    if (/notification_url/i.test(msg)) delete relaxed.notification_url;
    return mpFetch("/checkout/preferences", { method: "POST", body: relaxed });
  }
}
