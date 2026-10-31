function Invoke-HouseMySiteMailEnrollment {
    param(
        [Parameter(Mandatory=$true)][ValidatePattern('^/root/hms-mail-enrollment-[a-f0-9]{32}/setup\.py$')][string]$RemoteFile,
        [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedDigest
    )
    $verify = "import hashlib,runpy,sys; p='$RemoteFile'; assert hashlib.sha256(open(p,'rb').read()).hexdigest()=='$ExpectedDigest'; sys.argv=[p,'--execute']; runpy.run_path(p,run_name='__main__')"
    $verify | & ssh -T -o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=yes root@62.171.130.156 'python3 -I -'
    if ($LASTEXITCODE -ne 0) { throw 'Email enrollment stopped. Preserve the JSON and backup. Do not repeat this batch.' }
}
