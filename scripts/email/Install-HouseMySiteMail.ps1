param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ReviewedCommit)
$ErrorActionPreference = 'Stop'
$work = Join-Path ([IO.Path]::GetTempPath()) ('hms-mail-enrollment-' + [Guid]::NewGuid().ToString('N'))
$remote = '/root/hms-mail-enrollment-' + [Guid]::NewGuid().ToString('N')
$sshOptions = @('-T','-o','ConnectTimeout=10','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes')
& git init --quiet $work
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the reviewed source.' }
& git -C $work config core.autocrlf false
if ($LASTEXITCODE -ne 0) { throw 'Could not set source line endings.' }
& git -C $work -c credential.interactive=false fetch --quiet --depth=1 https://github.com/digigrow100/Project-management-for-freelancers.git $ReviewedCommit
if ($LASTEXITCODE -ne 0) { throw 'Could not fetch the reviewed commit. No enrollment was attempted.' }
& git -C $work checkout --quiet $ReviewedCommit -- scripts/email/enroll_verified_mail.py scripts/email/Invoke-MailEnrollment.ps1
if ($LASTEXITCODE -ne 0) { throw 'Reviewed enrollment source is missing.' }
$file = Join-Path $work 'scripts/email/enroll_verified_mail.py'
$digest = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant()
& ssh @sshOptions root@62.171.130.156 "install -d -m 700 $remote"
if ($LASTEXITCODE -ne 0) { throw 'Could not create a private enrollment directory.' }
& scp -o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=yes $file "root@62.171.130.156`:$remote/setup.py"
if ($LASTEXITCODE -ne 0) { throw 'Could not copy the reviewed enrollment file.' }
. (Join-Path $work 'scripts/email/Invoke-MailEnrollment.ps1')
Invoke-HouseMySiteMailEnrollment -RemoteFile "$remote/setup.py" -ExpectedDigest $digest
Write-Host 'Enrollment batch finished. Send the JSON result. No mailbox or DNS record was created.'
