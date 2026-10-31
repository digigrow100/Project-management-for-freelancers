import Link from 'next/link';

export function HostingSettingsTabs({active}:{active:'general'|'domains'}){
 return <nav aria-label="Hosting settings sections" className="flex gap-1 overflow-x-auto border-b border-base-700">
 {([{key:'general',label:'General',href:'/hosting/settings'},{key:'domains',label:'Domain settings',href:'/hosting/settings/domains'}] as const).map(tab=><Link key={tab.key} href={tab.href} aria-current={active===tab.key?'page':undefined} className={'whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium '+(active===tab.key?'border-blue-600 text-blue-600':'border-transparent text-neutral-500 hover:text-blue-600')}>{tab.label}</Link>)}
 </nav>;
}
