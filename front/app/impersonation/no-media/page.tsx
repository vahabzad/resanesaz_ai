import { redirect } from "next/navigation";

export default async function ImpersonationNoMediaPage() {
  redirect("/media/create");
}
