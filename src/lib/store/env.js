/**
 * Lee variables en el momento de la petición.
 * Next.js sustituye `process.env.NOMBRE` al construir. Si la variable es
 * "Sensitive" en Vercel, no existe durante el build y queda vacía para siempre.
 * `process.env[nombre]` se lee cuando la función corre, ya con las variables reales.
 */
export function readServerEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function supabaseUrl() {
  return readServerEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
}

export function supabaseSecretKey() {
  return readServerEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
}

export function supabasePublishableKey() {
  return readServerEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
  );
}

export function missingSupabaseMessage() {
  const missing = [];
  if (!supabaseUrl()) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseSecretKey()) missing.push("SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY)");
  if (!supabasePublishableKey()) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }
  if (!missing.length) return "";
  return `Faltan variables de Supabase en el servidor: ${missing.join(", ")}. En Vercel deben estar disponibles al ejecutar la función.`;
}
