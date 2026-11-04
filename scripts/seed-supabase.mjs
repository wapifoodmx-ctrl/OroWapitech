/**
 * Seed Oro Lozano → Supabase (sin archivos JSON locales).
 * Requisitos: schema.sql ya ejecutado + .env.local
 *
 *   npm run seed:supabase
 *
 * Se ejecuta en la carpeta del proyecto (misma donde está package.json).
 */
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Falta SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function hash(p) {
  return bcrypt.hash(String(p), 12);
}

async function upsert(table, rows, onConflict = "id") {
  if (!rows.length) return;
  const { error } = await sb.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`✓ ${table}: ${rows.length} filas`);
}

const emptyShipping = {
  fullName: "",
  phone: "",
  street: "",
  extNumber: "",
  intNumber: "",
  neighborhood: "",
  city: "",
  state: "",
  zip: "",
  references: "",
  betweenStreets: "",
};

function cert(uuid, weight, density, purity) {
  return {
    uuid,
    serial: `OL-${uuid.slice(0, 8).toUpperCase()}`,
    weightGrams: weight,
    density,
    densityMethod: "densímetro",
    touchstone: `Prueba de toque positiva — pureza ${purity}`,
    ultrasound: "Respuesta uniforme compatible con metal macizo.",
    tests: { touchstone: true, densimeter: true, ultrasound: true },
    notes: "Pieza única. Certificado de autenticidad Oro Lozano.",
    issuedAt: new Date().toISOString(),
    issuedBy: "Oro Lozano Atelier",
  };
}

const hugoPass = await hash("1");
const juanPass = await hash("uwu");

const users = [
  {
    id: "usr_hugo",
    username: "hugo",
    password: hugoPass,
    name: "Hugo Lozano",
    email: "hugo@orolozano.com",
    phone: "",
    role: "admin",
    shipping: { ...emptyShipping, fullName: "Hugo Lozano" },
    created_at: "2024-01-12T10:00:00.000Z",
  },
  {
    id: "usr_juan",
    username: "juan",
    password: juanPass,
    name: "Juan Pérez",
    email: "juan@correo.com",
    phone: "",
    role: "customer",
    shipping: { ...emptyShipping, fullName: "Juan Pérez" },
    created_at: "2024-03-04T16:20:00.000Z",
  },
];

const products = [
  {
    id: "prd_solitario",
    name: "Anillo Aurora",
    slug: "anillo-aurora",
    category: "anillos",
    description: "Anillo de oro 18k de diseño limpio, sin piedras. Pieza única de atelier.",
    details: "Oro amarillo 18k macizo. Acabado espejo. Sin engastes ni piedras.",
    metal: "Oro amarillo",
    purity: "18k",
    karat: "18k",
    weight_grams: 4.82,
    price: 2890000,
    stock: 1,
    image: "/products/anillo-solitario.svg",
    images: ["/products/anillo-solitario.svg"],
    featured: true,
    active: true,
    stones: "none",
    stones_note: "Sin piedras. Piezas con piedras solo sobre pedido.",
    certificate: cert("1babddda-e67d-4391-b4a1-a711cf622d78", 4.82, 15.5, "18k"),
    created_at: "2025-06-01T12:00:00.000Z",
  },
  {
    id: "prd_tennis",
    name: "Cadena Riviera",
    slug: "cadena-riviera",
    category: "collares",
    description: "Cadena de oro 18k de eslabón continuo. Brillo natural del metal, sin piedras.",
    details: "40 cm. Oro 18k. Cierre de caja. Pieza única.",
    metal: "Oro amarillo",
    purity: "18k",
    karat: "18k",
    weight_grams: 12.4,
    price: 5650000,
    stock: 1,
    image: "/products/collar-tennis.svg",
    images: ["/products/collar-tennis.svg"],
    featured: true,
    active: true,
    stones: "none",
    stones_note: "Sin piedras.",
    certificate: cert("2cacceeb-f78e-5402-c5b2-b822dg733e89", 12.4, 15.5, "18k"),
    created_at: "2025-06-02T12:00:00.000Z",
  },
  {
    id: "prd_plata",
    name: "Brazalete Plata 925",
    slug: "brazalete-plata-925",
    category: "pulseras",
    description: "Brazalete rígido en plata 925. Acabado satinado, sin piedras.",
    details: "Plata de ley 925. Apertura de bisagra. Pieza única.",
    metal: "Plata",
    purity: "925",
    karat: "925",
    weight_grams: 18.3,
    price: 890000,
    stock: 1,
    image: "/products/brazalete-diamantes.svg",
    images: ["/products/brazalete-diamantes.svg"],
    featured: true,
    active: true,
    stones: "none",
    stones_note: "Sin piedras.",
    certificate: cert("3dbddffc-089f-6513-d6c3-c933eh844f90", 18.3, 10.4, "925"),
    created_at: "2025-06-03T12:00:00.000Z",
  },
];

try {
  await upsert("users", users);
  await upsert("products", products);
  console.log("\nSeed completo (contraseñas hasheadas con bcrypt).");
  console.log("Admin: hugo / 1");
  console.log("Cliente: juan / uwu");
  console.log("Después corre migration_v15_auth.sql y luego: npm run auth:migrate");
} catch (e) {
  console.error("\nSeed falló:", e.message);
  console.error("¿Ya corriste supabase/schema.sql en el SQL Editor?");
  process.exit(1);
}
