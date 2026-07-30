import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";

export type AuthRole = "admin" | "resident";

interface ScryptParameters {
  N: number;
  r: number;
  p: number;
  keyLength: number;
}

interface StoredUser {
  username: string;
  role: AuthRole;
  secretKind: "password" | "pin";
  salt: string;
  hash: string;
  scrypt: ScryptParameters;
}

interface StoredSession {
  tokenHash: string;
  csrfToken: string;
  username: string;
  role: AuthRole;
  expiresAt: string;
}

interface StoredAuthState {
  version: 1;
  users: StoredUser[];
  sessions: StoredSession[];
}

export interface AuthSession {
  username: string;
  role: AuthRole;
  csrfToken: string;
  expiresAt: string;
}

export interface CreatedAuthSession extends AuthSession {
  token: string;
}

export interface AuthStoreOptions {
  now?: () => Date;
  sessionLifetimeMs?: number;
  scrypt?: Partial<ScryptParameters>;
}

const defaultScrypt: ScryptParameters = {
  N: 2 ** 15,
  r: 8,
  p: 3,
  keyLength: 32
};

const emptyState = (): StoredAuthState => ({ version: 1, users: [], sessions: [] });
const tokenHash = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("base64url");
const deriveSecret = (
  secret: string,
  salt: Buffer,
  parameters: ScryptParameters
): Promise<Buffer> => new Promise((resolvePromise, rejectPromise) => {
  scryptCallback(secret, salt, parameters.keyLength, {
    N: parameters.N,
    r: parameters.r,
    p: parameters.p,
    maxmem: Math.max(64 * 1024 * 1024, 256 * parameters.N * parameters.r)
  }, (error, derived) => {
    if (error) rejectPromise(error);
    else resolvePromise(derived);
  });
});

const normalizeUsername = (value: string): string => value.trim().toLowerCase();

const validateUsername = (value: string): string => {
  const username = normalizeUsername(value);
  if (!/^[a-z][a-z0-9_-]{2,31}$/.test(username)) {
    throw new Error("Kullanıcı adı 3–32 karakter olmalı ve harfle başlamalı.");
  }
  if (username === "home") throw new Error("Bu kullanıcı adı ev kullanıcısı için ayrılmıştır.");
  return username;
};

const commonPins = new Set([
  "000000", "111111", "123123", "123456", "654321", "121212", "112233"
]);

export const validateAdminPassword = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new Error("Yönetici parolası 8–128 karakter olmalıdır.");
  }
  const normalized = value.normalize("NFC");
  if (normalized.length < 8 || normalized.length > 128) {
    throw new Error("Yönetici parolası 8–128 karakter olmalıdır.");
  }
  return normalized;
};

export const validateResidentPin = (value: unknown): string => {
  if (typeof value !== "string" || !/^\d{6}$/.test(value) || commonPins.has(value)) {
    throw new Error("Ev kullanıcısı PIN’i kolay tahmin edilemeyen 6 rakam olmalıdır.");
  }
  return value;
};

const validateStoredState = (value: unknown): StoredAuthState => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Erişim kaydı geçersiz.");
  }
  const candidate = value as Partial<StoredAuthState>;
  if (candidate.version !== 1 || !Array.isArray(candidate.users) || !Array.isArray(candidate.sessions)) {
    throw new Error("Erişim kaydı sürümü geçersiz.");
  }
  return candidate as StoredAuthState;
};

export class AuthStore {
  private readonly now: () => Date;
  private readonly sessionLifetimeMs: number;
  private readonly scryptParameters: ScryptParameters;
  private cachedState: StoredAuthState | null = null;
  private mutation: Promise<void> = Promise.resolve();

  constructor(private readonly path: string, options: AuthStoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.sessionLifetimeMs = options.sessionLifetimeMs ?? 7 * 24 * 60 * 60 * 1000;
    this.scryptParameters = { ...defaultScrypt, ...options.scrypt };
  }

