import { redirect } from "next/navigation";
import { CreateMedia } from "@/components/create-media";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { backendGet } from "@/lib/backend";
import type { MediaOnboardingContext } from "@/lib/contracts/media";
import type { DashboardContext } from "@/lib/contracts/context";
import type { MediaSetupPreferences } from "@/lib/contracts/media-setup";
import type { PlatformCategory } from "@/lib/contracts/platform-categories";
import type { SiteWorkspace } from "@/lib/contracts/sites";
import type { EditorialWorkspace } from "@/lib/contracts/editorial";
import type { MediaSourceAccessRequest } from "@/lib/contracts/media-setup";

export default async function CreateMediaPage({ searchParams }: { searchParams: Promise<{ step?: string; new?: string }> }) {
  const params = await searchParams;
  const onboarding = await backendGet<MediaOnboardingContext>("/api/v1/media/onboarding");
  if (!onboarding?.canCreateMedia) redirect("/login");
  const context = onboarding.hasMedia ? await backendGet<DashboardContext>("/api/v1/context") : null;
  if (onboarding.hasMedia && !context) redirect("/");
  const [preferences, categories, siteWorkspace, editorialWorkspace, sourceRequests] = await Promise.all([
    context ? backendGet<MediaSetupPreferences>("/api/v1/media/setup") : null,
    backendGet<PlatformCategory[]>("/api/v1/media/source-categories"),
    context ? backendGet<SiteWorkspace>("/api/v1/sites") : null,
    context ? backendGet<EditorialWorkspace>("/api/v1/editorial") : null,
    context ? backendGet<MediaSourceAccessRequest[]>("/api/v1/media/source-access-requests") : null,
  ]);
  const requestedStep = params.step === "5" ? 4 : Number(params.step);
  const creatingNew = !onboarding.hasMedia || params.new === "1";
  const hasSiteBrief = siteWorkspace?.sites.some(site => site.status !== "archived" && site.spec.designBrief);
  const resumeStep = preferences?.setupStep ?? 2;
  const initialStep = creatingNew || !preferences?.editorialViewpoint.trim() || !hasSiteBrief
    ? 1
    : Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= (preferences?.setupStep ?? 4) ? requestedStep : resumeStep;
  return (
    <main className="media-create-page">
      {onboarding.impersonated && <ImpersonationBanner />}
      <CreateMedia adminName={onboarding.name} hasMedia={onboarding.hasMedia} creatingNew={creatingNew} activeMediaId={context?.activeMedia.id ?? null} activeMediaName={context?.activeMedia.name ?? null} activeMediaLogo={context?.activeMedia.logo ?? null} initialStep={initialStep} initialPreferences={preferences} categories={categories ?? []} categoryLoadFailed={categories === null} initialSiteWorkspace={siteWorkspace} initialEditorialWorkspace={editorialWorkspace} sourceRequests={sourceRequests ?? []} />
    </main>
  );
}
