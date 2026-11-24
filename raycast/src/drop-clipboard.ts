import path from "node:path";
import { Clipboard, showHUD, showToast, Toast } from "@raycast/api";
import { dropFileFromPath, dropText, normalizeLocalPath } from "./api";

export default async function DropClipboardCommand() {
  try {
    const content = await Clipboard.read();

    if (content.file) {
      const localPath = normalizeLocalPath(content.file);
      await showToast({
        style: Toast.Style.Animated,
        title: `Uploading ${path.basename(localPath)}…`,
      });
      const item = await dropFileFromPath(localPath);
      await showHUD(`Dropped ${item.name || "file"} to OwnDrop`);
      return;
    }

    const text = content.text?.trim();
    if (text) {
      await dropText(text);
      const preview = text.length > 42 ? `${text.slice(0, 42)}…` : text;
      await showHUD(`Dropped: ${preview}`);
      return;
    }

    await showToast({
      style: Toast.Style.Failure,
      title: "Clipboard is empty",
    });
  } catch (err) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to drop clipboard",
      message: (err as Error).message,
    });
  }
}
