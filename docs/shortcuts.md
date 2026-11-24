# iPhone & iPad Setup (Apple Shortcuts)

Because iOS Safari PWAs do not support the Web Share Target API, **Apple Shortcuts** is the cleanest way to send and receive OwnDrop items on iOS **without ever opening a browser**.

## Prerequisites

1. Open your OwnDrop web UI → **Devices** → create a token named `iPhone`.
2. Copy your Server URL (e.g., `https://drop.example.com`) and the `owd_...` token.

---

## Shortcut 1: "Send to OwnDrop" (iOS Share Sheet)

Send photos, screenshots, PDFs, URLs, or selected text from **any** iOS app in two taps.

1. Open the **Shortcuts** app → tap **+** to create a new shortcut named **Send to OwnDrop**.
2. Tap the **ⓘ (Details)** icon → enable **Show in Share Sheet** → accept **Any** (Images, Media, Files, URLs, Text).
3. Add the following actions:
   - **Text** action #1: `https://drop.example.com` *(your Server URL)*
   - **Text** action #2: `owd_your_iphone_token` *(your iPhone Device Token)*
   - **If** `Shortcut Input` **has any value**:
     - **If** `Type of Shortcut Input` is `Text` or `URL`:
       - **Get Contents of URL**:
         - URL: `[Text #1]/api/items/text`
         - Method: `POST`
         - Headers:
           - `Authorization`: `Bearer [Text #2]`
           - `Content-Type`: `application/json`
         - Request Body: `JSON` → key `text` = `Shortcut Input`
     - **Otherwise** *(Photos, Screenshots, Files)*:
       - **Repeat with Each** item in `Shortcut Input`:
         - **Get Contents of URL**:
           - URL: `[Text #1]/api/items/file`
           - Method: `POST`
           - Headers:
             - `Authorization`: `Bearer [Text #2]`
           - Request Body: `Form` → key `file` (Type: **File**) = `Repeat Item`
   - **Show Notification**: `Dropped to OwnDrop ✓`

### Pro Tip: Instant Screenshot / Clipboard Drop
Create a second 3-action shortcut called **Drop Clipboard** that reads **Get Clipboard** instead of `Shortcut Input`, then bind it to **Control Center** or **Back Tap**!

---

## Shortcut 2: "Get Latest OwnDrop" (Action Button / Control Center)

Grab the latest text, link, or photo you just dropped from your Mac or Windows PC in **one tap**.

1. Create a new shortcut named **Get Latest OwnDrop**.
2. Add actions:
   - **Text** action #1: `https://drop.example.com`
   - **Text** action #2: `owd_your_iphone_token`
   - **Get Contents of URL**:
     - URL: `[Text #1]/api/items/latest`
     - Method: `GET`
     - Headers: `Authorization`: `Bearer [Text #2]`
   - **Get Dictionary Value** for key `type` in `Contents of URL` → save as `ItemType`
   - **If** `ItemType` is `text`:
     - **Get Dictionary Value** for key `text` in `Contents of URL`
     - **Copy to Clipboard**
     - **Show Notification**: `Copied latest OwnDrop`
   - **Otherwise** *(image or file)*:
     - **Get Dictionary Value** for key `id` in `Contents of URL` → `ItemId`
     - **Get Contents of URL**: `[Text #1]/api/files/[ItemId]` (with the same `Authorization` header)
     - **Quick Look** *(lets you immediately tap Share → Save Image or Save to Files)*

Bind **Get Latest OwnDrop** to your **iPhone Action Button**, **Control Center**, or **Lock Screen Widget**.
