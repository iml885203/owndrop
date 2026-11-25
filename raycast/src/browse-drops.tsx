import { useState } from "react";
import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  Color,
  confirmAlert,
  Icon,
  Keyboard,
  List,
  open,
  openExtensionPreferences,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import {
  deleteDrop,
  downloadDropToDownloads,
  type DropItem,
  extractUrl,
  formatBytes,
  getServerUrl,
  listDrops,
  setDropPinned,
} from "./api";

function getItemTitle(item: DropItem): string {
  if (item.type === "text") {
    if (item.linkPreview?.title) return item.linkPreview.title;
    return (item.text ?? "").split("\n")[0]?.slice(0, 90) || "Empty text";
  }
  return item.name || "Untitled file";
}

function getItemSubtitle(item: DropItem): string {
  if (item.type === "text" && item.linkPreview?.title) {
    return item.text ?? "";
  }
  return item.device || "Unknown device";
}

function getItemIcon(item: DropItem): Icon {
  if (item.type === "image") return Icon.Image;
  if (item.type === "file") return Icon.Document;
  if (extractUrl(item.text)) return Icon.Link;
  return Icon.Text;
}

export default function BrowseDropsCommand() {
  const [searchText, setSearchText] = useState("");
  const {
    data: items,
    isLoading,
    error,
    revalidate,
  } = useCachedPromise(async (query: string) => listDrops(query, 60), [searchText], { keepPreviousData: true });

  const handleDownload = async (item: DropItem, copyFileAfter: boolean) => {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Downloading ${item.name || "file"}…`,
    });
    try {
      const dest = await downloadDropToDownloads(item);
      if (copyFileAfter) {
        await Clipboard.copy({ file: dest });
        toast.hide();
        await showHUD(`Saved & copied ${item.name || "file"}`);
      } else {
        toast.style = Toast.Style.Success;
        toast.title = "Downloaded to Downloads";
        toast.message = dest;
      }
    } catch (err) {
      toast.style = Toast.Style.Failure;
      toast.title = "Download failed";
      toast.message = (err as Error).message;
    }
  };

  const handleTogglePin = async (item: DropItem) => {
    try {
      await setDropPinned(item.id, !item.pinned);
      await revalidate();
      await showToast({
        style: Toast.Style.Success,
        title: item.pinned ? "Unpinned" : "Pinned to top",
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to update pin",
        message: (err as Error).message,
      });
    }
  };

  const handleDelete = async (item: DropItem) => {
    const ok = await confirmAlert({
      title: "Delete Drop Item?",
      message: getItemTitle(item),
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
    });
    if (!ok) return;
    try {
      await deleteDrop(item.id);
      await revalidate();
      await showToast({ style: Toast.Style.Success, title: "Deleted" });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Delete failed",
        message: (err as Error).message,
      });
    }
  };

  return (
    <List
      isLoading={isLoading}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search your drops by text, filename, or device…"
      throttle
    >
      {error ? (
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Could Not Connect to OwnDrop"
          description={error.message}
          actions={
            <ActionPanel>
              <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
              <Action title="Retry" icon={Icon.ArrowClockwise} onAction={revalidate} />
            </ActionPanel>
          }
        />
      ) : (
        (items ?? []).map((item) => {
          const url = item.type === "text" ? extractUrl(item.text) : null;
          const accessories: List.Item.Accessory[] = [];
          if (item.pinned) {
            accessories.push({
              icon: { source: Icon.Pin, tintColor: Color.Blue },
              tooltip: "Pinned",
            });
          }
          accessories.push({ tag: item.device || "Web" });
          accessories.push({ text: formatBytes(item.size) });
          accessories.push({ date: new Date(item.createdAt) });

          return (
            <List.Item
              key={item.id}
              icon={getItemIcon(item)}
              title={getItemTitle(item)}
              subtitle={getItemSubtitle(item)}
              accessories={accessories}
              actions={
                <ActionPanel>
                  {item.type === "text" && item.text ? (
                    <>
                      <Action.CopyToClipboard title="Copy Text" content={item.text} />
                      <Action.Paste title="Paste to Active App" content={item.text} />
                      {url && <Action.OpenInBrowser title="Open URL in Browser" url={url} />}
                    </>
                  ) : (
                    <>
                      <Action
                        title="Download & Copy File"
                        icon={Icon.Clipboard}
                        onAction={() => handleDownload(item, true)}
                      />
                      <Action
                        title="Download to Downloads"
                        icon={Icon.Download}
                        shortcut={Keyboard.Shortcut.Common.Save}
                        onAction={() => handleDownload(item, false)}
                      />
                    </>
                  )}
                  <ActionPanel.Section>
                    <Action
                      title={item.pinned ? "Unpin Item" : "Pin to Top"}
                      icon={Icon.Pin}
                      shortcut={Keyboard.Shortcut.Common.Pin}
                      onAction={() => handleTogglePin(item)}
                    />
                    <Action
                      title="Refresh"
                      icon={Icon.ArrowClockwise}
                      shortcut={Keyboard.Shortcut.Common.Refresh}
                      onAction={revalidate}
                    />
                    <Action title="Open OwnDrop in Browser" icon={Icon.Globe} onAction={() => open(getServerUrl())} />
                  </ActionPanel.Section>
                  <ActionPanel.Section>
                    <Action
                      title="Delete Item"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      shortcut={Keyboard.Shortcut.Common.Remove}
                      onAction={() => handleDelete(item)}
                    />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
