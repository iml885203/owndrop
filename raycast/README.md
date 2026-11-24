# OwnDrop for Raycast (macOS & Windows)

Send and receive text, links, screenshots, and files across your devices using your own [OwnDrop](https://github.com/your-org/owndrop) instance — without ever opening a browser tab.

## Setup

1. Open your OwnDrop web UI → click **Devices** → create a token for this machine (e.g., `MacBook Pro` or `Windows PC`).
2. Open Raycast → **OwnDrop** extension preferences:
   - **Server URL**: Your OwnDrop URL (e.g., `https://drop.example.com`)
   - **Device API Token**: The `owd_...` token generated in step 1.
3. *(Recommended)* Assign global hotkeys to **Drop Clipboard** and **Copy Latest Drop**.

## Commands

| Command | Platforms | Description |
| :--- | :--- | :--- |
| **Browse Drops** | macOS, Windows | Search recent drops, copy text, paste directly, open URLs, download files, pin, or delete. |
| **Drop Clipboard** | macOS, Windows | Background command that immediately uploads your clipboard text, link, or image. |
| **Copy Latest Drop** | macOS, Windows | Background command that copies the newest text (or downloads & copies the newest file). |
| **Drop Files** | macOS, Windows | Upload one or more files (auto-prefills selected Finder items on macOS). |
| **Drop Text** | macOS, Windows | Quick form to type or paste a snippet. |
| **OwnDrop Menu Bar** | macOS | Menu bar popover showing your latest drops for 1-click copy. |

## Local Development

```bash
cd raycast
npm install
npm run dev
```
