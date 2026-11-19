'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
export function DeploymentWatcher({ base, appId, active }: {
    base: string;
    appId: string;
    active: boolean;
}) {
    const router = useRouter(), [note, setNote] = useState('');
    useEffect(() => {
        if (!active)
            return;
        let disposed = false, busy = false;
        const controller = new AbortController();
        async function sync() {
            if (disposed || busy || document.visibilityState !== 'visible')
                return;
            busy = true;
            try {
                const r = await fetch('/api/hosting-websites/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ base, app: appId }), signal: controller.signal });
                if (r.ok) {
                    const data = await r.json();
                    if (!disposed && !data.pending) {
                        setNote('Server status updated.');
                        router.refresh();
                    }
                }
                else if (!disposed)
                    setNote('Waiting for the server. Use Refresh server status if this continues.');
            }
            catch {
                if (!disposed)
                    setNote('Connection paused. Your last release is kept.');
            }
            finally {
                busy = false;
            }
        }
        const timer = window.setInterval(() => void sync(), 15000);
        return () => { disposed = true; controller.abort(); window.clearInterval(timer); };
    }, [base, appId, active, router]);
    return note ? <p className="website-note" role="status">{note}</p> : active ? <p className="website-note" role="status">Waiting for deployment. Status is checked while this tab is visible.</p> : null;
}
