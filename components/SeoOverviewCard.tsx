import { Link2, Search, TrendingDown, TrendingUp } from "lucide-react";
import type { SeoReportMetrics } from "@/lib/types";
import { StatCard } from "@/components/StatCard";

export function SeoOverviewCard({ metrics }: { metrics: SeoReportMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard label="Keywords tracked" value={metrics.keywordsTracked} icon={Search} tone="sky" />
      <StatCard label="Improved this week" value={metrics.keywordsImproved} icon={TrendingUp} tone="accent" />
      <StatCard label="Dropped this week" value={metrics.keywordsDropped} icon={TrendingDown} tone="rose" />
      <StatCard label="Backlinks live" value={metrics.backlinksLive} icon={Link2} tone="sky" />
      <StatCard label="Content published this week" value={metrics.contentPublished} icon={TrendingUp} tone="amber" />
    </div>
  );
}
