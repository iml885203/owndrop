# OwnDrop for Raycast (macOS & Windows)

## Setup

1. Open OwnDrop, choose **Devices**, and create a token for this computer.
2. Set **Server URL** and **Device API Token** in extension preferences.
3. Optionally assign hotkeys to **Drop** and **Browse**.

## Commands

- **Drop** automatically sends clipboard text, URLs, or a file. On success, Browse opens with the uploaded item selected and marked **Just dropped**. If the clipboard is empty or unsupported, enter text or choose files in the form. Selected files take priority over text. Clipboard images work when Raycast exposes them as a file; otherwise save the image and choose it in the form.
- **Browse** immediately shows locally cached drops and refreshes in the background on launch and every 10 seconds while open. Pinned items come first, then newest first within each group, matching the web app.

In Browse:

- Press Enter to **Open Link** for URLs, or **Copy** for text and files. Copy remains available in Actions for links.
- Select an image to see a cached preview in the detail pane. Only the selected image is fetched; images above 20 MB can still be copied or downloaded without a preview.
- File copies use a temporary folder, keeping Downloads clear. The local file must remain available for paste and is not deleted when the clipboard changes. Choose **Download to Downloads** to save a separate copy there.
- Search filters loaded content immediately, then queries the server after a 250 ms pause. Superseded requests are cancelled. Search covers text, filenames, and devices.
- Results are cached separately for each query and server/device token. Drops, pins, and deletions update the current cache immediately; failed pin/delete requests roll back. Failed refreshes keep cached results visible and labeled.

## Development

```bash
cd raycast
npm install
npm run dev
```

For Windows Raycast versions that read from `~/.config/raycast` rather than the newer SDK default `~/.config/raycast-x`:

```bash
npm run dev:windows
```

`npm run build:windows` builds into the same directory and checks TypeScript.
