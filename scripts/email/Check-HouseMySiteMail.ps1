param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ReviewedCommit)
$ErrorActionPreference = 'Stop'
$work = Join-Path ([IO.Path]::GetTempPath()) ('hms-mail-check-' + [Guid]::NewGuid().ToString('N'))
$remote = '/root/hms-mail-check-' + [Guid]::NewGuid().ToString('N')
$sshOptions = @('-T','-o','ConnectTimeout=10','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes')
New-Item -ItemType Directory -Path $work | Out-Null
& git -C $work init --quiet
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the reviewed source.' }
& git -C $work config core.autocrlf false
if ($LASTEXITCODE -ne 0) { throw 'Could not set source line endings.' }
& git -C $work -c credential.interactive=false fetch --quiet --depth=1 https://github.com/digigrow100/Project-management-for-freelancers.git $ReviewedCommit
if ($LASTEXITCODE -ne 0) { throw 'Could not fetch the reviewed commit. No server check was run.' }
& git -C $work checkout --quiet $ReviewedCommit -- scripts/email/inspect_mail_readiness.py scripts/email/Invoke-MailReadinessCheck.ps1
if ($LASTEXITCODE -ne 0) { throw 'Reviewed check is missing. No server check was run.' }
$file = Join-Path $work 'scripts/email/inspect_mail_readiness.py'
$digest = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant()
& ssh @sshOptions root@62.171.130.156 "install -d -m 700 $remote"
if ($LASTEXITCODE -ne 0) { throw 'Could not create the private check directory.' }
& scp -o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=yes $file "root@62.171.130.156`:$remote/check.py"
if ($LASTEXITCODE -ne 0) { throw 'Could not copy the reviewed check. No activation was attempted.' }
. (Join-Path $work 'scripts/email/Invoke-MailReadinessCheck.ps1')
Invoke-HouseMySiteMailReadinessCheck -RemoteFile "$remote/check.py" -ExpectedDigest $digest
Write-Host 'Check finished. No mail was sent and no email or DNS settings were changed.'
