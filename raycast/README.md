# OwnDrop for Raycast (macOS & Windows)

## Setup

1. Open OwnDrop, choose **Devices**, and create a token for this computer.

2. Click **Copy Connection Details** and paste it into **Connection Details or Device API Token** in extension preferences. For manual setup, paste the token there and set **Server URL (Manual Setup)** separately.

3. Optionally assign hotkeys to **Drop** and **Browse**.

## Commands

- **Drop** automatically sends clipboard text, URLs, or a file. On success, Browse opens with the uploaded item selected and marked **Just dropped**. If the clipboard is empty or unsupported, enter text or choose files in the form. Selected files take priority over text. Clipboard images work when Raycast exposes them as a file; otherwise save the image and choose it in the form.

- **Copy & Share** copies the current selection locally, then uploads it using the configured device token. Supports selected text/URLs, Finder files on macOS, and foreground File Explorer files on Windows. A HUD shows copying and sharing status, including the current file number for batch uploads. On Windows, the command closes the Raycast window and immediately acknowledges the hotkey before starting the native helper. The helper validates the actual foreground window and active tab, snapshots the selection, and copies it in one process. It never reads the existing clipboard. Empty or inaccessible selections do not upload anything. All files are copied before uploading; partial upload failures show success/failure counts and leave the local copy intact. Folders can be copied but the upload API rejects them.

- **Browse** immediately shows locally cached drops and refreshes in the background on launch and every 10 seconds while open. Pinned items come first, then newest first within each group, matching the web app.

In Browse:

- Text shows its full contents in the detail pane; Enter performs **Copy**.

- Links show their title, description, cover image, and website when available; Enter performs **Open Link**. Copy remains in Actions.

- Videos and audio have **Play Video** / **Play Audio** as the Enter action. The file is fetched to a temporary folder and opened in the system's default player. Copy and Download remain in Actions.

- PDFs and other files show their type, size, device, and creation time. Enter performs **Copy**; **Open File** opens a temporary copy with its default app.

- Select an image to see a cached preview in the detail pane. Only the selected image is fetched; images above 20 MB can still be copied or downloaded without a preview.

- **Copy** automatically copies text, image pixels, or a file reference according to the content type. Images reuse the preview cache and write PNG plus Bitmap on Windows, preserving PNG transparency after the helper exits. Windows supports PNG, JPEG, BMP, GIF (first frame), and TIFF through its image decoder; use **Download to Downloads** for image formats the system cannot decode.

- File copies use a temporary folder, keeping Downloads clear. The local file must remain available for paste and is not deleted when the clipboard changes. Choose **Download to Downloads** to save a separate copy there.

- Search filters loaded content immediately, then queries the server after a 250 ms pause. Superseded requests are cancelled. Search covers text, filenames, and devices.

- Results are cached separately for each query and server/device token. Drops, pins, and deletions update the current cache immediately; failed pin/delete requests roll back. Failed refreshes keep cached results visible and labeled.

## Copy & Share hotkeys and verification

Assign a hotkey yourself in Raycast Settings > Extensions > OwnDrop > Copy & Share.

The extension does not register hotkeys or monitor the clipboard. Keep Cmd+C / Ctrl+C for normal local copies.

Suggested macOS bindings are Cmd+Option+C for Copy & Share and Cmd+Option+V for Browse; check your app conflicts first.

Run `npm ci` in both the repository root and `raycast/`, then from `raycast/` run `npm test`, `npm run lint`, and `npm run build`.

On Windows start the development extension with `npm run dev:windows`.

Manual acceptance (use synthetic data and your test OwnDrop device token):

1. Select text/a URL in a browser or editor, invoke Copy & Share by hotkey, paste locally, and check Browse on another device.

2. Select one, then multiple files in Finder/File Explorer. Invoke the hotkey, then paste into an empty folder. Confirm every file and its contents survived, including names with spaces, quotes, Unicode, and newlines where supported.

3. Put unrelated text in the clipboard, clear the current selection, and invoke the hotkey. No new drop should appear.

4. Disconnect the network and repeat. Local paste should still work. For a mixed batch with an unsupported folder, verify failure counts and successful files.

5. Confirm ordinary Cmd+C / Ctrl+C never uploads anything.

Multi-file copies use one native batch: macOS NSPasteboard with NSURL objects, Windows persistent FileDrop data. Raycast's Clipboard.copy({ file }) accepts a single file only. The macOS native paste flow requires a Mac to verify. On Windows the helper only reads the actual foreground Explorer window and rejects focus changes; it never scans background selections as a fallback. If Raycast has not restored Explorer focus, retry via a direct hotkey.

For an isolated Windows multi-file clipboard check, run `powershell.exe -NoProfile -STA -File tests/windows-file-clipboard.ps1` from `raycast/`. This replaces the clipboard with two synthetic file references and checks that both persist after the writer exits. It leaves synthetic source files available for an Explorer paste test.

### Windows 11 Explorer tabs

Explorer automation exposes one Shell entry per tab, and multiple entries can share the same top-level HWND. Copy & Share matches the foreground window and then resolves the active ShellTabWindowClass child against each entry's IShellBrowser window. It never chooses the first/last entry or searches background tabs for a nonempty selection. If the active tab is empty, nothing is uploaded; if tab identity or foreground focus changes during capture, selection is rejected.

Implementation references: [Filee issue #239](https://github.com/KnifeLemon/Filee/issues/239) describes the same inactive-tab failure; [ExplorerTabUtility](https://github.com/w4po/ExplorerTabUtility/blob/master/ExplorerTabUtility/Hooks/ExplorerWatcher.cs) resolves tab handles through Shell service interfaces.

Read-only native check: from `raycast/`, run `powershell.exe -NoProfile -STA -File tests/windows-explorer-tabs.ps1` with a tabbed Explorer window open. This verifies active-tab mapping without reading clipboard/file contents or uploading. Also manually verify tab 2 with selected files while tab 1 is empty, then tab 2 empty while tab 1 retains a selection. Only the visible active tab should be shared.
