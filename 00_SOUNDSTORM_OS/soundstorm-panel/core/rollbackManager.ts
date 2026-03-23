/**
 * SOUNDSTORM OS — Rollback Manager
 *
 * Maintains a memory snapshot and a temp file backup of state.json.
 * restore() writes both back to guarantee consistency even after a crash.
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STATE_PATH  = join(__dirname, "../logs/state.json");
const BACKUP_PATH = join(__dirname, "../logs/state.backup.json");

// ── In-memory snapshot ─────────────────────────────────────────────────────────

let memoryBackup: object | null = null;

/**
 * Deep-clones state into memory and writes a temp backup file.
 * Must be called BEFORE any mutation.
 */
export function backupState(state: object): void {
  memoryBackup = JSON.parse(JSON.stringify(state));
  writeFileSync(BACKUP_PATH, JSON.stringify(memoryBackup, null, 2), "utf-8");
}

/**
 * Restores state.json from the memory snapshot.
 * Also overwrites the backup file so both files are consistent post-restore.
 * Clears the in-memory snapshot after use.
 *
 * @throws Error if backupState() was never called
 */
export function restore(): void {
  if (memoryBackup === null) {
    throw new Error("No backup available to restore — call backupState() first");
  }

  const snapshot = JSON.parse(JSON.stringify(memoryBackup));
  memoryBackup = null;

  // 1. Restore the live state file
  writeFileSync(STATE_PATH, JSON.stringify(snapshot, null, 2), "utf-8");

  // 2. Keep backup file consistent with the restored state
  writeFileSync(BACKUP_PATH, JSON.stringify(snapshot, null, 2), "utf-8");
}
