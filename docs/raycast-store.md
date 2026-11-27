# Publishing OwnDrop to the Raycast Store

Submit the extension in `raycast/` to [raycast/extensions](https://github.com/raycast/extensions). Link back to the [OwnDrop server repository](https://github.com/iml885203/owndrop) so reviewers and users can find the deployment instructions.

## Store content

The store's source is [`raycast/extensions/extensions/owndrop`](https://github.com/raycast/extensions/tree/main/extensions/owndrop). Updating this repository alone does not update the live store listing: submit an extension update through the Raycast publishing flow and wait for it to merge.

- `raycast/package.json`: one-sentence store summary and command descriptions.
- `raycast/README.md`: short user guide with two illustrated diagrams.
- `raycast/media/`: README images. Include this folder with the extension update; keep relative links intact.
- `raycast/help.md`: concise connection instructions beside the required preferences form.
- `raycast/metadata/`: actual Raycast captures for the store gallery, separate from the README illustrations.
- [Development and verification](raycast-development.md): detailed behavior and maintainer checks kept out of the store guide.

The diagrams in `media/` are explanatory illustrations, not application screenshots. Do not submit them as gallery captures. The existing gallery captures show the earlier Drop/Browse labels; refresh them in the current development version before the next store submission. Keep 2000 x 1250 PNG captures, a consistent background, and synthetic data only. Show **Copy & Drop** in the command search for discoverability, **Drop Clipboard** with a manual entry form, and **Browse Drops** with a useful preview.

See the [official store preparation guide](https://developers.raycast.com/basics/prepare-an-extension-for-store) for media locations, capture requirements, and supported language.

## Verify the extension

Run from the OwnDrop checkout:

```bash
cd raycast
npm ci
npm run lint
npm run build
npm run dev
```

In Raycast, connect to an OwnDrop test instance with its server URL and a device token. Use **Drop Clipboard** to send synthetic text, a link, and an image. In **Browse Drops**, verify that new entries appear, search finds them, a pinned entry stays at the top, and the image can be previewed and downloaded. Check that the downloaded file matches the original. Record the platforms actually tested in the PR.

## Capture screenshots

Use Raycast's [Capture Window command](https://developers.raycast.com/basics/prepare-an-extension-for-store#adding-screenshots) while the development extension is open. Assign the command a hotkey and select **Save to Metadata** to save the 2000 × 1250 PNGs under `raycast/metadata/`.

Capture three views with the same theme and background:

- **Drop Clipboard** with the manual entry form and sample release notes.
- **Browse Drops** with a search result, a pinned checklist, and a sample link.
- **Browse Drops** with an image selected and its preview visible.

Use sample data only. Check the full image for credentials, private clipboard contents, device names, and URLs before adding it to the PR or README.

## Submit

Verify the author in `raycast/package.json` matches your [Raycast handle](https://www.raycast.com/settings). From `raycast/`, run `npm run publish` when ready to submit.

Suggested PR title: **Update OwnDrop: Copy & Drop and clearer setup**

> OwnDrop brings a self-hosted clipboard and file inbox to Raycast. Use **Copy & Drop** for your current selection, **Drop Clipboard** for something already copied, and **Browse Drops** to find it again. Connect to your OwnDrop instance with its server URL and a revocable device token.
