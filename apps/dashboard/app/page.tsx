import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { getDashboardContext } from "@/lib/server/context";

export default async function HomePage() {
  const context = await getDashboardContext(await headers());
  if (!context) redirect("/login");
  return <Dashboard context={context} />;
}
