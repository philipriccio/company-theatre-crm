import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import commonPasswords from '../../../security/common-passwords.json'
const blocked = new Set([...commonPasswords.map(value => value.normalize('NFC').toLowerCase()), 'passwordpassword', 'passwordpassword123', '123456789012345', '1234567890123456', 'qwertyuiopasdfgh', 'companytheatre123', 'thecompanytheatre', 'letmeinletmeinletmein'])
export function passwordError(value: unknown): string | null {
  if (typeof value !== 'string' || [...value.normalize('NFC')].length < 15) return 'Use at least 15 characters. A few unrelated words work well.'
  if ([...value.normalize('NFC')].length > 128 || Buffer.byteLength(value) > 1024) return 'Use no more than 128 characters.'
  if (blocked.has(value.normalize('NFC').toLowerCase()) || /^(.)\1+$/u.test(value)) return 'Choose a less common password.'
  return null
}
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCallback(password.normalize('NFC'), salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)))
}
export async function hashPassword(password: string): Promise<string> {
  const issue = passwordError(password)
  if (issue) throw new Error(issue)
  const salt = randomBytes(24).toString('hex')
  return `scrypt-v1$${salt}$${(await derive(password, salt)).toString('hex')}`
}
export async function verifyPassword(password: unknown, encoded: string): Promise<boolean> {
  if (typeof password !== 'string' || Buffer.byteLength(password) > 1024) return false
  const parts = encoded.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt-v1' || !/^[a-f0-9]{48}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2])) return false
  return timingSafeEqual(await derive(password, parts[1]), Buffer.from(parts[2], 'hex'))
}
