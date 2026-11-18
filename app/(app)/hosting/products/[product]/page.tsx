import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/hosting/dashboard/present";

const PRODUCTS = {
  email: ["Email Server", "Mailboxes, aliases and webmail will be set up on this server. This page does not create an account or send mail."],
  databases: ["Databases", "A Postgres backend, in the style of a hosted database project, will be offered here. There is no database to connect yet."],
  wordpress: ["WordPress", "One-click WordPress will be offered here. A container you already have can be deployed from Apps today."],
} as const;

export default async function ProductPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const copy = PRODUCTS[product as keyof typeof PRODUCTS];
  if (!copy) notFound();
  return <ComingSoon title={copy[0]} body={copy[1]} alternate={product === "wordpress" ? { href: "/hosting/apps/new", label: "Deploy an app instead" } : undefined} />;
}
