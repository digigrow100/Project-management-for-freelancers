import { z } from "zod";
export const uuid = z.string().uuid();
export const currency = z.enum(["PKR", "GBP", "USD"]);
export const cycle = z.enum(["monthly", "quarterly", "yearly", "one_time"]);
export const text = (max = 200) => z.string().trim().min(1).max(max);
export const optionalText = (max = 2000) => z.string().trim().max(max).default("");
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}, "Enter a valid date");
export function moneyMinor(value: string): number {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value.trim())) throw new Error("Enter an amount with at most two decimal places.");
  const [whole, cents = ""] = value.trim().split(".");
  const result = Number(whole) * 100 + Number(cents.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > 1_000_000_000_000) throw new Error("Amount is too large.");
  return result;
}
export const money = (minor: number, code: string) => new Intl.NumberFormat("en", {style: "currency", currency: code}).format(Number(minor) / 100);
export function domainName(value: string): string {
  const name = value.trim().toLowerCase().replace(/\.$/, "");
  if (name.length > 253 || !name.includes(".") || !name.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw new Error("Enter a domain name without a protocol, port or path.");
  return name;
}
export function invoiceState(invoice: {status: string; total_minor: number; due_on: string}, payments: {direction: string; amount_minor: number}[], today: string) {
  const paid = payments.reduce((n,p) => n + (p.direction === "incoming" ? Number(p.amount_minor) : -Number(p.amount_minor)), 0);
  const due = Number(invoice.total_minor) - paid;
  const status = invoice.status === "cancelled" ? "cancelled" : due <= 0 ? "paid" : invoice.due_on < today ? "overdue" : paid > 0 ? "partially paid" : "unpaid";
  return { paid, due, status };
}
export function hostingToday() { return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); }
export function safeReturnPath(value: string, client = false) {
  const base = client ? "/client" : "/hosting";
  return value === base || (value.startsWith(base + "/") && /^\/[a-zA-Z0-9/_-]+$/.test(value)) ? value : base;
}
