import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import { DemoBar } from "@/components/demo-bar";
import { Topbar } from "@/components/topbar";
import { Toaster } from "@/components/toaster";
import { CommandPalette } from "@/components/command-palette";
import { PwaRegister } from "@/components/pwa/register";
import { NotificationsProvider } from "@/components/shell/bell";
import { ShortcutsListener } from "@/components/shell/shortcuts-listener";
import { OnboardingBanner } from "@/components/shell/onboarding";
import { listSavedViews } from "@/actions/preferences";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dayKey } from "@/lib/utils";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [profile, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const today = dayKey();

  // Pastilles du menu : tâches dues et prospects à relancer ; vues enregistrées du membre
  const [{ count: due }, { count: followUps }, views] = await Promise.all([
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("done", false).lte("due_date", today).in("entity_id", scope.ids),
    supabase.from("leads").select("id", { count: "exact", head: true }).in("stage", ["nouveau", "contacte", "essai", "offre"]).lte("next_action_on", today).in("entity_id", scope.ids),
    listSavedViews().catch(() => []),
  ]);

  return (
    <NotificationsProvider>
      <div className="lg:flex">
        <Sidebar
          name={profile.full_name || profile.email}
          role={profile.role}
          job={profile.job_title}
          badges={{ "/taches": due ?? 0, "/prospects": followUps ?? 0 }}
          current={scope.current}
          allowed={scope.allowed}
          views={views}
        />
        <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-5">
          <div className="mx-auto max-w-[1200px]">
            <Topbar />
            <OnboardingBanner />
            {children}
          </div>
        </main>
        <CommandPalette role={profile.role} />
        <ShortcutsListener />
        <Suspense>
          <Toaster />
        </Suspense>
        <PwaRegister />
        <DemoBar />
      </div>
    </NotificationsProvider>
  );
}
