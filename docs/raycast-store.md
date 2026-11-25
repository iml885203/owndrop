# Publishing OwnDrop to the Raycast Store

The `raycast/` folder is structured to satisfy Raycast Store submission guidelines for **both macOS and Windows** (`"platforms": ["macOS", "Windows"]`).

## Pre-Submission Checklist

1. Publish your OwnDrop server repository publicly on GitHub with MIT license and deployment docs.
2. Replace `"author": "owndrop"` in `raycast/package.json` with your Raycast Store handle (from [raycast.com/settings](https://www.raycast.com/settings)).
3. Capture 3–5 clean Raycast screenshots (2000×1250 PNG) inside `raycast/metadata/` showcasing:
   - Browse list with search, pinned items, and content previews
   - Drop form for text and file selection
   - Drop Text form
   - Preferences setup screen
4. Verify lint & production build:
   ```bash
   cd raycast
   npm ci
   npm run lint
   npm run build
   ```
5. Publish to `raycast/extensions`:
   ```bash
   npm run publish
   ```
   Once merged, you (and anyone self-hosting OwnDrop) can install OwnDrop from the Raycast Store on any macOS or Windows computer in one click.
