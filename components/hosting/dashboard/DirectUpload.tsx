'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { safeUploadPath } from '../../../hosting-agent/shared/uploadPolicy';
import { MAX_UPLOAD_BYTES } from '@/lib/hosting/websites/types';
export function DirectUpload({ base, appId, disabled, activeKey }: {
    base: string;
    appId: string;
    disabled: boolean;
    activeKey?: string;
}) {
    const [files, setFiles] = useState<File[]>([]), [kind, setKind] = useState('zip'), [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [message, setMessage] = useState('');
    const current = useRef<XMLHttpRequest | null>(null), requestKey = useRef(activeKey ?? ''), router = useRouter();
    const total = files.reduce((n, f) => n + f.size, 0);
    function choose(value: FileList | null) { const selected = Array.from(value ?? []), root = selected[0]?.webkitRelativePath.split('/')[0]; const safe = selected.filter(f => safeUploadPath(root && f.webkitRelativePath ? f.webkitRelativePath.slice(root.length + 1) : f.name)); setFiles(safe); setMessage(safe.length < selected.length ? 'Skipped private env files, node_modules, build caches or unsafe paths.' : ''); setProgress(0); requestKey.current = activeKey ?? ''; }
    async function send() {
        if (busy || disabled)
            return;
        if (!files.length || total > MAX_UPLOAD_BYTES) {
            setMessage('Choose files with a combined size up to 1 GB.');
            return;
        }
        setBusy(true);
        setMessage('Preparing a private upload…');
        let paths = files.map(f => f.webkitRelativePath || f.name);
        const root = paths[0]?.split('/')[0];
        if (root && paths.every(p => p.startsWith(root + '/')))
            paths = paths.map(p => p.slice(root.length + 1));
        try {
            if (!requestKey.current)
                requestKey.current = crypto.randomUUID();
            const response = await fetch('/api/hosting-websites/upload-ticket', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ base, app: appId, key: requestKey.current, kind: kind === 'folder' ? 'files' : kind, files: files.map((f, i) => ({ path: paths[i], size: f.size })) }) });
            const ticket = await response.json();
            if (!response.ok || !ticket.token)
                throw new Error(ticket.error ?? 'The upload service is unavailable.');
            let uploaded = 0;
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file)
                    throw new Error("File selection changed. Choose the files again.");
                setMessage(`Uploading ${i + 1} of ${files.length}…`);
                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    current.current = xhr;
                    xhr.open('PUT', `${ticket.origin}/v1/uploads/${ticket.id}/${i}`);
                    xhr.setRequestHeader('Authorization', `Upload ${ticket.token}`);
                    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
                    xhr.timeout = 900000;
                    xhr.upload.onprogress = e => {
                        if (e.lengthComputable)
                            setProgress(Math.min(99, Math.floor((uploaded + e.loaded) / Math.max(total, 1) * 100)));
                    };
                    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('The upload was rejected. Check its size, retry or cancel this upload before starting another.'));
                    xhr.onerror = () => reject(new Error('Upload connection failed. You can retry the same files.'));
                    xhr.onabort = () => reject(new Error('Upload paused. Retry these files or cancel the upload on the website page.'));
                    xhr.ontimeout = () => reject(new Error('Upload timed out. Retry the same files.'));
                    xhr.send(file);
                });
                uploaded += file.size;
            }
            setMessage('Finishing upload…');
            const complete = await fetch(`${ticket.origin}/v1/uploads/${ticket.id}/complete`, { method: 'POST', headers: { Authorization: `Upload ${ticket.token}` } });
            if (!complete.ok)
                throw new Error('The upload needs review. Refresh deployment status.');
            setProgress(100);
            setMessage('Upload received. The server is building and checking your website.');
            requestKey.current = '';
            router.refresh();
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : 'Upload failed.');
        }
        finally {
            setBusy(false);
            current.current = null;
        }
    }
    return <section className="website-upload"><h2>Deploy from your computer</h2><p className="website-note">Direct to the VPS. Maximum 1 GB per upload; expanded website content must fit your approved storage cap. Private keys, .env files and node_modules are excluded.</p><label>Upload type<select value={kind} disabled={busy || disabled} onChange={e => { setKind(e.target.value); setFiles([]); requestKey.current = activeKey ?? ''; }}><option value="zip">ZIP archive</option><option value="files">Files</option><option value="folder">Folder</option></select></label>
 {kind === 'folder' ? <input key="folder" type="file" {...{ webkitdirectory: '' }} multiple disabled={busy || disabled} onChange={e => choose(e.target.files)}/> : <input key={kind} type="file" multiple={kind === 'files'} accept={kind === 'zip' ? '.zip' : undefined} disabled={busy || disabled} onChange={e => choose(e.target.files)}/>}
 <p className="website-note">{files.length} files · {(total / 1000000).toFixed(1)} MB selected</p><progress max={100} value={progress} aria-label="Upload progress"/><div className="website-toolbar"><button type="button" className="hms-dash-primary" disabled={busy || disabled || !files.length || total > MAX_UPLOAD_BYTES} onClick={() => void send()}>{busy ? 'Uploading…' : 'Upload & deploy'}</button>{busy ? <button type="button" className="hms-dash-secondary" disabled={!current.current || current.current.readyState === 4} onClick={() => current.current?.abort()}>Pause upload</button> : null}</div>{message ? <p className="website-note" role="status">{message}</p> : null}</section>;
}
