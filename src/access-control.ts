import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AgentTokenStore, AgentTokenSummary } from "./agent-tokens.js";
import type { AuthRole, AuthSession, AuthStore, CreatedAuthSession } from "./auth-store.js";
import { isAllowedMcpOrigin, mcpErrorBody, mcpErrorCodes, mcpRoutePath } from "./mcp.js";

declare module "fastify" {
  interface FastifyRequest {
    villaSession: AuthSession | null;
    /** `/mcp` isteğini doğrulayan ajan token'ı; başka hiçbir yolda dolmaz. */
    villaAgent: AgentTokenSummary | null;
  }
}

const sessionCookieName = "villa_session";
const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const publicRoutes = new Set([
  "/api/health",
  "/api/discovery",
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
  "GET /api/home-groups",
  "PUT /api/home-groups",
  // Görünürlük ("bu lambayı oda kartında gösterme", "bu oda Genel görünümde çıkmasın") günlük
  // bir tercihtir, kurulum ayarı değil: paneli kullanan ev sakini kendi ekranını düzenleyebilmeli.
  // Yazma da resident, çünkü aksi hâlde her düzeltme için yönetici çağırmak gerekirdi. Açtığı
  // veri ev sakininin zaten gördüğü cihaz ve oda listesinden fazlası değil.
  "GET /api/home-visibility",
  "PUT /api/home-visibility",
  "GET /api/automations",
  // Çalışma günlüğü, ev sakininin zaten gördüğü kural ve cihaz verisinden fazlasını açmaz;
  // "neden çalışmadı" sorusunu soran da odur. Yazma yolu yok, salt okunur.
  "GET /api/automation-runs",
  "GET /api/automations/:id/runs",
  // Konum okuması güneş kuralının saatini göstermek için gerekir; **yazma** listelenmez,
  // dolayısıyla yönetici ister (evin koordinatı kurulum ayarıdır).
  "GET /api/settings/location",
  "GET /api/celestial",
  "GET /api/theme-packages",
  "GET /api/appearance",
  // Hava durumu ana ekranın parçası: okuması herkese açık. **Konum yazma** (`PUT
  // /api/weather/location`) listede YOKTUR, yönetici ister — bir ekranda yapılan seçim evdeki
  // bütün panelleri değiştirir. Şehir araması ev sakininin de açtığı pencerelerde (dünya saati)
  // kullanıldığı için okumayla birlikte açılır; dışarıya çıkan tek taraf sunucudur.
  "GET /api/weather",
  "GET /api/locations/search",
  // Dünya saati şehirleri de evin ayarıdır (duvardaki tablet); okuması ana ekranın parçası olduğu
  // için ev sakinine açık. **Yazma** (`PUT /api/world-clock`) listede YOKTUR, yönetici ister —
  // hava konumuyla aynı gerekçe: bir ekranda yapılan düzenleme bütün panelleri değiştirir.
  "GET /api/world-clock",
  "GET /api/device-image/:model",
  "GET /api/devices/:id/note",
  "PUT /api/devices/:id/note",
  // Rol yalnız arayüzdeki sunumu değiştirir (lamba mı anahtar mı) — ev sakini de düzeltebilir.
  "GET /api/devices/:id/role",
  "PUT /api/devices/:id/role",
  "POST /api/devices/:id/command",
  "POST /api/groups/:id/command",
  "POST /api/auth/logout"
]);

// `POST /api/system/restart` ve `POST /api/system/coordinator-restart` de bilerek listelenmedi:
// listelenmeyen her yol yönetici ister. İkisi de evin kumandasını saniyeler boyunca kesiyor
// (biri servisi indiriyor, öbürü koordinatörün telsiz çipini resetliyor) — bu bir ev sakini
// düğmesi değil, kurulum işidir. Buraya EKLEMEYİN.

