import bcrypt from "bcryptjs";
import { verifyPassword as verifyLegacy } from "better-auth/crypto";

export const hashPassword = (password: string) => bcrypt.hash(password, 12)

export async function verifyPassword({hash, password}: {hash: string, password: string}) {
    if (/^\$2[aby]\$/.test(hash)) return bcrypt.compare(password, hash)
  return verifyLegacy({ hash, password })
}