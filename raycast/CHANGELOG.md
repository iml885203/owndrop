# OwnDrop Changelog

## [Clearer Setup Guide] - {PR_MERGE_DATE}

- Added illustrated command and connection guides, shorter store descriptions, and setup help beside the connection preferences.
- Documented optional hotkeys that preserve standard OS copy/paste, including notes for VoiceOver, input methods, and existing app bindings.

## [Copy & Drop] - 2026-11-28

- Standardized command titles to **Copy & Drop**, **Drop Clipboard**, and **Browse Drops**; command identifiers stay unchanged to preserve configured hotkeys.

- Added a no-view **Copy & Drop** command for selected text, links, and Finder/File Explorer files, with user-configured hotkeys.
- Preserve local clipboard copies when sharing fails, reject empty selections without reading old clipboard data, and report per-file upload progress and partial failures.
- Support native multi-file clipboard copies and resolve the active Windows 11 Explorer tab before sharing.
- Show immediate processing feedback and combine Windows selection capture and clipboard copying in one helper process.

## [Initial Version] - {PR_MERGE_DATE}

- Added **Drop** command to automatically send clipboard text, links, or files to your OwnDrop instance, with manual text/file fallback.
- Added **Browse** command to search, copy, preview, open links, play media, pin, download, and delete drops across macOS and Windows.
- Added cached results, debounced server search, background refresh, pin-first ordering, and authenticated image previews.
