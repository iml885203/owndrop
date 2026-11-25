# Publishing OwnDrop to the Raycast Store

Submit the extension in `raycast/` to [raycast/extensions](https://github.com/raycast/extensions). Link back to the [OwnDrop server repository](https://github.com/iml885203/owndrop) so reviewers and users can find the deployment instructions.

## Verify the extension

Run from the OwnDrop checkout:

```bash
cd raycast
npm ci
npm run lint
npm run build
npm run dev
```

In Raycast, connect to an OwnDrop test instance with its server URL and a device token. Use **Drop** to send synthetic text, a link, and an image. In **Browse**, verify that new entries appear, search finds them, a pinned entry stays at the top, and the image can be previewed and downloaded. Check that the downloaded file matches the original. Record the platforms actually tested in the PR.

## Capture screenshots

Use Raycast's [Capture Window command](https://developers.raycast.com/basics/prepare-an-extension-for-store#adding-screenshots) while the development extension is open. Assign the command a hotkey and select **Save to Metadata** to save the 2000 × 1250 PNGs under `raycast/metadata/`.

Capture three views with the same theme and background:

- **Drop** with the manual entry form and sample release notes.
- **Browse** with a search result, a pinned checklist, and a sample link.
- **Browse** with an image selected and its preview visible.

Use sample data only. Check the full image for credentials, private clipboard contents, device names, and URLs before adding it to the PR or README.

## Submit

Verify the author in `raycast/package.json` matches your [Raycast handle](https://www.raycast.com/settings). From `raycast/`, run `npm run publish` when ready to submit.

Suggested PR title: **Add OwnDrop extension**

> OwnDrop brings a self-hosted clipboard and file inbox to Raycast. Use **Drop** to send text, links, and files, and **Browse** to search, copy, preview, pin, and download them. Connect to your OwnDrop instance with its server URL and a revocable device token.
