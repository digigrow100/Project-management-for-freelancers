# Feed Python through stdin. Embedded -c quotes do not survive all Windows
# PowerShell -> native ssh.exe -> remote bash combinations.
function Invoke-HouseMySiteMailReadinessCheck {
    param(
        [Parameter(Mandatory=$true)][ValidatePattern('^/root/hms-mail-check-[a-f0-9]{32}/check\.py$')][string]$RemoteFile,
        [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedDigest
    )
    $verify = "import hashlib,runpy; p='$RemoteFile'; assert hashlib.sha256(open(p,'rb').read()).hexdigest()=='$ExpectedDigest'; runpy.run_path(p,run_name='__main__')"
    $verify | & ssh -T -o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=yes root@62.171.130.156 'python3 -I -'
    if ($LASTEXITCODE -ne 0) { throw 'The combined check did not finish. No email or DNS settings were changed.' }
}
