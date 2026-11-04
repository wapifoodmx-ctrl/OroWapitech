import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { serialize } from "cookie";
import { missingSupabaseMessage, supabasePublishableKey, supabaseSecretKey, supabaseUrl } from "./env.js";

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        const name = part.slice(0, index);
        const raw = part.slice(index + 1);
        try {
          return [name, decodeURIComponent(raw)];
        } catch {
          return [name, raw];
        }
      }),
  );
}

function requireUrlAndKey(key, label) {
  const url = supabaseUrl();
  if (!url || !key) {
    const error = new Error(missingSupabaseMessage() || `Falta configurar Supabase (${label})`);
    error.status = 500;
    throw error;
  }
  return url;
}

/** Cliente admin. Ignora RLS. Solo en el servidor. */
export function getAdminClient() {
  const key = supabaseSecretKey();
  const url = requireUrlAndKey(key, "llave de servicio");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cliente de sesión para API routes (Pages Router).
 * Lee y escribe las cookies de Supabase Auth en esta petición.
 */
export function createSupabaseRouteClient(req, res) {
  const key = supabasePublishableKey();
  const url = requireUrlAndKey(key, "llave publicable");
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        const parsed = parseCookies(req.headers?.cookie || "");
        return Object.entries(parsed).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet, headers) {
        const previous = res.getHeader?.("Set-Cookie");
        const list = previous
          ? (Array.isArray(previous) ? previous.map(String) : [String(previous)])
          : [];
        for (const { name, value, options } of cookiesToSet || []) {
          list.push(serialize(name, value, options || {}));
        }
        if (list.length) res.setHeader("Set-Cookie", list);
        if (headers) {
          for (const [header, value] of Object.entries(headers)) {
            if (header.toLowerCase() === "set-cookie") continue;
            res.setHeader(header, value);
          }
        }
      },
    },
  });
}

export function publicImageUrl(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("/")) {
    return path;
  }
  const url = supabaseUrl();
  if (!url) return path;
  return `${url}/storage/v1/object/public/products/${path.replace(/^\/+/, "")}`;
}
