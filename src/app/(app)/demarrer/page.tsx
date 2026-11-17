import { getOnboarding } from "@/actions/preferences";
import { PageHeader } from "@/components/ui";
import { OnboardingChecklist } from "@/components/shell/onboarding";
import { getLang, t } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: t(await getLang(), "onb.title") };
}

export default async function OnboardingPage() {
  const [steps, lang] = await Promise.all([getOnboarding(), getLang()]);
  return (
    <div className="max-w-2xl">
      <PageHeader title={t(lang, "onb.title")} subtitle={t(lang, "onb.subtitle")} />
      <OnboardingChecklist steps={steps} />
    </div>
  );
}
