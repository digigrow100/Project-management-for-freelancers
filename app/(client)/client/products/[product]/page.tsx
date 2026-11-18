import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/hosting/dashboard/present";

const PRODUCTS = {
  email: ["Email Server", "Mailboxes will appear here when email hosting is opened. This page does not create a mailbox."],
  databases: ["Databases", "A hosted Postgres project will be offered here. There is no database to open yet."],
  wordpress: ["WordPress", "One-click WordPress will be offered here. You can deploy a container from Apps if you already have an image."],
} as const;

export default async function ClientProductPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const copy = PRODUCTS[product as keyof typeof PRODUCTS];
  if (!copy) notFound();
  return <ComingSoon title={copy[0]} body={copy[1]} alternate={product === "wordpress" ? { href: "/client/apps/new", label: "Deploy an app instead" } : undefined} />;
}
