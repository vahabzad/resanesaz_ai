import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { backendGet } from "@/lib/backend";
import type { DashboardContext, PlatformContext } from "@/lib/contracts/context";
import type { MediaOnboardingContext } from "@/lib/contracts/media";
import type { MediaSetupPreferences } from "@/lib/contracts/media-setup";

export default async function HomePage() {
  const context = await backendGet<DashboardContext>("/api/v1/context");
  if (!context) {
    const platform = await backendGet<PlatformContext>("/api/v1/platform/context");
    if (platform?.isPlatformAdmin) redirect("/platform/sources");
    const onboarding = await backendGet<MediaOnboardingContext>("/api/v1/media/onboarding");
    if (onboarding?.canCreateMedia) redirect("/media/create");
    redirect("/login");
  }
  if (!context.isPlatformAdmin) {
    const setup = await backendGet<MediaSetupPreferences>("/api/v1/media/setup");
    if (!setup?.setupCompleted) redirect("/media/create");
  }
  return <Dashboard context={context} />;
}
