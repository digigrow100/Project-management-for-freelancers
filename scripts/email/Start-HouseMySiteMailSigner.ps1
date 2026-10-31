$ErrorActionPreference='Stop'
$existing=Join-Path $env:LOCALAPPDATA 'HouseMySiteQuotaRehearsal'
$python=Join-Path $existing '.venv/Scripts/python.exe'
$key=Join-Path $existing 'owner-private-encrypted.pem'
$signer=Join-Path $PSScriptRoot 'hms_mail_signer.py'
foreach($file in @($python,$key,$signer)){if(!(Test-Path -LiteralPath $file -PathType Leaf)){throw 'The existing local Python, encrypted owner key or updated mail signer was not found. No key was created or replaced.'}}
Write-Host 'Keep this window open. Enter your existing key passphrase here only. Close an older signer window first if port 47419 is occupied.'
& $python $signer serve --key $key --origin 'https://web.housemysite.com'
if($LASTEXITCODE -ne 0){throw 'Local mail signer stopped. No provider operation was executed.'}
