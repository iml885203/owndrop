# OwnDrop for Raycast (macOS & Windows)

## Setup

1. Open OwnDrop, choose **Devices**, and create a token for this computer.
2. Set **Server URL** and **Device API Token** in extension preferences.
3. Optionally assign hotkeys to **Drop** and **Browse**.

## Commands

- **Drop** automatically sends clipboard text, URLs, or a file. On success, Browse opens with the uploaded item selected and marked **Just dropped**. If the clipboard is empty or unsupported, enter text or choose files in the form. Selected files take priority over text. Clipboard images work when Raycast exposes them as a file; otherwise save the image and choose it in the form.
- **Browse** immediately shows locally cached drops and refreshes in the background on launch and every 10 seconds while open. Pinned items come first, then newest first within each group, matching the web app.

In Browse:

- Text shows its full contents in the detail pane; Enter performs **Copy**.
- Links show their title, description, cover image, and website when available; Enter performs **Open Link**. Copy remains in Actions.
- Videos and audio have **Play Video** / **Play Audio** as the Enter action. The file is fetched to a temporary folder and opened in the system's default player. Copy and Download remain in Actions.
- PDFs and other files show their type, size, device, and creation time. Enter performs **Copy**; **Open File** opens a temporary copy with its default app.
- Select an image to see a cached preview in the detail pane. Only the selected image is fetched; images above 20 MB can still be copied or downloaded without a preview.
- **Copy** on an image reuses the preview cache and writes image pixels to the native clipboard (PNG plus Bitmap on Windows). PNG transparency is preserved, and the clipboard data persists after the helper exits. **Copy File** remains available separately. Windows supports PNG, JPEG, BMP, GIF (first frame), and TIFF through its image decoder; formats such as WebP, AVIF, and SVG may require **Copy File**. Other file types continue to use file clipboard references.
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

## Windows image clipboard verification

Run `npm run test:clipboard:windows`. By default it checks PNG/JPEG/BMP/GIF/TIFF payloads, transparency, and the absence of file references without changing the clipboard. Use `npm run test:clipboard:windows -- -Integration` to verify the real clipboard after the helper exits; this mode restores the previous clipboard afterward.

The macOS PNG clipboard path requires testing on macOS.
