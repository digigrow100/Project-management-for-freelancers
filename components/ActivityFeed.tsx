import Link from "next/link";
import { CheckCircle2, TrendingDown, TrendingUp, Link2, FileEdit, Wrench } from "lucide-react";
import type { ActivityEvent, ActivityEventType } from "@/lib/types";

const EVENT_ICON: Record<ActivityEventType, typeof CheckCircle2> = {
  task_completed: CheckCircle2,
  keyword_rank_improved: TrendingUp,
  keyword_rank_dropped: TrendingDown,
  backlink_created: Link2,
  content_published: FileEdit,
  technical_fixed: Wrench,
};

const EVENT_VERB: Record<ActivityEventType, string> = {
  task_completed: "completed",
  keyword_rank_improved: "rank improved",
  keyword_rank_dropped: "rank dropped",
  backlink_created: "created",
  content_published: "published",
  technical_fixed: "fixed",
};

const EVENT_TONE: Record<ActivityEventType, string> = {
  task_completed: "text-accent-400",
  keyword_rank_improved: "text-accent-400",
  keyword_rank_dropped: "text-rose-400",
  backlink_created: "text-sky-400",
  content_published: "text-amber-400",
  technical_fixed: "text-sky-400",
};

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-base-700 p-6 text-center text-sm text-neutral-500">
        No activity yet today.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {events.map((event) => {
        const Icon = EVENT_ICON[event.eventType];
        return (
          <div
            key={event.id}
            className="flex items-start gap-3 rounded-lg border border-base-700/50 bg-base-850/60 px-3.5 py-2.5"
          >
            <span className={`mt-0.5 shrink-0 ${EVENT_TONE[event.eventType]}`}>
              <Icon size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-neutral-200">
                <Link href={`/projects/${event.projectId}`} className="font-medium text-neutral-100 hover:text-accent-300">
                  {event.projectName}
                </Link>
                {" — "}
                {event.personName && <span className="font-medium">{event.personName} </span>}
                <span className="text-neutral-400">{EVENT_VERB[event.eventType]}:</span>{" "}
                <span className="text-neutral-200">&quot;{event.title}&quot;</span>
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">{event.detail}</p>
            </div>
            <span className="shrink-0 text-[11px] text-neutral-600">
              {new Date(event.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
