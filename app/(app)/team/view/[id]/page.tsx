import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

export default async function RetiredMemberView() {
  await requireAdmin();
  redirect("/team");
}
