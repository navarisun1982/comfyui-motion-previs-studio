Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

' Build dist/index.html if not already present
If Not fso.FileExists(scriptDir & "\dist\index.html") Then
    WshShell.Run "cmd /c npm run build", 0, True
End If

' Launch native Electron app without any command prompt window
electronExe = scriptDir & "\node_modules\electron\dist\electron.exe"
If fso.FileExists(electronExe) Then
    WshShell.Run """" & electronExe & """ """ & scriptDir & """", 1, False
Else
    WshShell.Run "cmd /c npx electron .", 0, False
End If
