param(
    [switch]$PrintStatus
)

$ErrorActionPreference = 'SilentlyContinue'
$repoRoot = Split-Path -Parent $PSScriptRoot
$icoPath = Join-Path $repoRoot 'Assets\logo.ico'
$batPath = Join-Path $repoRoot 'start_studio.bat'

if (-not (Test-Path $icoPath)) {
    exit 0
}

# 1. Set the active console window's small & large icon (Titlebar + Windows Taskbar) to Assets\logo.ico
try {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class StudioConsoleIcon {
    [DllImport("kernel32.dll")]
    public static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr SendMessage(IntPtr hWnd, int Msg, int wParam, IntPtr lParam);
}
"@
    Add-Type -AssemblyName System.Drawing
    $hwnd = [StudioConsoleIcon]::GetConsoleWindow()
    if ($hwnd -ne [IntPtr]::Zero) {
        $icon = New-Object System.Drawing.Icon($icoPath)
        [void][StudioConsoleIcon]::SendMessage($hwnd, 0x0080, 0, $icon.Handle)
        [void][StudioConsoleIcon]::SendMessage($hwnd, 0x0080, 1, $icon.Handle)
    }
} catch {}

# 2. Create/update branded Windows shortcuts (.lnk) with Assets\logo.ico in the repo root and on Desktop
try {
    $wsh = New-Object -ComObject WScript.Shell
    $desktopDir = [Environment]::GetFolderPath('Desktop')
    $targets = @(
        (Join-Path $repoRoot 'ComfyUI Motion Previs Studio.lnk')
    )
    if ($desktopDir -and (Test-Path $desktopDir)) {
        $targets += (Join-Path $desktopDir 'ComfyUI Motion Previs Studio.lnk')
    }

    foreach ($lnkPath in $targets) {
        $shortcut = $wsh.CreateShortcut($lnkPath)
        $shortcut.TargetPath = $batPath
        $shortcut.WorkingDirectory = $repoRoot
        $shortcut.IconLocation = "$icoPath,0"
        $shortcut.Description = "ComfyUI Motion Previs Studio - Previsualize 3D Scenes for AI Filmmaking"
        $shortcut.Save()
        if ($PrintStatus) {
            Write-Host "[OK] Created branded launcher shortcut with official logo: $lnkPath" -ForegroundColor Green
        }
    }
} catch {}

