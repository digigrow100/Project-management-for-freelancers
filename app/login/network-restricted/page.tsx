import {logoutAction} from '../actions';
export const dynamic='force-dynamic';
export default function NetworkRestrictedPage(){
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-slate-900"><p className="mb-5 font-semibold text-blue-600">HouseMySite</p><h1 className="text-2xl font-semibold">Use an approved network</h1><p className="mt-4 text-sm leading-6 text-slate-600">Admin access is restricted to approved IP addresses. Connect through an approved network, or ask the account owner to update the allowlist.</p><form action={logoutAction}><button className="mt-6 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white">Sign out</button></form></section></main>;
}