// `POST /api/settings/zigbee-adapter/test` bilerek YUKARIDAKİ TABLOLARIN HİÇBİRİNDE yok:
// listelenmeyen her yol yönetici ister ve bu uç tam olarak onu istiyor. Ev sakinine açılsaydı,
// evin panelinde oturan herkes sunucudan istediği adrese TCP bağlantısı denettirebilirdi —
// yani uç, ağdaki servisleri tarayan bir araca dönerdi. Ucun kendi içinde bir de hız sınırı var
// (tek eşzamanlı yoklama, çağrılar arası ≥3 sn); yetki tablosu ile o sınır aynı gerekçenin iki
// yarısıdır. Yol koordinatöre tek bayt yazmaz, yalnız "adres yanıt veriyor mu" der.

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
  /** Ajan token deposu; verilmezse `/mcp` her istekte 401 döner ve yönetim uçları açılmaz. */
  agentTokens?: AgentTokenStore;
  /** `/mcp` için izinli `Origin` başlıkları; boşsa Origin gönderen istemci reddedilir. */
  mcpAllowedOrigins?: readonly string[];
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
  const agentTokens = options.agentTokens;
  const mcpAllowedOrigins = options.mcpAllowedOrigins ?? [];
  let configured = await authStore.configured();
  app.decorateRequest("villaSession", null);
  app.decorateRequest("villaAgent", null);

  const requestToken = (request: FastifyRequest): string | undefined =>
    parseCookie(request.headers.cookie, sessionCookieName);
  const requestSession = (request: FastifyRequest): Promise<AuthSession | null> =>
    authStore.getSession(requestToken(request));

  /**
   * `/mcp` kapısı. Aşağıdaki tablo yalnız `/api/` yollarını kapsadığı için bu uç kendi başına
   * **korumasız kalırdı**; bu yüzden açıkça ilk sırada ele alınır. Yalnız `Authorization: Bearer`
   * geçer — çerez oturumu bilerek kabul EDİLMEZ, yoksa açık bir tarayıcı sekmesi üzerinden
   * (CSRF deseniyle) evin tamamı sürülebilirdi.
   */
  const authorizeMcpRequest = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply | undefined> => {
    // Yöntem denetimi kimlikten önce gelir: `GET /mcp` hiçbir veri açmaz, yalnız "bu sürümde
    // akış yok" der; 401 döndürmek istemciyi yanlış yöne (token sorunu) sürüklerdi.
    if (request.method !== "POST") {
      return reply.code(405).header("Allow", "POST").send(mcpErrorBody(
        mcpErrorCodes.methodNotAllowed,
        "MCP ucu yalnız POST kabul eder; bu sürümde GET akışı yoktur."
      ));
    }
    if (!isAllowedMcpOrigin(request.headers.origin, mcpAllowedOrigins)) {
      return reply.code(403).send(mcpErrorBody(
        mcpErrorCodes.forbiddenOrigin,
        "İstek kökeni (Origin) bu uç için izinli değil."
      ));
    }
    const authorization = request.headers.authorization;
    const token = typeof authorization === "string" && /^Bearer /.test(authorization)
      ? authorization.slice("Bearer ".length).trim()
      : undefined;
    const agent = token && agentTokens ? await agentTokens.verify(token) : null;
    if (!agent) {
      return reply.code(401).header("WWW-Authenticate", "Bearer").send(mcpErrorBody(
        mcpErrorCodes.unauthorized,
        "Geçerli bir ajan token'ı gerekiyor: Authorization: Bearer <token>."
      ));
    }
    request.villaAgent = agent;
    return undefined;
  };

  app.addHook("onRequest", async (request, reply) => {
    const route = request.routeOptions.url ?? request.url.split("?")[0];
    if (route === mcpRoutePath) return authorizeMcpRequest(request, reply);
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
    Body?: { newPassword?: unknown };
  }>("/api/auth/admin-password", async (request, reply) => {
    try {
      await authStore.updateAdminPassword(
        request.villaSession?.username ?? "",
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

  // Ajan token yönetimi. Yetki tablolarında listelenmediği için yönetici ister; ham token
  // yalnız üretim yanıtında bir kez döner, listede bir daha görünmez.
  if (agentTokens) {
    app.get("/api/agent-tokens", async (_request, reply) => {
      try {
        return { ok: true, tokens: await agentTokens.list() };
      } catch (error) {
        return reply.code(503).send({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    app.post<{ Body?: { name?: unknown } }>("/api/agent-tokens", async (request, reply) => {
      try {
        const created = await agentTokens.create(request.body?.name);
        return { ok: true, token: created.token, record: created.record };
      } catch (error) {
        return reply.code(400).send({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    app.delete<{ Params: { id: string } }>("/api/agent-tokens/:id", async (request, reply) => {
      if (!await agentTokens.revoke(request.params.id)) {
        return reply.code(404).send({ ok: false, error: "Ajan token'ı bulunamadı." });
      }
      return { ok: true, tokens: await agentTokens.list() };
    });
  }
};
