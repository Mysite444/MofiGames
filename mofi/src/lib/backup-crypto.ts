import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Whether BACKUP_ENCRYPTION_KEY is set — the backup executor checks
 * this to decide whether to encrypt, and the restore route checks it to
 * know whether an incoming file needs decrypting first. */
export function backupEncryptionEnabled(): boolean {
  return Boolean(process.env.BACKUP_ENCRYPTION_KEY);
}

/** Any-length passphrase from the env var, folded to a 32-byte AES-256
 * key via sha256 — so the admin can set BACKUP_ENCRYPTION_KEY to any
 * string rather than having to generate/paste an exact-length key. */
function derivedKey(): Buffer {
  const secret = process.env.BACKUP_ENCRYPTION_KEY;
  if (!secret) throw new Error("BACKUP_ENCRYPTION_KEY isn't set.");
  return createHash("sha256").update(secret).digest();
}

/** AES-256-GCM. Output layout: iv (12 bytes) + authTag (16 bytes) +
 * ciphertext, all in one buffer — everything decrypt() needs, nothing
 * external to track alongside the file. */
export function encryptBackup(plaintext: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptBackup(encrypted: Buffer): string {
  const iv = encrypted.subarray(0, 12);
  const authTag = encrypted.subarray(12, 28);
  const ciphertext = encrypted.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", derivedKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
