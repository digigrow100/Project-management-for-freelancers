import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getProjects, listTeamMembers } from "@/lib/store";
import {
  getActivitySettings,
  listEmployeeDevices,
  listLiveScreenShares,
  listProjectDomainMappings,
  queryEmployeeActivity,
} from "@/lib/employeeActivity";
import { AdminEmployeeActivity } from "@/components/AdminEmployeeActivity";

export const dynamic = "force-dynamic";

export default async function EmployeeActivityPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") notFound();

  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const from = new Date(today + "T00:00:00+05:00");
  from.setUTCDate(from.getUTCDate() - 29);
  const [members, projects, devices, mappings, settings, liveShares, items] = await Promise.all([
    listTeamMembers(),
    getProjects(),
    listEmployeeDevices(),
    listProjectDomainMappings(),
    getActivitySettings(),
    listLiveScreenShares(),
    queryEmployeeActivity({ from: from.toISOString(), to: now.toISOString() }),
  ]);

  return (
    <AdminEmployeeActivity
      members={members.filter((member) => member.role === "member")}
      projects={projects.filter((project) => !project.archived)}
      devices={devices}
      initialMappings={mappings}
      initialSettings={settings}
      initialLiveShares={liveShares}
      initialItems={items}
    />
  );
}
