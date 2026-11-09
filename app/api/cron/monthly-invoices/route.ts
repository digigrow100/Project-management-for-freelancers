import { NextRequest, NextResponse } from "next/server";
import { ensureMonthlyProjectInvoices } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: "Scheduler is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const created = await ensureMonthlyProjectInvoices();
    return NextResponse.json({
      ok: true,
      created: created.length,
      invoiceIds: created.map((invoice) => invoice.id),
    });
  } catch (error) {
    console.error("monthly invoice cron failed", error);
    return NextResponse.json(
      { ok: false, error: "Invoice generation failed" },
      { status: 500 },
    );
  }
}