  private async load(): Promise<StoredAuthState> {
    if (this.cachedState) return this.cachedState;
    try {
      this.cachedState = validateStoredState(JSON.parse(await readFile(this.path, "utf8")));
      return this.cachedState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.cachedState = emptyState();
        return this.cachedState;
      }
      throw error;
    }
  }

  private async save(state: StoredAuthState): Promise<void> {
    const temporary = `${this.path}.tmp-${process.pid}-${randomUUID()}`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.path);
    this.cachedState = state;
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutation.then(operation, operation);
    this.mutation = result.then(() => undefined, () => undefined);
    return result;
  }

  private async hashSecret(secret: string, salt = randomBytes(16)): Promise<{
    salt: string;
    hash: string;
    scrypt: ScryptParameters;
  }> {
    const parameters = this.scryptParameters;
    const derived = await deriveSecret(secret, salt, parameters);
    return {
      salt: salt.toString("base64url"),
      hash: derived.toString("base64url"),
      scrypt: { ...parameters }
    };
  }

  private async verifySecret(user: StoredUser, secret: string): Promise<boolean> {
    const expected = Buffer.from(user.hash, "base64url");
    const actual = await deriveSecret(
      secret.normalize("NFC"),
      Buffer.from(user.salt, "base64url"),
      user.scrypt
    );
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private createSession(username: string, role: AuthRole): CreatedAuthSession {
    const token = randomBytes(32).toString("base64url");
    return {
      token,
      username,
      role,
      csrfToken: randomBytes(24).toString("base64url"),
      expiresAt: new Date(this.now().getTime() + this.sessionLifetimeMs).toISOString()
    };
  }

  private activeSessions(sessions: StoredSession[]): StoredSession[] {
    const now = this.now().getTime();
    return sessions.filter((session) => Date.parse(session.expiresAt) > now).slice(-20);
  }

  async configured(): Promise<boolean> {
    return (await this.load()).users.some((user) => user.role === "admin");
  }

  async setup(usernameValue: string, passwordValue: unknown, pinValue: unknown): Promise<CreatedAuthSession> {
    return this.exclusive(async () => {
      const state = await this.load();
      if (state.users.some((user) => user.role === "admin")) {
        throw new Error("Yönetici hesabı zaten oluşturulmuş.");
      }
      const username = validateUsername(usernameValue);
      const password = validateAdminPassword(passwordValue);
      const pin = validateResidentPin(pinValue);
      const [adminSecret, residentSecret] = await Promise.all([
        this.hashSecret(password),
        this.hashSecret(pin)
      ]);
      const session = this.createSession(username, "admin");
      await this.save({
        version: 1,
        users: [
          { username, role: "admin", secretKind: "password", ...adminSecret },
          { username: "home", role: "resident", secretKind: "pin", ...residentSecret }
        ],
        sessions: [{
          tokenHash: tokenHash(session.token),
          csrfToken: session.csrfToken,
          username: session.username,
          role: session.role,
          expiresAt: session.expiresAt
        }]
      });
      return session;
    });
  }

  async login(mode: AuthRole, usernameValue: string, secretValue: unknown): Promise<CreatedAuthSession | null> {
    if (typeof secretValue !== "string" || secretValue.length > 128) return null;
    const username = mode === "resident" ? "home" : normalizeUsername(usernameValue);
    return this.exclusive(async () => {
      const state = await this.load();
      const user = state.users.find((candidate) =>
        candidate.role === mode && candidate.username === username
      );
      if (!user) {
        await this.hashSecret(secretValue.normalize("NFC"), Buffer.alloc(16));
        return null;
      }
      if (!await this.verifySecret(user, secretValue)) return null;
      const session = this.createSession(user.username, user.role);
      state.sessions = [
        ...this.activeSessions(state.sessions),
        {
          tokenHash: tokenHash(session.token),
          csrfToken: session.csrfToken,
          username: session.username,
          role: session.role,
          expiresAt: session.expiresAt
        }
      ];
      await this.save(state);
      return session;
    });
  }

  async getSession(token: string | undefined): Promise<AuthSession | null> {
    if (!token) return null;
    const state = await this.load();
    const hash = tokenHash(token);
    const session = this.activeSessions(state.sessions).find((candidate) =>
      candidate.tokenHash.length === hash.length
      && timingSafeEqual(Buffer.from(candidate.tokenHash), Buffer.from(hash))
    );
    return session ? {
      username: session.username,
      role: session.role,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt
    } : null;
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.exclusive(async () => {
      const state = await this.load();
      const hash = tokenHash(token);
      state.sessions = this.activeSessions(state.sessions).filter((session) => session.tokenHash !== hash);
      await this.save(state);
    });
  }

  async updateAdminPassword(
    usernameValue: string,
    currentPasswordValue: unknown,
    newPasswordValue: unknown
  ): Promise<void> {
    if (typeof currentPasswordValue !== "string" || currentPasswordValue.length > 128) {
      throw new Error("Mevcut yönetici parolası yanlış.");
    }
    const username = normalizeUsername(usernameValue);
    const newPassword = validateAdminPassword(newPasswordValue);
    await this.exclusive(async () => {
      const state = await this.load();
      const admin = state.users.find((user) =>
        user.role === "admin" && user.username === username
      );
      if (!admin || !await this.verifySecret(admin, currentPasswordValue)) {
        throw new Error("Mevcut yönetici parolası yanlış.");
      }
      if (await this.verifySecret(admin, newPassword)) {
        throw new Error("Yeni yönetici parolası mevcut paroladan farklı olmalıdır.");
      }
      Object.assign(admin, await this.hashSecret(newPassword));
      state.sessions = this.activeSessions(state.sessions).filter((session) => session.role !== "admin");
      await this.save(state);
    });
  }

  async updateResidentPin(pinValue: unknown): Promise<void> {
    const pin = validateResidentPin(pinValue);
    await this.exclusive(async () => {
      const state = await this.load();
      const secret = await this.hashSecret(pin);
      const resident = state.users.find((user) => user.role === "resident");
      if (!resident) throw new Error("Ev kullanıcısı bulunamadı.");
      Object.assign(resident, secret);
      state.sessions = this.activeSessions(state.sessions).filter((session) => session.role !== "resident");
      await this.save(state);
    });
  }
}
