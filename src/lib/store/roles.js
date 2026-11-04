/** El rol de administrador sale de la base o de app_metadata. Nunca de user_metadata. */
export function resolveRole(profile, authUser) {
  const appRole = authUser?.app_metadata?.role;
  if (appRole === "admin" || profile?.role === "admin") return "admin";
  return "customer";
}

export function safeNextPath(value, fallback = "/cuenta") {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
