; Added to the Windows installer by electron-builder (package.json, nsis.include).
; Uninstalling removes the app, its shortcuts, file types and its entry in Settings → Apps,
; and the copy of the installer kept for updates (%LOCALAPPDATA%\margin-updater). It then
; asks whether to delete what Margin kept in %APPDATA%\Margin as well: documents, version
; history, settings and the AI accounts' .env file with any keys. The default is to keep
; them, so reinstalling brings everything back.
;   Updates never ask and never delete.
;   "Uninstall Margin.exe" /S                    removes the app, keeps the data
;   "Uninstall Margin.exe" /S --delete-app-data  removes both (electron-builder's own switch)
; The one-click uninstaller switches itself to silent mode after its "Are you sure?", so
; ${Silent} cannot tell whether the user asked for /S: the command line is checked instead,
; and the question has no /SD default, so it is shown even in that silent mode.

!macro customUnInstall
  ${ifNot} ${isUpdated}
    RMDir /r "$LOCALAPPDATA\margin-updater"
    ${GetParameters} $R0
    ClearErrors
    ${GetOptions} $R0 "--delete-app-data" $R1
    ${if} ${Errors}
      ClearErrors
      ${GetOptions} $R0 "/S" $R1
      ${if} ${Errors}
        MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also delete your Margin documents, version history, settings and AI keys from this computer?$\r$\n$\r$\nChoose No to keep them, for example to install Margin again later. Documents you saved as files are not affected either way." IDNO margin_keep_data
          RMDir /r "$APPDATA\Margin"
        margin_keep_data:
      ${endIf}
    ${endIf}
  ${endIf}
!macroend
