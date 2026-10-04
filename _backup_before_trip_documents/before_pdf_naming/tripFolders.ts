/**
 * tripFolders.ts — saves a client trip folder to
 *   1) the PC of whoever is using the dashboard (browser File System Access API,
 *      with a .zip download as fallback), and
 *   2) Google Drive (Google sign-in popup in the browser, no backend needed).
 */
import { numberedName, sanitizeName } from "./tripCategorize";
import { buildZip, ZipEntry } from "./zipWriter";

export interface SaveItem {
  file: File;
  subfolder: string; // "" = client folder itself
}

export type ItemResult = "saved" | "skipped" | string; // string = renamed-to / error message

// ═══════════════════════════════════════════════════════════════════════════
//  THIS COMPUTER
// ═══════════════════════════════════════════════════════════════════════════

/** True when this browser can create folders directly on the user's PC. */
export function canSaveDirect(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window && window.isSecureContext;
}

const IDB_NAME = "ch-trip-folders";
const IDB_STORE = "handles";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await idb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

/** The base folder this user chose earlier (e.g. D:\Clients), if any. */
export async function getSavedBaseDir(): Promise<any | null> {
  return idbGet<any>("baseDir");
}

/** Ask the user to choose the base folder where client folders are created. */
export async function pickBaseDir(): Promise<any> {
  const handle = await (window as any).showDirectoryPicker({ id: "ch-trip-folders", mode: "readwrite" });
  await idbSet("baseDir", handle);
  return handle;
}

export async function ensureWritePermission(handle: any): Promise<boolean> {
  const opts = { mode: "readwrite" };
  if ((await handle.queryPermission?.(opts)) === "granted") return true;
  return (await handle.requestPermission?.(opts)) === "granted";
}

async function existingFileSize(dir: any, name: string): Promise<number | null> {
  try {
    const fh = await dir.getFileHandle(name);
    return (await fh.getFile()).size;
  } catch {
    return null;
  }
}

/** Writes one file into <base>/<clientFolder>/<subfolder>/. Never overwrites. */
export async function saveFileToPC(base: any, clientFolder: string, item: SaveItem): Promise<ItemResult> {
  let dir = await base.getDirectoryHandle(clientFolder, { create: true });
  if (item.subfolder) dir = await dir.getDirectoryHandle(item.subfolder, { create: true });

  const original = sanitizeName(item.file.name) || "file";
  let name = original;
  for (let n = 2; ; n++) {
    const size = await existingFileSize(dir, name);
    if (size === null) break;                       // free name
    if (size === item.file.size) return "skipped";  // same file already there
    name = numberedName(original, n);
  }

  const fh = await dir.getFileHandle(name, { create: true });
  const writable = await fh.createWritable();
  await writable.write(item.file);
  await writable.close();
  return name === original ? "saved" : name;
}

/** Fallback: download the whole client folder as one .zip. */
export async function downloadAsZip(clientFolder: string, items: SaveItem[]): Promise<void> {
  const entries: ZipEntry[] = items.map(i => ({
    path: [clientFolder, i.subfolder, sanitizeName(i.file.name)].filter(Boolean).join("/"),
    file: i.file,
  }));
  const blob = await buildZip(entries);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${clientFolder}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ═══════════════════════════════════════════════════════════════════════════
//  GOOGLE DRIVE
// ═══════════════════════════════════════════════════════════════════════════

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || "";
export const DEFAULT_DRIVE_PARENT = (import.meta.env.VITE_GOOGLE_DRIVE_PARENT_FOLDER as string | undefined) || "";
export const DEFAULT_DRIVE_ROOT_NAME = "CustomHolidays Client Folders";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SCOPE_APP_FILES = "https://www.googleapis.com/auth/drive.file";
const SCOPE_FULL = "https://www.googleapis.com/auth/drive";

export const isDriveConfigured = () => !!GOOGLE_CLIENT_ID;

/** Accepts a full Drive folder link or a bare folder ID. */
export function parseDriveFolderId(input: string): string | null {
  const s = (input || "").trim();
  if (!s) return null;
  const m = s.match(/folders\/([a-zA-Z0-9_-]{10,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{10,}$/.test(s) ? s : null;
}

let gisPromise: Promise<void> | null = null;
/** Loads Google's sign-in script. Call early (on page load) so the popup isn't blocked. */
export function loadGoogleSignIn(): Promise<void> {
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisPromise = null; reject(new Error("Could not load Google sign-in. Check your internet connection.")); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

let tokenCache: { token: string; exp: number; scope: string } | null = null;

export function hasDriveToken(fullAccess: boolean): boolean {
  const scope = fullAccess ? SCOPE_FULL : SCOPE_APP_FILES;
  return !!tokenCache && tokenCache.scope === scope && tokenCache.exp > Date.now() + 60_000;
}

/** Opens the Google sign-in popup (only when needed) and returns an access token. */
export async function getDriveToken(fullAccess: boolean): Promise<string> {
  if (!GOOGLE_CLIENT_ID) throw new Error("Google Drive isn't set up yet (VITE_GOOGLE_CLIENT_ID is missing).");
  const scope = fullAccess ? SCOPE_FULL : SCOPE_APP_FILES;
  if (hasDriveToken(fullAccess)) return tokenCache!.token;
  await loadGoogleSignIn();
  const google = (window as any).google;
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope,
      callback: (resp: any) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        tokenCache = { token: resp.access_token, exp: Date.now() + (Number(resp.expires_in) || 3600) * 1000, scope };
        resolve(resp.access_token);
      },
      error_callback: (err: any) =>
        reject(new Error(err?.type === "popup_closed" ? "Google sign-in window was closed." :
                         err?.type === "popup_failed_to_open" ? "Google sign-in popup was blocked — allow popups for this site." :
                         err?.message || "Google sign-in failed.")),
    });
    client.requestAccessToken();
  });
}

