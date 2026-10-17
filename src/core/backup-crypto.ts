import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const MAGIC = Buffer.from("BBBK1");

export async function encryptBackup(plaintext: string, password: string): Promise<Buffer> {
  if (password.trim().length < 8) {
    throw new Error("Use a backup password of at least 8 characters.");
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = (await scrypt(password, salt, 32)) as Buffer;
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, salt, iv, tag, ciphertext]);
}

export async function decryptBackup(file: Buffer, password: string): Promise<string> {
  if (file.length < 5 + 16 + 12 + 16 || !file.subarray(0, 5).equals(MAGIC)) {
    throw new Error("That file is not a BillBoard backup.");
  }
  const salt = file.subarray(5, 21);
  const iv = file.subarray(21, 33);
  const tag = file.subarray(33, 49);
  const ciphertext = file.subarray(49);
  const key = (await scrypt(password, salt, 32)) as Buffer;
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Could not open that backup. Check the password.");
  }
}
