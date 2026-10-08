import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import {
  getBusinessProfile,
  listKeywordGroups,
  listKeywordPages,
  listKeywords,
  listPaymentPlansForProject,
  listProjectPages,
  listPageAuditChecks,
  listProjectAttachments,
  listSeoReports,
  listSeoModuleAssignments,
  listSeoWorkflowItems,
  getReportPreferences,
  getProject,
  redactProjectClientData,
  getProjectProgress,
  isProjectAssignedToUser,
  listPaymentsForProject,
  getTasksByProject,
  listTeamMembers,
  listWebAppFeatures,
  listWebAppSubFeatures,
} from "@/lib/store";
import { ProgressBar } from "@/components/ProgressBar";
import { StageBoard } from "@/components/StageBoard";
import { TaskRow } from "@/components/TaskRow";
import { ArchiveToggle } from "@/components/ArchiveToggle";
import { DeleteProjectPanel } from "@/components/DeleteProjectPanel";
import { ClientDetailsCard } from "@/components/ClientDetailsCard";
import { ProjectMetaCard } from "@/components/ProjectMetaCard";
import { WebsiteDetailsCard } from "@/components/WebsiteDetailsCard";
import { DailyReportPanel } from "@/components/DailyReportPanel";
import { ProjectDetailTabs } from "@/components/ProjectDetailTabs";
import { SeoProjectTabs } from "@/components/SeoProjectTabs";
import { ShareLinkPanel } from "@/components/ShareLinkPanel";
import { PaymentsCard } from "@/components/PaymentsCard";
import { SeoReportingPanel } from "@/components/SeoReportingPanel";
import { ProjectAttachments } from "@/components/ProjectAttachments";
import { SeoWorkflowPanel } from "@/components/SeoWorkflowPanel";
import { SeoModuleAssignmentBar } from "@/components/SeoModuleAssignmentBar";
import { WebAppFeaturesPanel } from "@/components/WebAppFeaturesPanel";
import { WebsitePagesPanel } from "@/components/WebsitePagesPanel";
import { PROJECT_THEME } from "@/lib/projectTheme";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  const rawProject = await getProject(params.id);
  if (!rawProject) notFound();
  if (profile.role !== "admin" && !(await isProjectAssignedToUser(rawProject.id, profile.id))) notFound();

  const isAdmin = profile.role === "admin";
  const project = isAdmin ? rawProject : redactProjectClientData(rawProject);

  const [tasks, progress, businessProfile, paymentPlans, payments, keywords, allTeamMembers] = await Promise.all([
    getTasksByProject(project.id),
    getProjectProgress(project.id),
    getBusinessProfile(),
    isAdmin ? listPaymentPlansForProject(project.id) : Promise.resolve([]),
    isAdmin ? listPaymentsForProject(project.id) : Promise.resolve([]),
    project.type === "seo" ? listKeywords(project.id) : Promise.resolve([]),
    listTeamMembers(),
  ]);

  const assignableMembers = allTeamMembers.filter((member) => {
    if (member.role === "admin") return true;
    if (project.type === "seo") return member.jobRole === "seo_expert";
    if (project.type === "web_dev" || project.type === "web_app") return member.jobRole === "web_developer";
    return true;
  });

  const keywordGroups = project.type === "seo" ? await listKeywordGroups(project.id) : [];
  const keywordPagesByGroup =
    keywordGroups.length > 0 ? await listKeywordPages(keywordGroups.map((g) => g.id)) : {};

  const projectAttachments = project.type === "seo" ? await listProjectAttachments(project.id) : [];

  const webAppFeatures = project.type === "web_app" ? await listWebAppFeatures(project.id) : [];
  const webAppSubFeaturesByFeature =
    webAppFeatures.length > 0 ? await listWebAppSubFeatures(webAppFeatures.map((f) => f.id)) : {};

  const seoReports = project.type === "seo" ? await listSeoReports(project.id) : [];
  const reportPreferences = project.type === "seo" ? await getReportPreferences(project.id) : undefined;

  const pageAuditMonth = new Date().toISOString().slice(0, 7);
  const projectPages = project.type === "seo" ? await listProjectPages(project.id) : [];
  const pageAuditChecks =
    project.type === "seo" ? await listPageAuditChecks(project.id, pageAuditMonth) : [];
  const seoWorkflowItems = project.type === "seo" ? await listSeoWorkflowItems(project.id) : [];
  const seoModuleAssignments = project.type === "seo" ? await listSeoModuleAssignments(project.id) : [];
  const moduleOwner = (module: import("@/lib/types").SeoAssignableModule) =>
    seoModuleAssignments.find((assignment) => assignment.module === module)?.assignedTo ?? "";

  const completed = tasks
    .filter((t) => t.status === "done")
    .sort((a, b) => ((a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1));

  const stageName = (stageId: string | null) =>
    project.stages.find((s) => s.id === stageId)?.name ?? null;

  const clientName = project.clientDetails.name || project.clientDetails.company || project.client;

  const theme = PROJECT_THEME[project.type];
  const Icon = theme.icon;

  const clientDetailsTab = isAdmin ? (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ClientDetailsCard projectId={project.id} client={project.clientDetails} />
        <ProjectMetaCard
          projectId={project.id}
          description={project.description}
          startDate={project.startDate}
          endDate={project.endDate}
          websiteUrl={project.websiteUrl}
          showWebsiteUrl={project.type !== "web_dev" && project.type !== "web_app"}
        />
      </div>

      {(project.type === "web_dev" || project.type === "web_app") && (
        <WebsiteDetailsCard
          projectId={project.id}
          web={
            project.webDetails ?? {
              websiteName: "",
              websiteUrl: project.websiteUrl,
              domainStatus: "pending",
              logoUrl: "",
              siteIconUrl: "",
              openGraphImageUrl: "",
              servicesDetails: "",
              hostingDetails: "",
              contactDetails: "",
              notes: "",
            }
          }
        />
      )}

      <ShareLinkPanel projectId={project.id} shareToken={project.shareToken} />

      {project.type === "seo" && <ProjectAttachments projectId={project.id} attachments={projectAttachments} />}

      <PaymentsCard projectId={project.id} plans={paymentPlans} payments={payments} />
    </div>
  ) : undefined;

  const board = (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">Stages & Tasks</h2>
        <StageBoard project={project} tasks={tasks} assignableMembers={assignableMembers} />
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-accent-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Completed ({completed.length})
          </h2>
        </div>
        <div className="flex flex-col gap-2">
          {completed.length === 0 && (
            <p className="rounded-lg border border-dashed border-base-700 p-6 text-center text-sm text-neutral-500">
              No completed tasks yet.
            </p>
          )}
          {completed.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              stageName={stageName(task.stageId)}
              stages={project.stages}
              assignableMembers={assignableMembers}
            />
          ))}
        </div>
      </section>

      <section>
        <DailyReportPanel project={project} tasks={tasks} businessProfile={businessProfile} />
      </section>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={project.archived ? "/projects/closed" : "/projects"}
        className="flex w-fit items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300"
      >
        <ArrowLeft size={13} />
        Back
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${theme.iconBg} ${theme.iconText}`}>
              <Icon size={18} />
            </span>
            <h1 className="text-2xl font-semibold text-neutral-50">{project.name}</h1>
          </div>
          {isAdmin && clientName && <p className="mt-1 text-sm text-neutral-400">{clientName}</p>}
          <div className="mt-2 flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${theme.iconBg} ${theme.iconText}`}>
              {theme.label}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2">
            <ArchiveToggle projectId={project.id} archived={project.archived} />
            {isAdmin && <DeleteProjectPanel projectId={project.id} />}
          </div>
          <div className="w-48">
            <ProgressBar done={progress.done} total={progress.total} color={theme.accent} />
          </div>
        </div>
      </div>

      {project.type === "seo" ? (
        <SeoProjectTabs
          pages={
            <div>
              <SeoModuleAssignmentBar
                projectId={project.id}
                module="website_pages"
                title="Website Pages"
                assignedTo={moduleOwner("website_pages")}
                members={assignableMembers}
                canEdit={isAdmin}
              />
              <WebsitePagesPanel
                projectId={project.id}
                pages={projectPages}
                checks={pageAuditChecks}
                periodMonth={pageAuditMonth}
                keywords={keywords}
                keywordPages={Object.values(keywordPagesByGroup).flat()}
              />
            </div>
          }
          website={
            <div>
              <SeoModuleAssignmentBar
                projectId={project.id}
                module="full_website"
                title="Full Website"
                assignedTo={moduleOwner("full_website")}
                members={assignableMembers}
                canEdit={isAdmin}
              />
              <SeoWorkflowPanel
                projectId={project.id}
                module="full_website"
                title="Full Website"
                items={seoWorkflowItems.filter((item) => item.module === "full_website")}
              />
            </div>
          }
          social={
            <div>
              <SeoModuleAssignmentBar
                projectId={project.id}
                module="social_media"
                title="Social Media"
                assignedTo={moduleOwner("social_media")}
                members={assignableMembers}
                canEdit={isAdmin}
              />
              <SeoWorkflowPanel
                projectId={project.id}
                module="social_media"
                title="Social Media"
                items={seoWorkflowItems.filter((item) => item.module === "social_media")}
              />
            </div>
          }
          local={
            <div>
              <SeoModuleAssignmentBar
                projectId={project.id}
                module="local_listing"
                title="Local Listing"
                assignedTo={moduleOwner("local_listing")}
                members={assignableMembers}
                canEdit={isAdmin}
              />
              <SeoWorkflowPanel
                projectId={project.id}
                module="local_listing"
                title="Local Listing"
                items={seoWorkflowItems.filter((item) => item.module === "local_listing")}
              />
            </div>
          }
          blog={
            <div>
              <SeoModuleAssignmentBar
                projectId={project.id}
                module="blog_onsite"
                title="Blog Onsite"
                assignedTo={moduleOwner("blog_onsite")}
                members={assignableMembers}
                canEdit={isAdmin}
              />
              <SeoWorkflowPanel
                projectId={project.id}
                module="blog_onsite"
                title="Blog Onsite"
                items={seoWorkflowItems.filter((item) => item.module === "blog_onsite")}
              />
            </div>
          }
          web2={
            <div>
              <SeoModuleAssignmentBar
                projectId={project.id}
                module="web_2_0"
                title="Web 2.0"
                assignedTo={moduleOwner("web_2_0")}
                members={assignableMembers}
                canEdit={isAdmin}
              />
              <SeoWorkflowPanel
                projectId={project.id}
                module="web_2_0"
                title="Web 2.0"
                items={seoWorkflowItems.filter((item) => item.module === "web_2_0")}
              />
            </div>
          }
          guest={
            <div>
              <SeoModuleAssignmentBar
                projectId={project.id}
                module="guest_blogging"
                title="Guest Blogging"
                assignedTo={moduleOwner("guest_blogging")}
                members={assignableMembers}
                canEdit={isAdmin}
              />
              <SeoWorkflowPanel
                projectId={project.id}
                module="guest_blogging"
                title="Guest Blogging"
                items={seoWorkflowItems.filter((item) => item.module === "guest_blogging")}
              />
            </div>
          }
          recurring={
            <div>
              <SeoModuleAssignmentBar
                projectId={project.id}
                module="recurring"
                title="Recurring SEO"
                assignedTo={moduleOwner("recurring")}
                members={assignableMembers}
                canEdit={isAdmin}
              />
              <SeoWorkflowPanel
                projectId={project.id}
                module="recurring"
                title="Recurring SEO"
                items={seoWorkflowItems.filter((item) => item.module === "recurring")}
              />
            </div>
          }
          reporting={
            <div>
              <SeoModuleAssignmentBar
                projectId={project.id}
                module="reporting"
                title="Reporting"
                assignedTo={moduleOwner("reporting")}
                members={assignableMembers}
                canEdit={isAdmin}
              />
              <SeoReportingPanel
                projectId={project.id}
                projectName={project.name}
                companyName={businessProfile.companyName}
                reports={seoReports}
                preferences={reportPreferences}
              />
            </div>
          }
          clientDetails={clientDetailsTab}
        />
      ) : (
        <ProjectDetailTabs
          board={board}
          features={
            project.type === "web_app" ? (
              <WebAppFeaturesPanel
                projectId={project.id}
                projectName={project.name}
                features={webAppFeatures}
                subFeaturesByFeature={webAppSubFeaturesByFeature}
              />
            ) : undefined
          }
          clientDetails={clientDetailsTab}
        />
      )}
    </div>
  );
}
