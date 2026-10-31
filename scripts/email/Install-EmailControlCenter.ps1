param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ReviewedCommit)
$ErrorActionPreference='Stop'
$work=Join-Path ([IO.Path]::GetTempPath()) ('hms-email-center-'+[Guid]::NewGuid().ToString('N'))
$remote='/root/hms-email-center-'+[Guid]::NewGuid().ToString('N')
$sshOptions=@('-T','-o','ConnectTimeout=10','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes')
& git init --quiet $work
if($LASTEXITCODE -ne 0){throw 'Source preparation failed.'}
& git -C $work config core.autocrlf false
if($LASTEXITCODE -ne 0){throw 'Source configuration failed.'}
& git -C $work -c credential.interactive=false fetch --quiet --depth=1 https://github.com/digigrow100/Project-management-for-freelancers.git $ReviewedCommit
if($LASTEXITCODE -ne 0){throw 'Reviewed source download failed.'}
& git -C $work checkout --quiet $ReviewedCommit -- scripts/email scripts/dynadot-relay/install.py
if($LASTEXITCODE -ne 0){throw 'Reviewed source checkout failed.'}
$stage=Join-Path $work 'scripts/email'
$hashes=@{}
Get-ChildItem -LiteralPath $stage -Filter '*.py' -File -Recurse | ForEach-Object {$name=$_.FullName.Substring($stage.Length+1).Replace('\','/');$hashes[$name]=(Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()}
Copy-Item -LiteralPath (Join-Path $work 'scripts/dynadot-relay/install.py') -Destination (Join-Path $stage 'relay_install_helpers.py')
$hashes['relay_install_helpers.py']=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $stage 'relay_install_helpers.py')).Hash.ToLowerInvariant()
$manifest=Join-Path $stage 'source-hashes.json'
[IO.File]::WriteAllText($manifest,($hashes|ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
$manifestHash=(Get-FileHash -Algorithm SHA256 -LiteralPath $manifest).Hash.ToLowerInvariant()
& ssh @sshOptions root@62.171.130.156 "install -d -m 700 $remote"
if($LASTEXITCODE -ne 0){throw 'Private upload directory could not be created.'}
& scp -r -o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=yes $stage "root@62.171.130.156`:$remote/source"
if($LASTEXITCODE -ne 0){throw 'Reviewed upload failed.'}
$program=@"
import hashlib,json,runpy,sys
from pathlib import Path
root=Path('$remote/source')
manifest=root/'source-hashes.json'
assert hashlib.sha256(manifest.read_bytes()).hexdigest()=='$manifestHash'
for name,digest in json.loads(manifest.read_bytes()).items():
    p=root/name
    assert p.resolve().is_relative_to(root.resolve()) and not p.is_symlink()
    assert hashlib.sha256(p.read_bytes()).hexdigest()==digest
p=root/'install_control_center.py'
sys.argv=[str(p),'--execute']
runpy.run_path(str(p),run_name='__main__')
"@
$program|& ssh @sshOptions root@62.171.130.156 'python3 -I -'
if($LASTEXITCODE -ne 0){throw 'Email installation stopped. Preserve the JSON and backup; do not repeat.'}
Write-Host 'Installation finished. Send the final JSON. No mailbox or domain DNS was created.'
