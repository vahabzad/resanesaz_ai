import { redirect } from "next/navigation";
import type { DashboardContext } from "@/lib/contracts/context";
import type { MediaOnboardingContext } from "@/lib/contracts/media";
import type { MediaSetupPreferences } from "@/lib/contracts/media-setup";
import { backendGet } from "@/lib/backend";

export async function requireMediaSetupComplete(context: DashboardContext | null) {
  if (!context) {
    const onboarding = await backendGet<MediaOnboardingContext>("/api/v1/media/onboarding");
    if (onboarding?.canCreateMedia) redirect("/media/create");
    return;
  }
  if (context.isPlatformAdmin) return;
  const preferences = await backendGet<MediaSetupPreferences>("/api/v1/media/setup");
  if (!preferences?.setupCompleted) redirect("/media/create");
}
