import { hash, verify } from '@node-rs/argon2';

// argon2id with OWASP-recommended baseline parameters.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, OPTIONS);

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * Valid hash of a random string. Verifying against it on unknown usernames keeps login timing
 * the same whether or not the user exists.
 */
export const DUMMY_HASH = await hashPassword(crypto.randomUUID());
