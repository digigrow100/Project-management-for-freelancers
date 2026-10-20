import { stopHostingClientView } from "@/lib/hosting/clientViewActions";
import Link from "next/link";
import { requireHostingClient } from "@/lib/hosting/auth";
import { logoutAction } from "@/app/login/actions";
import { ClientNavigation } from "@/components/hosting/ClientNavigation";
import "./portal.css";
export const dynamic="force-dynamic";
export default async function ClientLayout({children}:{children:React.ReactNode}) {
 const session=await requireHostingClient();
 return <div className="client-portal"><a href="#client-content" className="client-skip">Skip to content</a><aside className="client-sidebar print:hidden"><Link href="/client" className="client-brand" aria-label="HouseMySite home">House<span>My</span>Site</Link><ClientNavigation/><div className="client-account"><span className="client-avatar" aria-hidden="true">{session.client.name.slice(0,1).toUpperCase()}</span><span className="truncate">{session.client.name}</span><form action={logoutAction}><button>Log out</button></form></div></aside><div className="client-workspace">{session.adminView&&<aside className="client-inspection print:hidden"><p>Admin view · {session.client.name} · Read-only · 30 minute session</p><form action={stopHostingClientView}><button>Return to Hosting →</button></form></aside>}<main id="client-content" className="client-content">{session.client.status==="suspended"&&<p role="status" className="client-warning">Your account is suspended. You can still review billing and contact support.</p>}{children}</main></div></div>;
}
