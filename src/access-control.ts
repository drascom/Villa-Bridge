import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthRole, AuthSession, AuthStore, CreatedAuthSession } from "./auth-store.js";

declare module "fastify" {
  interface FastifyRequest {
    villaSession: AuthSession | null;
  }
}

const sessionCookieName = "villa_session";
const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const publicRoutes = new Set([
  "/api/health",
  "/api/locales",
  "/api/auth/session",
  "/api/auth/setup",
  "/api/auth/login"
]);

const residentRoutes = new Set([
  "GET /api/devices",
  "GET /api/groups",
  "GET /api/pairing",
  "GET /api/overview",
  "GET /api/onboarding",
  "GET /api/favorites",
  "PUT /api/favorites",
  "GET /api/devices/:id/note",
  "PUT /api/devices/:id/note",
  "POST /api/devices/:id/command",
  "POST /api/groups/:id/command",
  "POST /api/auth/logout"
]);

const parseCookie = (header: string | undefined, name: string): string | undefined => {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
};

const constantTimeStringEqual = (left: string | undefined, right: string): boolean => {
  if (!left) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const sessionCookie = (token: string, maxAgeSeconds: number, secure: boolean): string =>
  `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;

const expiredSessionCookie = (secure: boolean): string =>
  `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;

interface AttemptState {
  failures: number;
  lastFailureAt: number;
  blockedUntil: number;
}

export class LoginThrottle {
  private readonly attempts = new Map<string, AttemptState>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxAttempts = 5,
    private readonly baseBlockMs = 30_000
  ) {}

  retryAfterSeconds(key: string): number {
    const state = this.attempts.get(key);
    if (!state || state.blockedUntil <= this.now()) return 0;
    return Math.max(1, Math.ceil((state.blockedUntil - this.now()) / 1000));
  }

  failure(key: string): void {
    const now = this.now();
    const previous = this.attempts.get(key);
    const failures = previous && now - previous.lastFailureAt < 15 * 60_000
      ? previous.failures + 1
      : 1;
    const penaltyLevel = Math.max(0, failures - this.maxAttempts);
    this.attempts.set(key, {
      failures,
      lastFailureAt: now,
      blockedUntil: failures >= this.maxAttempts
        ? now + Math.min(15 * 60_000, this.baseBlockMs * 2 ** penaltyLevel)
        : 0
    });
  }

  success(key: string): void {
    this.attempts.delete(key);
  }
}

export interface AccessControlOptions {
  secureCookies?: boolean;
  throttle?: LoginThrottle;
}

const sendSession = (
  reply: FastifyReply,
  session: CreatedAuthSession,
  secureCookies: boolean
) => reply
  .header("Set-Cookie", sessionCookie(
    session.token,
    Math.max(1, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000)),
    secureCookies
  ))
  .send({
    ok: true,
    configured: true,
    authenticated: true,
    user: { username: session.username, role: session.role },
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt
  });

