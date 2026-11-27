import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  close: vi.fn(),
  app: vi.fn(),
  finder: vi.fn(),
  text: vi.fn(),
  copy: vi.fn(),
  hud: vi.fn(),
  explorer: vi.fn(),
  files: vi.fn(),
  dropFile: vi.fn(),
  dropText: vi.fn(),
}));

vi.mock("@raycast/api", () => ({
  closeMainWindow: m.close,
  Clipboard: { copy: m.copy },
  getFrontmostApplication: m.app,
  getSelectedFinderItems: m.finder,
  getSelectedText: m.text,
  showHUD: m.hud,
}));

vi.mock("../src/api", () => ({ dropFileFromPath: m.dropFile, dropText: m.dropText }));

vi.mock("../src/selection-clipboard", () => ({ copySelectedExplorerFiles: m.explorer, copySelectedFiles: m.files }));

import command from "../src/copy-and-share";

beforeEach(() => {
  vi.resetAllMocks();

  vi.spyOn(process, "platform", "get").mockReturnValue("darwin");

  m.app.mockResolvedValue({ bundleId: "com.apple.TextEdit" });

  m.text.mockResolvedValue("selected text");
});

afterEach(() => vi.restoreAllMocks());

it("copies exact text before uploading", async () => {
  m.text.mockResolvedValue(" https://example.com/\n");

  await command();

  expect(m.copy).toHaveBeenCalledWith(" https://example.com/\n");

  expect(m.dropText).toHaveBeenCalledWith(" https://example.com/\n");

  expect(m.copy.mock.invocationCallOrder[0]).toBeLessThan(m.dropText.mock.invocationCallOrder[0]);

  expect(m.finder).not.toHaveBeenCalled();
});

it.each(["", " \n"])("rejects blank selections", async (text) => {
  m.text.mockResolvedValue(text);

  await command();

  expect(m.copy).not.toHaveBeenCalled();

  expect(m.dropText).not.toHaveBeenCalled();
});

it("does not fall back after selection access fails", async () => {
  m.text.mockRejectedValue(new Error("denied"));

  await command();

  expect(m.finder).not.toHaveBeenCalled();

  expect(m.dropText).not.toHaveBeenCalled();

  expect(m.dropFile).not.toHaveBeenCalled();
});

it("preserves the local copy when upload fails", async () => {
  m.dropText.mockRejectedValue(new Error("offline"));

  await command();

  expect(m.copy).toHaveBeenCalledTimes(1);

  expect(m.hud).toHaveBeenCalledWith("Copied locally · Share failed");
});

it("does not upload after a failed copy", async () => {
  m.copy.mockRejectedValue(new Error("busy"));

  await command();

  expect(m.dropText).not.toHaveBeenCalled();
});

it("copies all files first and reports partial upload failures", async () => {
  m.app.mockResolvedValue({ bundleId: "com.apple.finder" });

  m.finder.mockResolvedValue([{ path: "/a" }, { path: "/b" }, { path: "/c" }]);

  m.dropFile.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({});

  await command();

  expect(m.files).toHaveBeenCalledWith(["/a", "/b", "/c"]);

  expect(m.files.mock.invocationCallOrder[0]).toBeLessThan(m.dropFile.mock.invocationCallOrder[0]);

  expect(m.dropFile.mock.calls).toEqual([["/a"], ["/b"], ["/c"]]);

  expect(m.hud).toHaveBeenCalledWith("Copied 3 files · Shared 2 · Failed 1");

  expect(m.text).not.toHaveBeenCalled();
});

it.each([false, true])("does not fall back from an empty or inaccessible Finder selection", async (fail) => {
  m.app.mockResolvedValue({ bundleId: "com.apple.finder" });

  if (fail) m.finder.mockRejectedValue(new Error("denied"));
  else m.finder.mockResolvedValue([]);

  await command();

  expect(m.text).not.toHaveBeenCalled();

  expect(m.files).not.toHaveBeenCalled();

  expect(m.dropFile).not.toHaveBeenCalled();
});

