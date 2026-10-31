$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $root 'scripts/email/Invoke-MailReadinessCheck.ps1')
$stage = Join-Path ([IO.Path]::GetTempPath()) ('hms-native-ssh-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
$previousPath = $env:PATH
$previousCapture = $env:HMS_MAIL_TEST_CAPTURE
try {
    $env:HMS_MAIL_TEST_CAPTURE = $stage
    # Real native executable, not a PowerShell function/mock. This exercises
    # Windows argument marshalling at the boundary that caused the incident.
    $source = @'
using System;
using System.IO;
using System.Text;
public class CaptureNativeSsh {
    public static int Main(string[] args) {
        string dir = Environment.GetEnvironmentVariable("HMS_MAIL_TEST_CAPTURE");
        File.WriteAllLines(Path.Combine(dir,"args.txt"),args);
        File.WriteAllText(Path.Combine(dir,"stdin.txt"),Console.In.ReadToEnd(),Encoding.UTF8);
        return File.Exists(Path.Combine(dir,"fail")) ? 23 : 0;
    }
}
'@
    $sourcePath = Join-Path $stage 'capture.cs'
    [IO.File]::WriteAllText($sourcePath,$source)
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    & $compiler /nologo /target:exe ("/out:" + (Join-Path $stage 'ssh.exe')) $sourcePath
    if ($LASTEXITCODE -ne 0) { throw 'Could not build the native SSH capture fixture.' }
    $env:PATH = $stage + [IO.Path]::PathSeparator + $previousPath
    $remote = '/root/hms-mail-check-' + ('a' * 32) + '/check.py'
    $digest = 'b' * 64
    Invoke-HouseMySiteMailReadinessCheck -RemoteFile $remote -ExpectedDigest $digest
    $arguments = [IO.File]::ReadAllLines((Join-Path $stage 'args.txt'))
    $expected = @('-T','-o','ConnectTimeout=10','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','root@62.171.130.156','python3 -I -')
    if (($arguments -join '|') -cne ($expected -join '|')) { throw 'Native SSH argument boundaries changed.' }
    $stdin = [IO.File]::ReadAllText((Join-Path $stage 'stdin.txt')).TrimEnd([char[]]"`r`n")
    $wanted = "import hashlib,runpy; p='$remote'; assert hashlib.sha256(open(p,'rb').read()).hexdigest()=='$digest'; runpy.run_path(p,run_name='__main__')"
    if ($stdin -cne $wanted) { throw 'Verifier code was corrupted before reaching SSH stdin.' }
    $rejected = $false
    try { Invoke-HouseMySiteMailReadinessCheck -RemoteFile '/root/unrelated.py' -ExpectedDigest $digest } catch { $rejected = $true }
    if (!$rejected) { throw 'Invalid remote path was accepted.' }
    [IO.File]::WriteAllText((Join-Path $stage 'fail'),'fail')
    $rejected = $false
    try { Invoke-HouseMySiteMailReadinessCheck -RemoteFile $remote -ExpectedDigest $digest } catch { $rejected = $true }
    if (!$rejected) { throw 'Failed SSH check was reported as successful.' }
    Write-Host "PASS native SSH stdin regression on PowerShell $($PSVersionTable.PSVersion). No server connection was made."
} finally {
    $env:PATH = $previousPath
    $env:HMS_MAIL_TEST_CAPTURE = $previousCapture
    Remove-Item -LiteralPath $stage -Recurse -Force
}
