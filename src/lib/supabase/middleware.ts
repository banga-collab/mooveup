import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/auth", "/reserver", "/api/calendar", "/api/cron", "/manifest.webmanifest", "/sw.js", "/api/stripe/webhook", "/api/cmi"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (process.env.NEXT_PUBLIC_DEMO === "1") {
    const p = request.nextUrl.pathname;
    const logged = !!request.cookies.get("demo_user")?.value;
    const open = PUBLIC_PATHS.some((x) => p.startsWith(x));
    if (p === "/setup") return NextResponse.redirect(new URL("/", request.url));
    if (!logged && !open) return NextResponse.redirect(new URL("/login", request.url));
    if (logged && (p === "/login" || p === "/signup")) return NextResponse.redirect(new URL("/", request.url));
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Pas encore configuré : on affiche la page de configuration.
    if (request.nextUrl.pathname !== "/setup") {
      return NextResponse.redirect(new URL("/setup", request.url));
    }
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p)) || path === "/setup";

  if (!user && !isPublic) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }
  if (user && (path === "/login" || path === "/signup")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}
