# OwnDrop Changelog

## [Simplified Drop and Browse] - 2026-11-25

- Reduced the command list to **Drop** and **Browse** with automatic clipboard detection and manual text/file fallback.
- Show the uploaded item in Browse after a successful drop.
- Added cached results, immediate local search, debounced server search, background refresh, and pin-first ordering matching the web app.
- Added authenticated, cached image previews for the selected item.
- Made **Open Link** the default action for URLs and **Copy** the default for text and files.
- Store clipboard file copies in temporary folders instead of Downloads.
- Added Windows development/build scripts for Raycast versions using the original extension directory.

## [Initial Version] - {PR_MERGE_DATE}

- Added **Browse Drops** command to search, copy, paste, open URLs, download files, pin, and delete drops (macOS & Windows)
- Added **Drop Clipboard** background command to instantly send clipboard text, links, or images
- Added **Copy Latest Drop** background command to grab the newest drop without opening a browser
- Added **Drop Files** and **Drop Text** commands
- Added **OwnDrop Menu Bar** command for macOS
