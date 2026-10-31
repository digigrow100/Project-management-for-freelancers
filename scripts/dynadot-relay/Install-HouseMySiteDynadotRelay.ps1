param(
    [Parameter(Mandatory=$true)]
    [ValidatePattern('^[a-f0-9]{40}$')]
    [string]$ReviewedCommit
)
$ErrorActionPreference = 'Stop'
$stage = Join-Path $env:TEMP ('hms-dynadot-relay-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
& git -C $stage init --quiet
if ($LASTEXITCODE -ne 0) { throw 'Git initialization failed.' }
& git -C $stage remote add origin https://github.com/digigrow100/Project-management-for-freelancers.git
if ($LASTEXITCODE -ne 0) { throw 'Git remote setup failed.' }
& git -C $stage fetch --depth=1 origin $ReviewedCommit
if ($LASTEXITCODE -ne 0) { throw 'Reviewed source download failed.' }
& git -C $stage -c core.autocrlf=false checkout --quiet --detach FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw 'Reviewed source extraction failed.' }
$actual = (& git -C $stage rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $actual -cne $ReviewedCommit) { throw 'Reviewed commit mismatch.' }
$source = Join-Path $stage 'scripts\dynadot-relay'
$names = @('relay.py', 'install.py', 'housemysite-dynadot-relay.service')
$hashes = @{}
foreach ($name in $names) {
    $hashes[$name] = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $source $name)).Hash.ToLowerInvariant()
}
$sshOptions = @('-T', '-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes')
$target = 'root@62.171.130.156'
$remote = (& ssh @sshOptions $target 'umask 077; mktemp -d /root/hms-dynadot-stage-XXXXXXXX').Trim()
if ($LASTEXITCODE -ne 0 -or $remote -notmatch '^/root/hms-dynadot-stage-[A-Za-z0-9]{8}$') { throw 'Private VPS staging failed.' }
foreach ($name in $names) {
    & scp -o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=yes (Join-Path $source $name) "${target}:$remote/$name"
    if ($LASTEXITCODE -ne 0) { throw 'Reviewed source upload failed. Do not continue.' }
}
# All dynamic shell words below are fixed names, validated paths or hexadecimal hashes.
foreach ($name in $names) {
    $check = (& ssh @sshOptions $target "sha256sum $remote/$name").Trim()
    if ($LASTEXITCODE -ne 0 -or $check -cne ($hashes[$name] + '  ' + $remote + '/' + $name)) { throw 'Uploaded source hash mismatch. Setup stopped.' }
}
$relayHash = $hashes['relay.py']
$unitHash = $hashes['housemysite-dynadot-relay.service']
& ssh @sshOptions $target "python3 -I $remote/install.py --relay-sha $relayHash --unit-sha $unitHash --execute"
if ($LASTEXITCODE -ne 0) { throw 'Relay installation stopped. Send the output; do not repeat this batch.' }
Write-Host 'Batch finished. Send the final JSON output. No domain settings or renewals were changed.'