it("shares the current Explorer selection on Windows", async () => {
  vi.spyOn(process, "platform", "get").mockReturnValue("win32");

  m.app.mockResolvedValue({ path: "C:\\Windows\\explorer.exe" });

  m.explorer.mockResolvedValue(["C:\\a.txt", "C:\\b.txt"]);

  await command();

  expect(m.files).not.toHaveBeenCalled();

  expect(m.dropFile).toHaveBeenCalledTimes(2);

  expect(m.text).not.toHaveBeenCalled();
});

it("supports selected text on Windows", async () => {
  vi.spyOn(process, "platform", "get").mockReturnValue("win32");

  m.app.mockResolvedValue({ path: "C:\\Windows\\notepad.exe" });

  await command();

  expect(m.copy).toHaveBeenCalledWith("selected text");

  expect(m.dropText).toHaveBeenCalledWith("selected text");

  expect(m.explorer).not.toHaveBeenCalled();
});

it("acknowledges immediately while selection is still pending", async () => {
  let resolveSelection!: (text: string) => void;
  m.text.mockReturnValue(
    new Promise<string>((resolve) => {
      resolveSelection = resolve;
    }),
  );
  const running = command();
  await vi.waitFor(() => expect(m.text).toHaveBeenCalled());
  expect(m.hud).toHaveBeenCalledWith("Copy & Share: Copying selection...");
  expect(m.hud.mock.invocationCallOrder[0]).toBeLessThan(m.text.mock.invocationCallOrder[0]);
  expect(m.dropText).not.toHaveBeenCalled();
  resolveSelection("selected text");
  await running;
});
it("shows sharing feedback while upload is still pending", async () => {
  let finishUpload!: () => void;
  m.dropText.mockReturnValue(
    new Promise<void>((resolve) => {
      finishUpload = resolve;
    }),
  );
  const running = command();
  await vi.waitFor(() => expect(m.dropText).toHaveBeenCalled());
  expect(m.hud).toHaveBeenLastCalledWith("Copied locally · Sharing...");
  finishUpload();
  await running;
  expect(m.hud).toHaveBeenLastCalledWith("Copied and shared");
});

it("acknowledges before waiting for Explorer selection and copy", async () => {
  vi.spyOn(process, "platform", "get").mockReturnValue("win32");
  m.app.mockResolvedValue({ path: "C:\\Windows\\explorer.exe" });
  let finishSelection!: (paths: string[]) => void;
  m.explorer.mockReturnValue(
    new Promise<string[]>((resolve) => {
      finishSelection = resolve;
    }),
  );
  const running = command();
  await vi.waitFor(() => expect(m.explorer).toHaveBeenCalled());
  expect(m.close).toHaveBeenCalledTimes(1);
  expect(m.close.mock.invocationCallOrder[0]).toBeLessThan(m.explorer.mock.invocationCallOrder[0]);
  expect(m.hud).toHaveBeenCalledWith("Copy & Share: Copying selection...");
  expect(m.hud.mock.invocationCallOrder[0]).toBeLessThan(m.explorer.mock.invocationCallOrder[0]);
  finishSelection(["C:\\a.txt"]);
  await running;
  expect(m.files).not.toHaveBeenCalled();
  expect(m.dropFile).toHaveBeenCalledWith("C:\\a.txt");
});
it("distinguishes Explorer focus failure from empty selection", async () => {
  vi.spyOn(process, "platform", "get").mockReturnValue("win32");
  m.app.mockResolvedValue({ path: "C:\\Windows\\explorer.exe" });
  m.explorer.mockRejectedValue(new Error("not foreground"));
  await command();
  expect(m.hud).toHaveBeenLastCalledWith(
    "Could not read File Explorer selection. Keep Explorer active and retry the hotkey.",
  );
  expect(m.files).not.toHaveBeenCalled();
  expect(m.dropFile).not.toHaveBeenCalled();
  expect(m.text).not.toHaveBeenCalled();
});
