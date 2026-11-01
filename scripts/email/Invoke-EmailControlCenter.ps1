function Invoke-HouseMySiteEmailControlCenter {
    param(
        [Parameter(Mandatory=$true)][ValidatePattern('^/root/hms-email-center-[a-f0-9]{32}/source$')][string]$RemoteRoot,
        [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ManifestDigest,
        [ValidatePattern('^/root/hms-email-center-[a-f0-9]{32}$')][string]$ResumeBackup
    )
    $program=@"
import hashlib,json,runpy,sys
from pathlib import Path
root=Path('$RemoteRoot')
manifest=root/'source-hashes.json'
assert hashlib.sha256(manifest.read_bytes()).hexdigest()=='$ManifestDigest'
for name,digest in json.loads(manifest.read_bytes()).items():
    p=root/name
    assert p.resolve().is_relative_to(root.resolve()) and not p.is_symlink()
    assert hashlib.sha256(p.read_bytes()).hexdigest()==digest
p=root/'install_control_center.py'
sys.argv=[str(p),'--execute']
runpy.run_path(str(p),run_name='__main__')
"@
    if ($ResumeBackup) {
        $program = $program.Replace("sys.argv=[str(p),'--execute']", "sys.argv=[str(p),'--resume-backup','$ResumeBackup']")
    }
    $program|& ssh -T -o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=yes root@62.171.130.156 'python3 -I -'
    if($LASTEXITCODE -ne 0){throw 'Email installation stopped. Preserve the JSON and backup; do not repeat.'}
}
