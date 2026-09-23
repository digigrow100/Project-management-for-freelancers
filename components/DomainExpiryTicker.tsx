"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { DomainExpiryTickerItem } from "@/lib/utils";

export function DomainExpiryTicker({ items }: { items: DomainExpiryTickerItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-amber-500/30 bg-base-900/95 backdrop-blur-sm md:bottom-0">
      <Link
        href="/domains"
        className="flex items-center gap-2.5 overflow-hidden px-3 py-2"
        aria-label="Domains and renewals expiring soon — open Domains"
      >
        <AlertTriangle size={14} className="shrink-0 text-amber-400" />
        <div className="ticker-viewport min-w-0 flex-1 overflow-hidden">
          <div
            className="ticker-track whitespace-nowrap text-xs"
            style={{ "--ticker-duration": `${Math.max(28, items.length * 14)}s` } as CSSProperties}
          >
            {items.map((item, i) => (
              <span key={item.id}>
                {i > 0 && <span className="mx-8 text-neutral-600">•</span>}
                <span className="ticker-name">{item.who}</span>
                <span className={item.overdue ? "text-rose-300" : "text-amber-200"}>{item.rest}</span>
              </span>
            ))}
          </div>
        </div>
      </Link>
    </div>
  );
}
