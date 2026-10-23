' ComfyUI Motion Previs Studio - silent desktop launcher (no console window).
'
' Rebuilds dist/ only when it is missing or older than the source tree, so a
' double-click never launches a stale bundle. If the build fails, the build
' log is shown instead of launching.
Option Explicit

Dim WshShell, fso, scriptDir, distIndex, needsBuild, electronExe, logPath, exitCode
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir
distIndex = scriptDir & "\dist\index.html"

' Newest modification time of any file under a folder (recursive).
Function NewestInFolder(folderPath)
    Dim newest, folder, f, subFolder, t
    newest = CDate("1970-01-01")
    If fso.FolderExists(folderPath) Then
        Set folder = fso.GetFolder(folderPath)
        For Each f In folder.Files
            If f.DateLastModified > newest Then newest = f.DateLastModified
        Next
        For Each subFolder In folder.SubFolders
            t = NewestInFolder(subFolder.Path)
            If t > newest Then newest = t
        Next
    End If
    NewestInFolder = newest
End Function

Function NewestOfFile(filePath, current)
    NewestOfFile = current
    If fso.FileExists(filePath) Then
        If fso.GetFile(filePath).DateLastModified > current Then NewestOfFile = fso.GetFile(filePath).DateLastModified
    End If
End Function

needsBuild = True
If fso.FileExists(distIndex) Then
    Dim srcNewest, builtAt
    srcNewest = NewestInFolder(scriptDir & "\src")
    srcNewest = NewestOfFile(scriptDir & "\index.html", srcNewest)
    srcNewest = NewestOfFile(scriptDir & "\package.json", srcNewest)
    srcNewest = NewestOfFile(scriptDir & "\vite.config.ts", srcNewest)
    builtAt = fso.GetFile(distIndex).DateLastModified
    needsBuild = (srcNewest > builtAt)
End If

If needsBuild Then
    logPath = WshShell.ExpandEnvironmentStrings("%TEMP%") & "\comfyui-motion-previs-build.log"
    exitCode = WshShell.Run("cmd /c npm run build > """ & logPath & """ 2>&1", 0, True)
    If exitCode <> 0 Then
        MsgBox "The production build failed, so the studio was not launched." & vbCrLf & vbCrLf & _
               "Build log: " & logPath, vbCritical, "ComfyUI Motion Previs Studio"
        WshShell.Run "notepad """ & logPath & """", 1, False
        WScript.Quit 1
    End If
End If

' Launch the Electron desktop app without a command prompt window.
electronExe = scriptDir & "\node_modules\electron\dist\electron.exe"
If fso.FileExists(electronExe) Then
    WshShell.Run """" & electronExe & """ """ & scriptDir & """", 1, False
Else
    WshShell.Run "cmd /c npx electron .", 0, False
End If
