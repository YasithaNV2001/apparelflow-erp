import "server-only";
import { compare, hash } from "bcryptjs";

// Cost 10: tens of milliseconds per hash, which is slow for an attacker guessing
// millions of passwords but unnoticeable for one login (PLAN D4, task 2.1).
const BCRYPT_COST = 10;

export function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}
