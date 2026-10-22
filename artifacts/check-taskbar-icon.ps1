Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class GrungusIconProbe {
 [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
}
"@
$taskWindow = Get-Process electron | Where-Object { $_.MainWindowTitle -eq 'Grungus Matrix' } | Select-Object -First 1
if ($taskWindow) {
 $taskIcon = [GrungusIconProbe]::SendMessage($taskWindow.MainWindowHandle, 127, [IntPtr]1, [IntPtr]0)
 Write-Output "Window icon handle: $taskIcon"
 if ($taskIcon -ne [IntPtr]0) { $taskBitmap = [System.Drawing.Icon]::FromHandle($taskIcon).ToBitmap(); $taskBitmap.Save('G:\Projekte\grungus-frontend\artifacts\taskbar-window-icon.png'); $taskBitmap.Dispose() }
} else { Write-Output 'No visible Grungus window found' }
