import { Clipboard, showHUD, showToast, Toast } from "@raycast/api";
import { downloadDropToDownloads, getLatestDrop } from "./api";

export default async function CopyLatestCommand() {
  try {
    const latest = await getLatestDrop();

    if (latest.type === "text" && latest.text) {
      await Clipboard.copy(latest.text);
      const from = latest.device ? ` (${latest.device})` : "";
      const snippet =
        latest.text.length > 40 ? `${latest.text.slice(0, 40)}…` : latest.text;
      await showHUD(`Copied${from}: ${snippet}`);
      return;
    }

    await showToast({
      style: Toast.Style.Animated,
      title: `Downloading ${latest.name || "latest file"}…`,
    });
    const savedPath = await downloadDropToDownloads(latest);
    await Clipboard.copy({ file: savedPath });
    await showHUD(`Downloaded & copied ${latest.name || "file"}`);
  } catch (err) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Could not fetch latest drop",
      message: (err as Error).message,
    });
  }
}
