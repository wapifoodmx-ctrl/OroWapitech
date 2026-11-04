import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/store/env";

export async function proxy(request) {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          Object.entries(headers || {}).forEach(([header, value]) => {
            response.headers.set(header, value);
          });
        },
      },
    });
    await supabase.auth.getUser();
  } catch (error) {
    console.error("[orolozano] proxy auth", error?.message || error);
    return NextResponse.next();
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
