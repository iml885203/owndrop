# OwnDrop Raycast development and verification

User-facing setup and command guidance lives in [`raycast/README.md`](../raycast/README.md). This document records runtime behavior, implementation notes, and maintainer checks.

## Commands

- **Drop Clipboard** automatically sends clipboard text, URLs, or a file. On success, Browse Drops opens with the uploaded item selected and marked **Just dropped**. If the clipboard is empty or unsupported, enter text or choose files in the form. Selected files take priority over text. Clipboard images work when Raycast exposes them as a file; otherwise save the image and choose it in the form.

- **Copy & Drop** copies the current selection locally, then uploads it using the configured device token. Supports selected text/URLs, Finder files on macOS, and foreground File Explorer files on Windows. A HUD shows copying and sharing status, including the current file number for batch uploads. On Windows, the command closes the Raycast window and immediately acknowledges the hotkey before starting the native helper. The helper validates the actual foreground window and active tab, snapshots the selection, and copies it in one process. It never reads the existing clipboard. Empty or inaccessible selections do not upload anything. All files are copied before uploading; partial upload failures show success/failure counts and leave the local copy intact. Folders can be copied but the upload API rejects them.

- **Browse Drops** immediately shows locally cached drops and refreshes in the background on launch and every 10 seconds while open. Pinned items come first, then newest first within each group, matching the web app.

In Browse Drops:

- Text shows its full contents in the detail pane; Enter performs **Copy**.

- Links show their title, description, cover image, and website when available; Enter performs **Open Link**. Copy remains in Actions.

- Videos and audio have **Play Video** / **Play Audio** as the Enter action. The file is fetched to a temporary folder and opened in the system's default player. Copy and Download remain in Actions.

- PDFs and other files show their type, size, device, and creation time. Enter performs **Copy**; **Open File** opens a temporary copy with its default app.

- Select an image to see a cached preview in the detail pane. Only the selected image is fetched; images above 20 MB can still be copied or downloaded without a preview.

- **Copy** automatically copies text, image pixels, or a file reference according to the content type. Images reuse the preview cache and write PNG plus Bitmap on Windows, preserving PNG transparency after the helper exits. Windows supports PNG, JPEG, BMP, GIF (first frame), and TIFF through its image decoder; use **Download to Downloads** for image formats the system cannot decode.

- File copies use a temporary folder, keeping Downloads clear. The local file must remain available for paste and is not deleted when the clipboard changes. Choose **Download to Downloads** to save a separate copy there.

- Search filters loaded content immediately, then queries the server after a 250 ms pause. Superseded requests are cancelled. Search covers text, filenames, and devices.

- Results are cached separately for each query and server/device token. Drops, pins, and deletions update the current cache immediately; failed pin/delete requests roll back. Failed refreshes keep cached results visible and labeled.

## Copy & Drop hotkeys and verification

Assign a hotkey yourself in Raycast Settings > Extensions > OwnDrop > Copy & Drop.

The extension does not register hotkeys or monitor the clipboard. Keep Cmd+C / Ctrl+C for normal local copies.

Optional macOS examples are Ctrl+Option+Cmd+C for Copy & Drop and Ctrl+Option+Cmd+V for Browse Drops; avoid them when VoiceOver uses Control+Option. See the user guide for the current recommendations.

Run `npm ci` in both the repository root and `raycast/`, then from `raycast/` run `npm test`, `npm run lint`, and `npm run build`.

On Windows start the development extension with `npm run dev:windows`.

Manual acceptance (use synthetic data and your test OwnDrop device token):

1. Select text/a URL in a browser or editor, invoke Copy & Drop by hotkey, paste locally, and check Browse Drops on another device.

2. Select one, then multiple files in Finder/File Explorer. Invoke the hotkey, then paste into an empty folder. Confirm every file and its contents survived, including names with spaces, quotes, Unicode, and newlines where supported.

3. Put unrelated text in the clipboard, clear the current selection, and invoke the hotkey. No new drop should appear.

4. Disconnect the network and repeat. Local paste should still work. For a mixed batch with an unsupported folder, verify failure counts and successful files.

5. Confirm ordinary Cmd+C / Ctrl+C never uploads anything.

Multi-file copies use one native batch: macOS NSPasteboard with NSURL objects, Windows persistent FileDrop data. Raycast's Clipboard.copy({ file }) accepts a single file only. The macOS native paste flow requires a Mac to verify. On Windows the helper only reads the actual foreground Explorer window and rejects focus changes; it never scans background selections as a fallback. If Raycast has not restored Explorer focus, retry via a direct hotkey.

For an isolated Windows multi-file clipboard check, run `powershell.exe -NoProfile -STA -File tests/windows-file-clipboard.ps1` from `raycast/`. This replaces the clipboard with two synthetic file references and checks that both persist after the writer exits. It leaves synthetic source files available for an Explorer paste test.

### Windows 11 Explorer tabs

Explorer automation exposes one Shell entry per tab, and multiple entries can share the same top-level HWND. Copy & Drop matches the foreground window and then resolves the active ShellTabWindowClass child against each entry's IShellBrowser window. It never chooses the first/last entry or searches background tabs for a nonempty selection. If the active tab is empty, nothing is uploaded; if tab identity or foreground focus changes during capture, selection is rejected.

Implementation references: [Filee issue #239](https://github.com/KnifeLemon/Filee/issues/239) describes the same inactive-tab failure; [ExplorerTabUtility](https://github.com/w4po/ExplorerTabUtility/blob/master/ExplorerTabUtility/Hooks/ExplorerWatcher.cs) resolves tab handles through Shell service interfaces.

Read-only native check: from `raycast/`, run `powershell.exe -NoProfile -STA -File tests/windows-explorer-tabs.ps1` with a tabbed Explorer window open. This verifies active-tab mapping without reading clipboard/file contents or uploading. Also manually verify tab 2 with selected files while tab 1 is empty, then tab 2 empty while tab 1 retains a selection. Only the visible active tab should be shared.

## Hotkey review (2026-11-28)

The suggested bindings prioritize avoiding default operating-system shortcuts. Application-specific shortcuts are outside the selection criterion; users must still check their installed software. No runtime bindings are registered or changed.

- Windows examples: Ctrl+Alt+C / Ctrl+Alt+V. These are not listed as standard system actions in [Microsoft's Windows shortcut reference](https://support.microsoft.com/en-gb/accessibility/windows/keyboard-shortcuts-in-windows). This is a documentation check, not proof that a combination is free. Keep Win+V for Windows clipboard history, Ctrl+C/V for local copy/paste, and avoid input-method shortcuts.
- macOS examples: Ctrl+Option+Cmd+C / Ctrl+Option+Cmd+V. The extra Control modifier avoids Option+Cmd+C/V, which have existing style/paste and Finder uses in [Apple's reference](https://support.apple.com/en-us/102650).
- VoiceOver caveat: its modifier may be Control+Option. [VO+Cmd+C](https://support.apple.com/en-sg/guide/voiceover/vo14100/mac) searches for style changes, and [VO+Cmd+V](https://support.apple.com/en-lamr/guide/voiceover/cpvokys08/mac) searches visited links. VoiceOver users should choose different keys or aliases.
- App conflicts remain possible: JetBrains uses Ctrl+Alt+C/V for extract constant/variable, and even Ctrl+Alt+Shift+C/V already mean copy reference/paste plain text in its [Windows keymap](https://www.jetbrains.com/help/idea/reference-keymap-win-default.html). Simply adding Shift is not a universal fix.
- [Raycast aliases](https://manual.raycast.com/command-aliases-and-hotkeys) offer access within Raycast without reserving another global combination.
