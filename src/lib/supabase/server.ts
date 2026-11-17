import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { DEMO, DEMO_ACCOUNTS, demoClient } from "../demo";

export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  if (DEMO) {
    const id = cookieStore.get("demo_user")?.value ?? null;
    return demoClient(DEMO_ACCOUNTS.some((a) => a.userId === id) ? id : null);
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Appelé depuis un Server Component : le middleware rafraîchit la session.
          }
        },
      },
    },
  );
}
