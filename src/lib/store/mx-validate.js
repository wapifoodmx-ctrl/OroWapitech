/** Validaciones y formatos México */

export const MX_STATES = [
  "Aguascalientes","Baja California","Baja California Sur","Campeche","Chiapas","Chihuahua",
  "Ciudad de México","Coahuila","Colima","Durango","Estado de México","Guanajuato","Guerrero",
  "Hidalgo","Jalisco","Michoacán","Morelos","Nayarit","Nuevo León","Oaxaca","Puebla","Querétaro",
  "Quintana Roo","San Luis Potosí","Sinaloa","Sonora","Tabasco","Tamaulipas","Tlaxcala","Veracruz",
  "Yucatán","Zacatecas",
];

export const KARAT_OPTIONS = Array.from({ length: 24 }, (_, i) => `${i + 1}K`);

export function onlyDigits(value, maxLen) {
  const v = String(value || "").replace(/\D/g, "");
  return maxLen ? v.slice(0, maxLen) : v;
}

export function onlyLettersSpaces(value, maxLen = 80) {
  const v = String(value || "").replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'.-]/g, "");
  return v.slice(0, maxLen);
}

export function onlyAlnumUser(value, maxLen = 24) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, maxLen);
}

export function validateEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (e.length > 80) return "Máximo 80 caracteres";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Correo inválido";
  return null;
}

export function validatePhoneMx(phone) {
  const d = onlyDigits(phone, 10);
  if (!d) return null; // opcional
  if (d.length !== 10) return "Teléfono a 10 dígitos (México)";
  return null;
}

export function validateZipMx(zip) {
  const d = onlyDigits(zip, 5);
  if (!d) return "C.P. requerido";
  if (d.length !== 5) return "C.P. debe ser 5 dígitos";
  return null;
}

export const SHIPPING_REQUIRED = [
  "fullName",
  "phone",
  "street",
  "extNumber",
  "intNumber",
  "neighborhood",
  "city",
  "state",
  "zip",
  "betweenStreets",
  "references",
];

/** null si la dirección de México está completa; si no, el mensaje de error. */
export function validateShippingMx(shipping) {
  const s = shipping || {};
  for (const key of SHIPPING_REQUIRED) {
    if (!String(s[key] ?? "").trim()) {
      return "Completa todos los datos de envío (todos son obligatorios)";
    }
  }
  if (onlyDigits(s.phone, 10).length !== 10) return "Teléfono a 10 dígitos (México)";
  const zipErr = validateZipMx(s.zip);
  if (zipErr) return zipErr;
  if (!MX_STATES.includes(String(s.state).trim())) return "Selecciona un estado de México";
  return null;
}

export function sanitizeShipping(shipping) {
  const s = shipping || {};
  return {
    fullName: onlyLettersSpaces(s.fullName, 80).trim(),
    phone: onlyDigits(s.phone, 10),
    street: String(s.street || "").trim().slice(0, 80),
    extNumber: String(s.extNumber || "").trim().slice(0, 10),
    intNumber: String(s.intNumber || "").trim().slice(0, 10),
    neighborhood: String(s.neighborhood || "").trim().slice(0, 60),
    city: onlyLettersSpaces(s.city, 60).trim(),
    state: String(s.state || "").trim().slice(0, 40),
    zip: onlyDigits(s.zip, 5),
    references: String(s.references || "").trim().slice(0, 120),
    betweenStreets: String(s.betweenStreets || "").trim().slice(0, 80),
  };
}

/** "18k" / "18" / "18K" → "18K". Vacío si no es un kilataje 1–24. */
export function normalizeKaratKey(value) {
  const raw = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!raw) return "";
  const match = raw.match(/^(\d{1,2})K?$/);
  if (!match) return "";
  const n = Number(match[1]);
  if (n < 1 || n > 24) return "";
  return `${n}K`;
}

/** Unifica llaves de spot (18k y 18K) y descarta precios vacíos o cero. */
export function normalizeSpotMap(input) {
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    const karat = normalizeKaratKey(key);
    if (!karat) continue;
    if (value === "" || value == null) continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) continue;
    const rounded = Math.round(n * 100) / 100;
    if (out[karat] == null || rounded > out[karat]) out[karat] = rounded;
  }
  return out;
}

export function formatMxnFromCentavos(cents) {
  const n = Number(cents || 0) / 100;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** pesos → centavos */
export function pesosToCentavos(pesos) {
  return Math.round(Number(pesos || 0) * 100);
}

/**
 * Precio de venta:
 * spot * peso → + margen% → + IVA%
 * retorna { centavos, pesos, breakdown }
 */
export function calculateSalePrice({ weightGrams, spotPerGram, marginPercent = 35, ivaPercent = 16 }) {
  const weight = Number(weightGrams) || 0;
  const spot = Number(spotPerGram) || 0;
  const margin = Number(marginPercent) || 0;
  const iva = Number(ivaPercent) || 0;
  const priceSpot = spot * weight;
  const withMargin = priceSpot * (1 + margin / 100);
  const withIva = withMargin * (1 + iva / 100);
  const pesos = Math.round(withIva * 100) / 100;
  return {
    pesos,
    centavos: Math.round(pesos * 100),
    breakdown: {
      weightGrams: weight,
      spotPerGram: spot,
      priceSpot: Math.round(priceSpot * 100) / 100,
      marginPercent: margin,
      withMargin: Math.round(withMargin * 100) / 100,
      ivaPercent: iva,
      withIva: pesos,
    },
  };
}