async function driveFetch(token: string, url: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (!res.ok) {
    let msg = `Google Drive error ${res.status}`;
    try { msg = (await res.json())?.error?.message || msg; } catch { /* ignore */ }
    if (res.status === 401) tokenCache = null;
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const ALL_DRIVES = "supportsAllDrives=true&includeItemsFromAllDrives=true";

async function findOrCreateFolder(token: string, name: string, parentId: string): Promise<string> {
  const query = `name='${q(name)}' and '${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`;
  const found = await driveFetch(token, `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id)&${ALL_DRIVES}`);
  if (found.files?.length) return found.files[0].id;
  const created = await driveFetch(token, `${DRIVE_API}/files?fields=id&supportsAllDrives=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  return created.id;
}

async function listFileSizes(token: string, folderId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  let pageToken = "";
  do {
    const query = `'${folderId}' in parents and trashed=false and mimeType!='${FOLDER_MIME}'`;
    const r = await driveFetch(token,
      `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(name,size)&pageSize=1000&${ALL_DRIVES}` +
      (pageToken ? `&pageToken=${pageToken}` : ""));
    for (const f of r.files || []) map.set(f.name, Number(f.size ?? -1));
    pageToken = r.nextPageToken || "";
  } while (pageToken);
  return map;
}

async function uploadFile(token: string, file: File, name: string, parentId: string): Promise<void> {
  const meta = { name, parents: [parentId] };
  const type = file.type || "application/octet-stream";

  if (file.size <= 5 * 1024 * 1024) {
    const boundary = "ch" + Math.random().toString(36).slice(2);
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: ${type}\r\n\r\n`, file, `\r\n--${boundary}--`,
    ]);
    await driveFetch(token, `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id&supportsAllDrives=true`, {
      method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
    });
    return;
  }

  // Large file → resumable upload
  const start = await fetch(`${DRIVE_UPLOAD}/files?uploadType=resumable&supportsAllDrives=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": type },
    body: JSON.stringify(meta),
  });
  const location = start.headers.get("Location");
  if (!start.ok || !location) throw new Error(`Google Drive upload could not start (${start.status})`);
  const put = await fetch(location, { method: "PUT", headers: { "Content-Type": type }, body: file });
  if (!put.ok) throw new Error(`Google Drive upload failed (${put.status})`);
}

export interface DriveTarget {
  token: string;
  clientFolderId: string;
  subfolderIds: Map<string, string>;
  existing: Map<string, Map<string, number>>; // folderId → (fileName → size)
  link: string;
}

/** Finds/creates the client folder (and its sub-folders) on Drive. */
export async function prepareDriveFolder(
  token: string, clientFolder: string, subfolders: string[], parentLink: string, rootName: string,
): Promise<DriveTarget> {
  const parentId = parseDriveFolderId(parentLink) || await findOrCreateFolder(token, rootName || DEFAULT_DRIVE_ROOT_NAME, "root");
  const clientFolderId = await findOrCreateFolder(token, clientFolder, parentId);
  const subfolderIds = new Map<string, string>([["", clientFolderId]]);
  for (const sub of subfolders) if (sub) subfolderIds.set(sub, await findOrCreateFolder(token, sub, clientFolderId));
  const existing = new Map<string, Map<string, number>>();
  for (const id of new Set(subfolderIds.values())) existing.set(id, await listFileSizes(token, id));
  return { token, clientFolderId, subfolderIds, existing, link: `https://drive.google.com/drive/folders/${clientFolderId}` };
}

/** Uploads one file into the prepared Drive folder. Never overwrites. */
export async function saveFileToDrive(target: DriveTarget, item: SaveItem): Promise<ItemResult> {
  const folderId = target.subfolderIds.get(item.subfolder)!;
  const existing = target.existing.get(folderId)!;
  const original = sanitizeName(item.file.name) || "file";
  let name = original;
  for (let n = 2; existing.has(name); n++) {
    if (existing.get(name) === item.file.size) return "skipped";
    name = numberedName(original, n);
  }
  await uploadFile(target.token, item.file, name, folderId);
  existing.set(name, item.file.size);
  return name === original ? "saved" : name;
}
