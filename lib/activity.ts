import * as store from "./store";
import type { ActivityEvent, Profile, Project, SeoReportMetrics, TeamPerformance } from "./types";

function dateKeyOf(iso: string): string {
  return iso.slice(0, 10);
}

/** [Monday, next Monday) date keys for the week containing `dateKey`. */
function currentWeekBounds(dateKey: string): [string, string] {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const isoDay = date.getUTCDay() || 7;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - isoDay + 1);
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);
  return [monday.toISOString().slice(0, 10), nextMonday.toISOString().slice(0, 10)];
}

/** 'YYYY-Www' ISO week key for the week containing `dateKey`, matching store.ts's weekBounds. */
export function currentIsoWeekKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Aggregated SEO metrics across every visible SEO project for the current week — reuses buildSeoReportDraft per project rather than a parallel implementation. */
export async function getSeoOverview(seoProjects: Project[], dateKey: string): Promise<SeoReportMetrics> {
  const weekKey = currentIsoWeekKey(dateKey);
  const drafts = await Promise.all(seoProjects.map((p) => store.buildSeoReportDraft(p.id, weekKey, "weekly")));
  return drafts.reduce<SeoReportMetrics>(
    (sum, draft) => ({
      keywordsTracked: sum.keywordsTracked + draft.metrics.keywordsTracked,
      keywordsImproved: sum.keywordsImproved + draft.metrics.keywordsImproved,
      keywordsDropped: sum.keywordsDropped + draft.metrics.keywordsDropped,
      backlinksCreated: sum.backlinksCreated + draft.metrics.backlinksCreated,
      backlinksLive: sum.backlinksLive + draft.metrics.backlinksLive,
      contentPublished: sum.contentPublished + draft.metrics.contentPublished,
      technicalFixed: sum.technicalFixed + draft.metrics.technicalFixed,
    }),
    {
      keywordsTracked: 0,
      keywordsImproved: 0,
      keywordsDropped: 0,
      backlinksCreated: 0,
      backlinksLive: 0,
      contentPublished: 0,
      technicalFixed: 0,
    },
  );
}

/**
 * Builds the dashboard's "Today Activity" feed by reading existing tables
 * (tasks, keywords, backlinks, content, technical issues) and computing
 * events at read time — nothing here is persisted. Each event carries
 * `eventType`/`source` metadata so a future AI layer (Phase 6) can consume
 * these objects directly without a schema change.
 */
export async function getDashboardActivity(projects: Project[], dateKey: string): Promise<ActivityEvent[]> {
  const events: ActivityEvent[] = [];
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const completedTasks = await store.getCompletedTasks();
  for (const task of completedTasks) {
    if (!task.completedAt || dateKeyOf(task.completedAt) !== dateKey) continue;
    const project = projectById.get(task.projectId);
    if (!project) continue;
    events.push({
      id: `task-${task.id}`,
      eventType: "task_completed",
      source: "tasks",
      at: task.completedAt,
      projectId: project.id,
      projectName: project.name,
      personName: task.assignedToName,
      title: task.title,
      detail: "Completed",
    });
  }

  const seoProjects = projects.filter((p) => p.type === "seo");
  await Promise.all(
    seoProjects.map(async (project) => {
      const [keywords, categories, contentItems, technicalIssues] = await Promise.all([
        store.listKeywords(project.id),
        store.listBacklinkCategories(project.id),
        store.listContentItems(project.id),
        store.listTechnicalIssues(project.id),
      ]);

      if (keywords.length > 0) {
        const rankHistory = await store.listKeywordRankHistory(keywords.map((k) => k.id));
        const keywordById = new Map(keywords.map((k) => [k.id, k]));
        for (const [keywordId, history] of Object.entries(rankHistory)) {
          const keyword = keywordById.get(keywordId);
          if (!keyword) continue;
          const todayIndex = history.findIndex((h) => h.recordedOn === dateKey);
          if (todayIndex === -1) continue;
          const todayEntry = history[todayIndex];
          const priorEntry = history[todayIndex + 1];
          if (!todayEntry || !priorEntry || todayEntry.rank === null || priorEntry.rank === null) continue;
          if (todayEntry.rank === priorEntry.rank) continue;
          const improved = todayEntry.rank < priorEntry.rank;
          events.push({
            id: `keyword-${todayEntry.id}`,
            eventType: improved ? "keyword_rank_improved" : "keyword_rank_dropped",
            source: "keywords",
            at: `${dateKey}T00:00:00.000Z`,
            projectId: project.id,
            projectName: project.name,
            personName: null,
            title: keyword.keyword,
            detail: `${priorEntry.rank} → ${todayEntry.rank}`,
          });
        }
      }

      if (categories.length > 0) {
        const entriesByCategory = await store.listBacklinkEntries(categories.map((c) => c.id));
        for (const entries of Object.values(entriesByCategory)) {
          for (const entry of entries) {
            if (dateKeyOf(entry.createdAt) !== dateKey) continue;
            events.push({
              id: `backlink-${entry.id}`,
              eventType: "backlink_created",
              source: "backlinks",
              at: entry.createdAt,
              projectId: project.id,
              projectName: project.name,
              personName: null,
              title: entry.name,
              detail: "Backlink created",
            });
          }
        }
      }

      for (const item of contentItems) {
        if (item.status !== "published" || dateKeyOf(item.updatedAt) !== dateKey) continue;
        events.push({
          id: `content-${item.id}`,
          eventType: "content_published",
          source: "content",
          at: item.updatedAt,
          projectId: project.id,
          projectName: project.name,
          personName: item.assignedToName,
          title: item.topic,
          detail: "Published",
        });
      }

      for (const issue of technicalIssues) {
        if (issue.status !== "fixed" || dateKeyOf(issue.updatedAt) !== dateKey) continue;
        events.push({
          id: `technical-${issue.id}`,
          eventType: "technical_fixed",
          source: "technical_issues",
          at: issue.updatedAt,
          projectId: project.id,
          projectName: project.name,
          personName: issue.assignedToName,
          title: issue.title,
          detail: "Fixed",
        });
      }
    }),
  );

  return events.sort((a, b) => (a.at < b.at ? 1 : -1));
}

/**
 * Per-member completed-task rollup ("who completed what") for today and the
 * current ISO week, scoped to the given visible projects. Derived from the
 * same completed-tasks read `getDashboardActivity` uses — no new query.
 */
export async function getTeamPerformance(projects: Project[], members: Profile[], dateKey: string): Promise<TeamPerformance[]> {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const [weekStart, weekEnd] = currentWeekBounds(dateKey);

  const completedTasks = (await store.getCompletedTasks()).filter((t) => projectById.has(t.projectId));

  return members
    .map((member) => {
      const memberTasks = completedTasks.filter((t) => t.assignedTo === member.id && t.completedAt);
      const todayTasks = memberTasks.filter((t) => dateKeyOf(t.completedAt!) === dateKey);
      const weekTasks = memberTasks.filter((t) => {
        const key = dateKeyOf(t.completedAt!);
        return key >= weekStart && key < weekEnd;
      });
      const projectNamesToday = Array.from(
        new Set(todayTasks.map((t) => projectById.get(t.projectId)?.name).filter((n): n is string => Boolean(n))),
      );
      return {
        memberId: member.id,
        memberName: member.name || member.email,
        completedToday: todayTasks.length,
        completedThisWeek: weekTasks.length,
        projectNamesToday,
      };
    })
    .filter((tp) => tp.completedToday > 0 || tp.completedThisWeek > 0);
}