export const registerAccessControl = async (
  app: FastifyInstance,
  authStore: AuthStore,
  options: AccessControlOptions = {}
): Promise<void> => {
  const secureCookies = options.secureCookies === true;
  const throttle = options.throttle ?? new LoginThrottle();
  let configured = await authStore.configured();
  app.decorateRequest("villaSession", null);

  const requestToken = (request: FastifyRequest): string | undefined =>
    parseCookie(request.headers.cookie, sessionCookieName);
  const requestSession = (request: FastifyRequest): Promise<AuthSession | null> =>
    authStore.getSession(requestToken(request));

  app.addHook("onRequest", async (request, reply) => {
    const route = request.routeOptions.url ?? request.url.split("?")[0];
    if (!route.startsWith("/api/") || publicRoutes.has(route)) return;
    if (!configured) {
      return reply.code(423).send({
        ok: false,
        code: "AUTH_SETUP_REQUIRED",
        error: "Önce yönetici hesabını oluşturun."
      });
    }
    const session = await requestSession(request);
    if (!session) {
      return reply.code(401).send({
        ok: false,
        code: "AUTHENTICATION_REQUIRED",
        error: "Oturum açmanız gerekiyor."
      });
    }
    request.villaSession = session;
    if (
      stateChangingMethods.has(request.method)
      && !constantTimeStringEqual(request.headers["x-villa-csrf"] as string | undefined, session.csrfToken)
    ) {
      return reply.code(403).send({
        ok: false,
        code: "INVALID_CSRF_TOKEN",
        error: "Güvenlik doğrulaması geçersiz."
      });
    }
    const requiredRole: AuthRole = residentRoutes.has(`${request.method} ${route}`)
      ? "resident"
      : "admin";
    if (requiredRole === "admin" && session.role !== "admin") {
      return reply.code(403).send({
        ok: false,
        code: "ADMIN_REQUIRED",
        error: "Bu işlem için yönetici yetkisi gerekiyor."
      });
    }
  });

  app.get("/api/auth/session", async (request) => {
    const session = configured ? await requestSession(request) : null;
    return {
      ok: true,
      configured,
      authenticated: session !== null,
      user: session ? { username: session.username, role: session.role } : null,
      csrfToken: session?.csrfToken ?? null,
      expiresAt: session?.expiresAt ?? null
    };
  });

  app.post<{
    Body?: { username?: unknown; password?: unknown; residentPin?: unknown };
  }>("/api/auth/setup", async (request, reply) => {
    if (configured) {
      return reply.code(409).send({ ok: false, error: "Yönetici hesabı zaten oluşturulmuş." });
    }
    if (typeof request.body?.username !== "string") {
      return reply.code(400).send({ ok: false, error: "Yönetici kullanıcı adı geçersiz." });
    }
    try {
      const session = await authStore.setup(
        request.body.username,
        request.body.password,
        request.body.residentPin
      );
      configured = true;
      return sendSession(reply, session, secureCookies);
    } catch (error) {
      return reply.code(400).send({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post<{
    Body?: { mode?: unknown; username?: unknown; secret?: unknown };
  }>("/api/auth/login", async (request, reply) => {
    if (!configured) {
      return reply.code(423).send({
        ok: false,
        code: "AUTH_SETUP_REQUIRED",
        error: "Önce yönetici hesabını oluşturun."
      });
    }
    const mode = request.body?.mode;
    if (mode !== "admin" && mode !== "resident") {
      return reply.code(400).send({ ok: false, error: "Hesap türü geçersiz." });
    }
    const username = typeof request.body?.username === "string" ? request.body.username : "";
    const key = `${request.ip}:${mode}:${mode === "resident" ? "home" : username.toLowerCase()}`;
    const retryAfter = throttle.retryAfterSeconds(key);
    if (retryAfter > 0) {
      return reply
        .header("Retry-After", String(retryAfter))
        .code(429)
        .send({ ok: false, error: "Çok fazla deneme yapıldı. Biraz sonra yeniden deneyin." });
    }
    const session = await authStore.login(mode, username, request.body?.secret);
    if (!session) {
      throttle.failure(key);
      return reply.code(401).send({ ok: false, error: "Kullanıcı adı, parola veya PIN yanlış." });
    }
    throttle.success(key);
    return sendSession(reply, session, secureCookies);
  });

  app.post("/api/auth/logout", async (request, reply) => {
    await authStore.logout(requestToken(request));
    return reply
      .header("Set-Cookie", expiredSessionCookie(secureCookies))
      .send({ ok: true });
  });

  app.put<{
    Body?: { currentPassword?: unknown; newPassword?: unknown };
  }>("/api/auth/admin-password", async (request, reply) => {
    try {
      await authStore.updateAdminPassword(
        request.villaSession?.username ?? "",
        request.body?.currentPassword,
        request.body?.newPassword
      );
      return reply
        .header("Set-Cookie", expiredSessionCookie(secureCookies))
        .send({ ok: true, reauthenticationRequired: true });
    } catch (error) {
      return reply.code(400).send({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.put<{ Body?: { pin?: unknown } }>("/api/auth/resident-pin", async (request, reply) => {
    try {
      await authStore.updateResidentPin(request.body?.pin);
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
};
