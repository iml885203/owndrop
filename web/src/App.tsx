import { useCallback, useEffect, useRef, useState } from "react";
import { CloudUpload, KeyRound, LogIn, LogOut, Moon, RefreshCw, Search, Sun } from "lucide-react";
import { api } from "./api";
import { Composer } from "./components/Composer";
import { DevicesPanel } from "./components/DevicesPanel";
import { ImageModal } from "./components/ImageModal";
import { ItemCard } from "./components/ItemCard";
import type { DropItem, MeInfo, SessionInfo } from "./types";
import { formatBytes, guessDeviceName } from "./utils";

export function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [me, setMe] = useState<MeInfo | null>(null);
  const [bootError, setBootError] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [device, setDevice] = useState<string>(() => localStorage.getItem("owndrop-device") || guessDeviceName());
  const [items, setItems] = useState<DropItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [pinningId, setPinningId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [previewItem, setPreviewItem] = useState<DropItem | null>(null);
  const [devicesOpen, setDevicesOpen] = useState(() => new URLSearchParams(window.location.search).get("tab") === "devices");
  const [toast, setToast] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("owndrop-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("owndrop-theme", theme);
  }, [theme]);

  const dragDepth = useRef(0);
  const toastTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2800);
  }, []);

  const fetchItems = useCallback(
    async (query = search, quiet = false) => {
      if (!quiet) setLoadingItems(true);
      try {
        const list = await api.listItems(query);
        setItems(list);
      } catch (err) {
        if ((err as Error).message.includes("401") || (err as Error).message.includes("Unauthorized")) {
          setSession((prev) => (prev ? { ...prev, authenticated: false } : prev));
        } else if (!quiet) {
          flash((err as Error).message);
        }
      } finally {
        if (!quiet) setLoadingItems(false);
      }
    },
    [search, flash],
  );

  const boot = useCallback(async () => {
    setBootError("");
    try {
      const s = await api.getSession();
      setSession(s);
      if (new URLSearchParams(window.location.search).get("error") === "oidc") {
        setLoginError("OIDC sign-in failed or your account is not authorized.");
      }
      if (s.authenticated) {
        const [meInfo, list] = await Promise.all([api.getMe(), api.listItems("")]);
        setMe(meInfo);
        setItems(list);
      }
    } catch (err) {
      setBootError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Debounced search
  useEffect(() => {
    if (!session?.authenticated) return;
    const timer = window.setTimeout(() => {
      void fetchItems(search);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [search, session?.authenticated, fetchItems]);

  // Auto-sync on tab focus & gentle visibility polling (Cloudflare Workers free-tier friendly)
  useEffect(() => {
    if (!session?.authenticated) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchItems(search, true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchItems(search, true);
    }, 15_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(interval);
    };
  }, [session?.authenticated, search, fetchItems]);

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      if (!files.length || busy) return;
      setBusy(true);
      let ok = 0;
      const errors: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        setUploadProgress(`Uploading ${i + 1}/${files.length}`);
        try {
          await api.uploadFile(file, device, me);
          ok += 1;
        } catch (err) {
          errors.push(`${file.name}: ${(err as Error).message}`);
        }
      }
      setBusy(false);
      setUploadProgress("");
      if (ok > 0) {
        await fetchItems(search, true);
        api.getMe().then(setMe).catch(() => {});
      }
      if (errors.length === 0) flash(`Uploaded ${ok} file${ok > 1 ? "s" : ""}`);
      else flash(errors[0]!);
    },
    [busy, device, me, fetchItems, search, flash],
  );

  // Global drag-drop and paste files
  useEffect(() => {
    if (!session?.authenticated) return;
    const hasFiles = (dt: DataTransfer | null) =>
      Boolean(dt && (dt.files.length > 0 || Array.from(dt.types).includes("Files")));

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) void handleUploadFiles(files);
    };
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((i) => i.kind === "file")
        .map((i) => i.getAsFile())
        .filter((f): f is File => Boolean(f));
      if (files.length > 0) {
        e.preventDefault();
        void handleUploadFiles(files);
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, [session?.authenticated, handleUploadFiles]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || loggingIn) return;
    setLoggingIn(true);
    setLoginError("");
    try {
      await api.login(password);
      setPassword("");
      await boot();
    } catch (err) {
      setLoginError((err as Error).message);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
      setSession((prev) => (prev ? { ...prev, authenticated: false } : prev));
      setItems([]);
      setMe(null);
    } catch (err) {
      flash((err as Error).message);
    }
  };

  const handleSendText = async (text: string) => {
    setBusy(true);
    try {
      await api.addText(text, device);
      await fetchItems(search, true);
      flash("Dropped to clipboard");
    } catch (err) {
      flash((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handlePasteAndSend = async () => {
    if (!navigator.clipboard) {
      flash("Clipboard access unavailable; paste directly into the box.");
      return;
    }
    try {
      if (typeof navigator.clipboard.read === "function") {
        const entries = await navigator.clipboard.read();
        for (const entry of entries) {
          const imgType = entry.types.find((t) => t.startsWith("image/"));
          if (imgType) {
            const blob = await entry.getType(imgType);
            const ext = imgType.split("/")[1]?.replace("jpeg", "jpg") || "png";
            await handleUploadFiles([new File([blob], `clipboard-${Date.now()}.${ext}`, { type: imgType })]);
            return;
          }
        }
      }
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        flash("Clipboard is empty");
        return;
      }
      await handleSendText(text);
    } catch {
      flash("Clipboard permission denied; paste into the box instead.");
    }
  };

  const handleCopyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      flash("Copied to clipboard");
    } catch {
      flash("Clipboard write blocked by browser");
    }
  };

  const handleCopyImage = async (item: DropItem) => {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      flash("Browser cannot copy images directly; use Download.");
      return;
    }
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(item.id)}`, { credentials: "same-origin" });
      const blob = await res.blob();
      let pngBlob = blob;
      if (blob.type !== "image/png") {
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
        bitmap.close();
        pngBlob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG conversion failed"))), "image/png"),
        );
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
      flash("Image copied");
    } catch {
      flash("Could not copy image; try Download.");
    }
  };

  const handlePinToggle = async (item: DropItem) => {
    setPinningId(item.id);
    try {
      await api.setPinned(item.id, !item.pinned);
      await fetchItems(search, true);
      flash(item.pinned ? "Unpinned" : "Pinned to top");
    } catch (err) {
      flash((err as Error).message);
    } finally {
      setPinningId("");
    }
  };

  const handleDelete = async (item: DropItem) => {
    if (!window.confirm(`Delete "${item.name || item.text?.slice(0, 60) || "this item"}"?`)) return;
    try {
      await api.deleteItem(item.id);
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      api.getMe().then(setMe).catch(() => {});
      flash("Deleted");
    } catch (err) {
      flash((err as Error).message);
    }
  };

  const handleDeviceChange = (name: string) => {
    setDevice(name);
    localStorage.setItem("owndrop-device", name);
  };

  return (
    <div className="min-h-screen">
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-[var(--bg)]/90 p-6 backdrop-blur-sm">
          <div className="flex w-full max-w-lg flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--surface)] p-12 text-center shadow-2xl">
            <CloudUpload className="size-12 text-[var(--accent)]" />
            <strong className="text-xl">Drop files to upload</strong>
            <span className="text-sm text-[var(--muted)]">Release to add directly to your OwnDrop inbox</span>
          </div>
        </div>
      )}

      {/* Topbar */}
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="inline-flex items-center gap-2.5 text-base font-bold text-[var(--ink)] no-underline">
            <img src="/icon.svg" alt="" className="size-7 rounded-lg" />
            <span>OwnDrop</span>
          </a>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="btn btn-ghost !px-2.5"
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            {session?.authenticated && (
              <>
                <button type="button" className="btn btn-outline" onClick={() => setDevicesOpen(true)}>
                  <KeyRound className="size-4 text-[var(--accent)]" />
                  <span>Devices</span>
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => void handleLogout()}>
                  <LogOut className="size-4" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {bootError ? (
          <div className="mx-auto mt-16 max-w-md text-center">
            <h1 className="text-xl font-semibold">Cannot reach OwnDrop</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">{bootError}</p>
            <button type="button" className="btn btn-outline mt-4" onClick={() => void boot()}>
              <RefreshCw className="size-4" />
              <span>Retry</span>
            </button>
          </div>
        ) : !session ? (
          <div className="mx-auto mt-20 max-w-sm text-center text-sm text-[var(--muted)]">Loading OwnDrop…</div>
        ) : session.setupRequired ? (
          <section className="card mx-auto mt-12 max-w-lg p-7">
            <h1 className="m-0 text-2xl font-bold tracking-tight">Finish your OwnDrop setup</h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Your Cloudflare Worker is live! Add these two secrets in{" "}
              <strong>Cloudflare Dashboard → Workers &amp; Pages → owndrop → Settings → Variables and Secrets</strong>, then reload this page:
            </p>
            <ul className="mt-4 space-y-2 rounded-xl bg-[var(--subtle)] p-4 text-xs leading-relaxed">
              <li>
                <code>OWNDROP_PASSWORD</code> — Your login password (or configure <code>OWNDROP_OIDC_*</code>)
              </li>
              <li>
                <code>OWNDROP_SESSION_SECRET</code> — Any random string of at least 32 characters (e.g.{" "}
                <code>openssl rand -base64 48</code>)
              </li>
            </ul>
            {session.setupMessage && (
              <p className="mt-3 text-xs text-[var(--muted)]">Details: {session.setupMessage}</p>
            )}
            <button type="button" className="btn btn-primary mt-5 w-full" onClick={() => void boot()}>
              <RefreshCw className="size-4" />
              <span>I&apos;ve added the secrets — Check again</span>
            </button>
          </section>
        ) : !session.authenticated ? (
          <section className="card mx-auto mt-12 max-w-md p-7">
            <h1 className="m-0 text-2xl font-bold tracking-tight">Your private cross-device drop</h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Sign in to access your synced clipboard, files, and connected devices.
            </p>

            {session.oidcEnabled && (
              <div className="mt-6">
                <a href="/auth/oidc" className="btn btn-primary w-full">
                  <LogIn className="size-4" />
                  <span>Sign in with SSO (OIDC)</span>
                </a>
              </div>
            )}

            {session.passwordEnabled && (
              <form onSubmit={(e) => void handleLogin(e)} className="mt-5 space-y-3">
                {session.oidcEnabled && (
                  <div className="relative py-1 text-center text-xs text-[var(--muted)]">or sign in with password</div>
                )}
                <input
                  type="password"
                  className="field"
                  placeholder="Enter password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="submit"
                  className={`btn w-full ${session.oidcEnabled ? "btn-outline" : "btn-primary"}`}
                  disabled={loggingIn || !password}
                >
                  <LogIn className="size-4" />
                  <span>{loggingIn ? "Signing in…" : "Sign in"}</span>
                </button>
              </form>
            )}

            {loginError && <p className="mt-3 text-sm text-[var(--danger)]">{loginError}</p>}
          </section>
        ) : (
          <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-[340px_minmax(0,1fr)] lg:gap-12">
            <Composer
              device={device}
              onDeviceChange={handleDeviceChange}
              busy={busy}
              uploadProgress={uploadProgress}
              maxFileMb={me?.maxFileMb ?? 90}
              maxPresignedFileMb={me?.maxPresignedFileMb ?? 512}
              directUploadEnabled={Boolean(me?.directUploadEnabled)}
              onSendText={handleSendText}
              onUploadFiles={handleUploadFiles}
              onPasteAndSend={handlePasteAndSend}
            />

            <section className="min-w-0">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="m-0 text-xl font-semibold tracking-tight">Recent Drops</h2>
                  <span className="rounded-full bg-[var(--subtle)] px-2 py-0.5 text-xs font-medium text-[var(--muted)]">
                    {items.length}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost !min-h-8 !px-2"
                    disabled={loadingItems}
                    onClick={() => void fetchItems(search)}
                    title="Refresh"
                    aria-label="Refresh"
                  >
                    <RefreshCw className={`size-4 ${loadingItems ? "animate-spin" : ""}`} />
                  </button>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    type="search"
                    className="field !h-10 !pl-9 text-sm"
                    placeholder="Search text, file, device…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              {me && (
                <p className="mb-3 text-xs text-[var(--muted)]">
                  Storage used: {formatBytes(me.stats.fileBytes)} / {me.maxStorageMb} MB · Retention {me.retentionDays}d
                </p>
              )}

              {items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--border)] px-6 py-16 text-center">
                  <p className="m-0 font-semibold">{search ? "No matching drops" : "Nothing dropped yet"}</p>
                  <p className="mt-1.5 text-xs text-[var(--muted)]">
                    {search
                      ? "Try a different search keyword."
                      : "Paste text or upload a file to get started."}
                  </p>
                </div>
              ) : (
                <ol className="m-0 list-none p-0">
                  {items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      pinning={pinningId === item.id}
                      onPinToggle={(it) => void handlePinToggle(it)}
                      onCopyText={(val) => void handleCopyText(val)}
                      onCopyImage={(it) => void handleCopyImage(it)}
                      onPreviewImage={setPreviewItem}
                      onDelete={(it) => void handleDelete(it)}
                    />
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </main>

      <ImageModal
        item={previewItem}
        onClose={() => setPreviewItem(null)}
        onCopyImage={(it) => void handleCopyImage(it)}
        onFlash={flash}
      />

      <DevicesPanel open={devicesOpen} onClose={() => setDevicesOpen(false)} onFlash={flash} />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 bottom-5 z-50 rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-[var(--bg)] shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
