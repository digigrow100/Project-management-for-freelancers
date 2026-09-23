import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import {
  getBusinessProfile,
  hasVaultPassword,
  listBacklinkCategories,
  listBacklinkEntries,
  listContentItems,
  listKeywordGroups,
  listKeywordPages,
  listKeywordRankHistory,
  listKeywords,
  listMonthlyPositions,
  listPaymentPlansForProject,
  listProjectAttachments,
  listSeoReports,
  listTechnicalIssues,
  getProject,
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
import { KeywordsPanel } from "@/components/KeywordsPanel";
import { OnPageSeoPanel } from "@/components/OnPageSeoPanel";
import { TechnicalSeoPanel } from "@/components/TechnicalSeoPanel";
import { ContentPipelinePanel } from "@/components/ContentPipelinePanel";
import { SeoReportingPanel } from "@/components/SeoReportingPanel";
import { ProjectAttachments } from "@/components/ProjectAttachments";
import { BacklinksPanel } from "@/components/BacklinksPanel";
import { WebAppFeaturesPanel } from "@/components/WebAppFeaturesPanel";
import { PROJECT_THEME } from "@/lib/projectTheme";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const project = await getProject(params.id);
  if (!project) notFound();

  const profile = await getCurrentProfile();
  if (!profile) notFound();
  if (profile.role !== "admin" && !(await isProjectAssignedToUser(project.id, profile.id))) notFound();

  const isAdmin = profile.role === "admin";

  const [tasks, progress, businessProfile, paymentPlans, payments, keywords, assignableMembers] = await Promise.all([
    getTasksByProject(project.id),
    getProjectProgress(project.id),
    getBusinessProfile(),
    isAdmin ? listPaymentPlansForProject(project.id) : Promise.resolve([]),
    isAdmin ? listPaymentsForProject(project.id) : Promise.resolve([]),
    project.type === "seo" ? listKeywords(project.id) : Promise.resolve([]),
    listTeamMembers(),
  ]);

  const keywordRankHistory =
    project.type === "seo" && keywords.length > 0
      ? await listKeywordRankHistory(keywords.map((k) => k.id))
      : {};

  const trackedKeywordIds = keywords.filter((k) => k.isTracked).map((k) => k.id);
  const keywordMonthlyPositions =
    project.type === "seo" && trackedKeywordIds.length > 0 ? await listMonthlyPositions(trackedKeywordIds) : {};

  const keywordGroups = project.type === "seo" ? await listKeywordGroups(project.id) : [];
  const keywordPagesByGroup =
    keywordGroups.length > 0 ? await listKeywordPages(keywordGroups.map((g) => g.id)) : {};

  const projectAttachments = project.type === "seo" ? await listProjectAttachments(project.id) : [];

  const backlinkCategories = project.type === "seo" ? await listBacklinkCategories(project.id) : [];
  const backlinkEntriesByCategory =
    backlinkCategories.length > 0 ? await listBacklinkEntries(backlinkCategories.map((c) => c.id)) : {};
  const vaultPasswordSet = project.type === "seo" ? await hasVaultPassword(profile.id) : false;

  const webAppFeatures = project.type === "web_app" ? await listWebAppFeatures(project.id) : [];
  const webAppSubFeaturesByFeature =
    webAppFeatures.length > 0 ? await listWebAppSubFeatures(webAppFeatures.map((f) => f.id)) : {};

  const technicalIssues = project.type === "seo" ? await listTechnicalIssues(project.id) : [];
  const contentItems = project.type === "seo" ? await listContentItems(project.id) : [];
  const seoReports = project.type === "seo" ? await listSeoReports(project.id) : [];

  const tasksByPage: Record<string, typeof tasks> = {};
  const tasksByContentItem: Record<string, typeof tasks> = {};
  for (const task of tasks) {
    if (task.pageId) (tasksByPage[task.pageId] ??= []).push(task);
    if (task.contentItemId) (tasksByContentItem[task.contentItemId] ??= []).push(task);
  }
  const taskCountByKeyword: Record<string, number> = {};
  for (const task of tasks) {
    if (task.keywordId) taskCountByKeyword[task.keywordId] = (taskCountByKeyword[task.keywordId] ?? 0) + 1;
  }

  const completed = tasks
    .filter((t) => t.status === "done")
    .sort((a, b) => ((a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1));

  const stageName = (stageId: string | null) =>
    project.stages.find((s) => s.id === stageId)?.name ?? null;

  const clientName = project.clientDetails.name || project.clientDetails.company || project.client;

  const theme = PROJECT_THEME[project.type];
  const Icon = theme.icon;

  const clientDetailsTab = (
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

      {isAdmin && <PaymentsCard projectId={project.id} plans={paymentPlans} payments={payments} />}
    </div>
  );

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
          {clientName && <p className="mt-1 text-sm text-neutral-400">{clientName}</p>}
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
          keywords={
            <KeywordsPanel
              projectId={project.id}
              projectName={project.name}
              keywords={keywords}
              rankHistory={keywordRankHistory}
              monthlyPositions={keywordMonthlyPositions}
              groups={keywordGroups}
              pagesByGroup={keywordPagesByGroup}
              taskCountByKeyword={taskCountByKeyword}
            />
          }
          onPage={
            <OnPageSeoPanel
              projectId={project.id}
              groups={keywordGroups}
              pagesByGroup={keywordPagesByGroup}
              keywords={keywords}
              tasksByPage={tasksByPage}
              assignableMembers={assignableMembers}
            />
          }
          technical={
            <TechnicalSeoPanel projectId={project.id} issues={technicalIssues} assignableMembers={assignableMembers} />
          }
          content={
            <ContentPipelinePanel
              projectId={project.id}
              items={contentItems}
              keywords={keywords}
              tasksByContentItem={tasksByContentItem}
              assignableMembers={assignableMembers}
            />
          }
          offPage={
            <BacklinksPanel
              projectId={project.id}
              categories={backlinkCategories}
              entriesByCategory={backlinkEntriesByCategory}
              hasVaultPassword={vaultPasswordSet}
            />
          }
          reporting={<SeoReportingPanel projectId={project.id} reports={seoReports} />}
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
