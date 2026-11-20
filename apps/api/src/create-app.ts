import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { hash, verify } from "@node-rs/argon2";
import {
  bitcoinWithdrawalSchema,
  localQuoteSchema,
  localWithdrawalSchema,
  loginSchema,
  productCreateSchema,
  registerSchema,
  checkoutCreateSchema,
  paymentLinkCreateSchema,
  buyerDetailsSchema,
  webhookEndpointCreateSchema,
  isValidIdempotencyKey,
  sha256Hex,
  verifyHmacSha512,
} from "@flow/contracts";
import { prisma } from "@flow/db";
import { env } from "./env.js";
import { ApiError } from "./errors.js";
import { encrypt, randomToken, sha256 } from "./crypto.js";
import { createCheckout, pollOpenPayments, settleFromNode } from "./payments.js";
import { confirmLocal, quoteLocal, withdrawBitcoin } from "./withdrawals.js";
import { assist } from "./ai.js";
import { paymentView, sats, withdrawalView } from "./serialize.js";
import {
  bitnobConfigured,
  bitnobWebhookConfigured,
  bitnobWhoami,
  listSupportedCountries,
} from "./bitnob.js";
import {
  connectTelegram,
  disconnectTelegram,
  getTelegramStatus,
  handleTelegramWebhook,
  telegramConnectSchema,
} from "./telegram.js";
import { configuredLightningNetwork, networkBannerCopy } from "./network.js";
import { countries } from "./countries.js";
import { ZodError } from "zod";

async function userFromRequest(request: FastifyRequest) {
  const token = request.cookies.flow_session;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { businesses: true } } },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  return session.user;
}

async function requireUser(request: FastifyRequest) {
  const user = await userFromRequest(request);
  if (!user) throw new ApiError(401, "unauthenticated", "Sign in to continue");
  // Deterministic when a user somehow has multiple businesses (Prisma relation order is otherwise undefined).
  const business = [...user.businesses].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  if (!business) throw new ApiError(404, "business_missing", "Create a business first");
  return { user, business };
}

async function requireApiKey(request: FastifyRequest) {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new ApiError(401, "unauthenticated", "Send a Flow API key");
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: sha256(token) },
    include: { business: true },
  });
  if (!apiKey) throw new ApiError(401, "unauthenticated", "That API key is not valid");
  return apiKey.business;
}

function zodMessage(error: ZodError) {
  return error.issues.map((issue) => issue.message).join(" ");
}

export async function buildServer() {
  const app = Fastify({ logger: true });
  await app.register(cookie);
  await app.register(cors, {
    origin: env.webOrigin,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE"],
  });
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    if (request.url === "/webhooks/bitnob") return done(null, body);
    try {
      const text = (body as Buffer).toString("utf8");
      done(null, text ? JSON.parse(text) : {});
    } catch {
      done(new ApiError(400, "invalid_json", "Request body is not valid JSON"), undefined);
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.status).send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof ZodError) {
      return reply.status(422).send({ error: { code: "validation_error", message: zodMessage(error) } });
    }
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      return reply.status(409).send({ error: { code: "already_exists", message: "That email is already registered" } });
    }
    app.log.error(error);
    return reply.status(500).send({ error: { code: "internal_error", message: "Something went wrong" } });
  });

  app.get("/health", async () => {
    const network = configuredLightningNetwork();
    const databaseConfigured = Boolean(env.databaseUrl);
    return {
      ok: databaseConfigured,
      databaseConfigured,
      network,
      banner: networkBannerCopy(network),
      localPayouts: {
        configured: bitnobConfigured(),
        webhookSecretSet: bitnobWebhookConfigured(),
        webhookPath: "/webhooks/bitnob",
        baseUrl: env.bitnobBaseUrl,
      },
    };
  });

  app.get("/public/countries", async () => ({ countries }));

  app.post("/auth/register", async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const passwordHash = await hash(input.password);
    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash,
        businesses: { create: { name: input.businessName, country: input.country.toUpperCase() } },
      },
      include: { businesses: true },
    });
    return setSession(reply, user.id, {
      id: user.id,
      email: user.email,
      business: businessView(user.businesses[0]!),
    });
  });

  app.post("/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { businesses: true },
    });
    if (!user || !(await verify(user.passwordHash, input.password))) {
      throw new ApiError(401, "invalid_login", "Email or password is wrong");
    }
    return setSession(reply, user.id, {
      id: user.id,
      email: user.email,
      business: businessView(user.businesses[0]!),
    });
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies.flow_session;
    if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
    reply.clearCookie("flow_session", { path: "/" });
    return { ok: true };
  });

  app.get("/auth/me", async (request) => {
    const { user, business } = await requireUser(request);
    return { id: user.id, email: user.email, business: businessView(business) };
  });

  app.post("/dashboard/products", async (request) => {
    const { business } = await requireUser(request);
    const input = productCreateSchema.parse(request.body);
    const product = await prisma.product.create({
      data: {
        businessId: business.id,
        name: input.name,
        description: input.description,
        priceSats: BigInt(input.priceSats),
      },
    });
    return productView(product);
  });

  app.get("/dashboard/products", async (request) => {
    const { business } = await requireUser(request);
    const products = await prisma.product.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "desc" } });
    return products.map(productView);
  });

  app.post("/dashboard/payment-links", async (request) => {
    const { business } = await requireUser(request);
    return createPaymentLink(business.id, paymentLinkCreateSchema.parse(request.body));
  });

  app.get("/dashboard/payment-links", async (request) => {
    const { business } = await requireUser(request);
    return listPaymentLinks(business.id);
  });

  app.post("/dashboard/webhook-endpoints", async (request) => {
    const { business } = await requireUser(request);
    return createWebhookEndpoint(business.id, webhookEndpointCreateSchema.parse(request.body));
  });

  app.get("/dashboard/webhook-endpoints", async (request) => {
    const { business } = await requireUser(request);
    return listWebhookEndpoints(business.id);
  });

  app.delete("/dashboard/webhook-endpoints/:id", async (request) => {
    const { business } = await requireUser(request);
    const { id } = request.params as { id: string };
    return deleteWebhookEndpoint(business.id, id);
  });

  app.get("/dashboard/payments", async (request) => {
    const { business } = await requireUser(request);
    if (process.env.VERCEL) await pollOpenPayments();
    const payments = await prisma.payment.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { order: true },
    });
    return payments.map((payment) => paymentView(payment, business.name, payment.order));
  });

  app.post("/dashboard/checkouts", async (request) => {
    const { business } = await requireUser(request);
    const input = checkoutCreateSchema.parse(request.body);
    return createCheckout(business.id, input);
  });

  app.post("/dashboard/withdrawals/bitcoin", async (request) => {
    const { business } = await requireUser(request);
    return withdrawBitcoin(business.id, bitcoinWithdrawalSchema.parse(request.body));
  });

  app.get("/dashboard/withdrawals/local/status", async (request) => {
    await requireUser(request);
    const webhookUrl = `${env.apiUrl.replace(/\/$/, "")}/webhooks/bitnob`;
    if (!bitnobConfigured()) {
      return {
        configured: false,
        webhookSecretSet: bitnobWebhookConfigured(),
        environment: null,
        reason: "missing_credentials",
        message: "Set BITNOB_CLIENT_ID and BITNOB_CLIENT_SECRET (sandbox) to enable local payouts.",
        webhookUrl,
      };
    }
    try {
      const whoami = await bitnobWhoami();
      const environment = (whoami.environment ?? "").toLowerCase() || null;
      const sandbox = environment === "sandbox";
      const ready = sandbox && bitnobWebhookConfigured();
      return {
        configured: ready,
        webhookSecretSet: bitnobWebhookConfigured(),
        environment,
        reason: ready ? "ready" : !sandbox ? "not_sandbox" : "webhook_unconfigured",
        message: ready
          ? "Sandbox local payouts are ready."
          : !sandbox
            ? "Local payouts require sandbox credentials (whoami.environment must be sandbox)."
            : "Set BITNOB_WEBHOOK_SECRET and a public HTTPS API_URL for webhooks.",
        webhookUrl,
      };
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Could not verify payout credentials.";
      return {
        configured: false,
        webhookSecretSet: bitnobWebhookConfigured(),
        environment: null,
        reason: error instanceof ApiError && error.code === "invalid_credentials" ? "invalid_credentials" : "provider_error",
        message,
        webhookUrl,
      };
    }
  });

  app.get("/dashboard/withdrawals/local/countries", async (request) => {
    await requireUser(request);
    if (!bitnobConfigured()) {
      throw new ApiError(503, "payouts_unconfigured", "Local payouts are not configured.");
    }
    try {
      const countries = await listSupportedCountries();
      return { countries };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, "payouts_unconfigured", "Could not load payout corridors.");
    }
  });

  app.post("/dashboard/withdrawals/local/quote", async (request) => {
    const { business } = await requireUser(request);
    return quoteLocal(business.id, localQuoteSchema.parse(request.body));
  });

  app.post("/dashboard/withdrawals/local", async (request) => {
    const { business } = await requireUser(request);
    return confirmLocal(business.id, localWithdrawalSchema.parse(request.body));
  });

  app.get("/dashboard/withdrawals", async (request) => {
    const { business } = await requireUser(request);
    const rows = await prisma.withdrawal.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "desc" }, take: 50 });
    return rows.map(withdrawalView);
  });

  app.post("/dashboard/assistant", async (request) => {
    const { business } = await requireUser(request);
    const body = request.body as { message?: string };
    if (!body.message?.trim()) throw new ApiError(422, "validation_error", "Write a message");
    return assist(business.id, body.message, "merchant");
  });

  app.get("/dashboard/telegram", async (request) => {
    const { business } = await requireUser(request);
    return getTelegramStatus(business.id);
  });

  app.post("/dashboard/telegram/connect", async (request) => {
    const { business } = await requireUser(request);
    const input = telegramConnectSchema.parse(request.body);
    return connectTelegram(business.id, input.token);
  });

  app.post("/dashboard/telegram/disconnect", async (request) => {
    const { business } = await requireUser(request);
    return disconnectTelegram(business.id);
  });

  app.patch("/dashboard/settings", async (request) => {
    const { business } = await requireUser(request);
    const body = request.body as { aiMode?: "flow" | "byok"; openaiKey?: string; openaiModel?: string; country?: string };
    const data: { aiMode?: string; openaiKeyCipher?: string; openaiModel?: string; country?: string } = {};
    if (body.aiMode === "flow" || body.aiMode === "byok") data.aiMode = body.aiMode;
    const openaiKey = typeof body.openaiKey === "string" ? body.openaiKey.trim() : "";
    if (openaiKey) data.openaiKeyCipher = encrypt(openaiKey);
    if (typeof body.openaiModel === "string" && body.openaiModel.trim()) {
      data.openaiModel = body.openaiModel.trim();
    }
    if (body.country) data.country = body.country.toUpperCase();

    const nextMode = data.aiMode ?? business.aiMode;
    const willHaveKey = Boolean(data.openaiKeyCipher ?? business.openaiKeyCipher);
    if (nextMode === "byok" && !willHaveKey) {
      throw new ApiError(
        422,
        "ai_key_missing",
        "Paste an OpenAI API key to use My OpenAI key, or keep Assistant mode on Flow AI",
      );
    }

    const updated = await prisma.business.update({ where: { id: business.id }, data });
    return businessView(updated);
  });

  app.post("/dashboard/api-keys", async (request) => {
    const { business } = await requireUser(request);
    const secret = `flw_test_${randomToken(24)}`;
    await prisma.apiKey.create({
      data: { businessId: business.id, prefix: secret.slice(0, 16), keyHash: sha256(secret) },
    });
    return { key: secret, prefix: secret.slice(0, 16) };
  });

  app.get("/dashboard/api-keys", async (request) => {
    const { business } = await requireUser(request);
    const keys = await prisma.apiKey.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "desc" } });
    return keys.map((key) => ({ id: key.id, prefix: key.prefix, createdAt: key.createdAt.toISOString() }));
  });

  app.post("/v1/checkouts", async (request) => {
    const business = await requireApiKey(request);
    const input = checkoutCreateSchema.parse(request.body);
    return withIdempotency(request, business.id, () => createCheckout(business.id, input));
  });

  app.get("/v1/checkouts/:id", async (request) => {
    const business = await requireApiKey(request);
    const { id } = request.params as { id: string };
    const payment = await ownedPayment(business.id, id);
    return paymentView(payment, business.name, payment.order);
  });

  app.post("/v1/payments", async (request) => {
    const business = await requireApiKey(request);
    const input = checkoutCreateSchema.parse(request.body);
    return withIdempotency(request, business.id, () => createCheckout(business.id, input));
  });

  app.get("/v1/payments/:id", async (request) => {
    const business = await requireApiKey(request);
    const { id } = request.params as { id: string };
    await settleFromNode(id);
    const payment = await ownedPayment(business.id, id);
    return paymentView(payment, business.name, payment.order);
  });

  app.post("/v1/withdrawals/bitcoin", async (request) => {
    const business = await requireApiKey(request);
    const input = bitcoinWithdrawalSchema.parse(request.body);
    return withIdempotency(request, business.id, () => withdrawBitcoin(business.id, input));
  });

  app.post("/v1/withdrawals/local/quote", async (request) => {
    const business = await requireApiKey(request);
    const input = localQuoteSchema.parse(request.body);
    return withIdempotency(request, business.id, () => quoteLocal(business.id, input));
  });

  app.post("/v1/withdrawals/local", async (request) => {
    const business = await requireApiKey(request);
    const input = localWithdrawalSchema.parse(request.body);
    return withIdempotency(request, business.id, () => confirmLocal(business.id, input));
  });

  app.get("/v1/withdrawals/:id", async (request) => {
    const business = await requireApiKey(request);
    const { id } = request.params as { id: string };
    const withdrawal = await prisma.withdrawal.findFirst({ where: { id, businessId: business.id } });
    if (!withdrawal) throw new ApiError(404, "not_found", "Withdrawal not found");
    return withdrawalView(withdrawal);
  });

  app.get("/v1/transactions", async (request) => {
    const business = await requireApiKey(request);
    if (process.env.VERCEL) await pollOpenPayments();
    const payments = await prisma.payment.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "desc" }, take: 50, include: { order: true } });
    return payments.map((payment) => paymentView(payment, business.name, payment.order));
  });

  app.post("/v1/payment-links", async (request) => {
    const business = await requireApiKey(request);
    const input = paymentLinkCreateSchema.parse(request.body);
    return withIdempotency(request, business.id, () => createPaymentLink(business.id, input));
  });

  app.get("/v1/payment-links", async (request) => {
    const business = await requireApiKey(request);
    return listPaymentLinks(business.id);
  });

  app.get("/v1/payment-links/:id", async (request) => {
    const business = await requireApiKey(request);
    const { id } = request.params as { id: string };
    return retrievePaymentLink(business.id, id);
  });

  app.post("/v1/webhook-endpoints", async (request) => {
    const business = await requireApiKey(request);
    const input = webhookEndpointCreateSchema.parse(request.body);
    return withIdempotency(request, business.id, () => createWebhookEndpoint(business.id, input));
  });

  app.get("/v1/webhook-endpoints", async (request) => {
    const business = await requireApiKey(request);
    return listWebhookEndpoints(business.id);
  });

  app.delete("/v1/webhook-endpoints/:id", async (request) => {
    const business = await requireApiKey(request);
    const { id } = request.params as { id: string };
    return deleteWebhookEndpoint(business.id, id);
  });

  app.get("/public/checkouts/:id", async (request) => {
    const { id } = request.params as { id: string };
    await settleFromNode(id);
    const payment = await prisma.payment.findUnique({ where: { id }, include: { business: true, order: true } });
    if (!payment) throw new ApiError(404, "not_found", "Checkout not found");
    return { ...paymentView(payment, payment.business.name), description: payment.order.description };
  });

  app.get("/public/stores/:businessId", async (request) => {
    const { businessId } = request.params as { businessId: string };
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new ApiError(404, "not_found", "Store not found");
    const products = await prisma.product.findMany({
      where: { businessId, active: true },
      orderBy: { createdAt: "desc" },
    });
    return { id: business.id, name: business.name, products: products.map(productView) };
  });

  app.post("/public/stores/:businessId/products/:productId/checkout", async (request) => {
    const { businessId, productId } = request.params as { businessId: string; productId: string };
    const product = await prisma.product.findFirst({ where: { id: productId, businessId, active: true } });
    if (!product) throw new ApiError(404, "not_found", "Product not found");
    const buyer = buyerDetailsSchema.parse(request.body ?? {});
    return createCheckout(businessId, {
      amount: product.priceSats.toString(),
      description: product.name,
      reference: `store_${product.id}_${randomToken(6)}`,
      ...buyer,
    });
  });

  app.get("/public/links/:slug", async (request) => {
    const { slug } = request.params as { slug: string };
    const link = await prisma.paymentLink.findUnique({ where: { slug }, include: { product: true, business: true } });
    if (!link || link.status !== "active" || !link.product.active) {
      throw new ApiError(404, "not_found", "This payment link is not active");
    }
    return { businessName: link.business.name, businessId: link.businessId, product: productView(link.product) };
  });

  app.post("/public/links/:slug/checkout", async (request) => {
    const { slug } = request.params as { slug: string };
    const link = await prisma.paymentLink.findUnique({ where: { slug }, include: { product: true } });
    if (!link || link.status !== "active" || !link.product.active) {
      throw new ApiError(404, "not_found", "This payment link is not active");
    }
    const buyer = buyerDetailsSchema.parse(request.body ?? {});
    return createCheckout(link.businessId, {
      amount: link.product.priceSats.toString(),
      description: link.product.name,
      reference: `link_${link.slug}_${randomToken(6)}`,
      ...buyer,
    });
  });

  app.post("/webhooks/telegram/:secret", async (request) => {
    const { secret } = request.params as { secret: string };
    const header = request.headers["x-telegram-bot-api-secret-token"];
    return handleTelegramWebhook(
      secret,
      request.body as { message?: { text?: string; chat?: { id: number } } },
      typeof header === "string" ? header : undefined,
    );
  });

  app.post("/webhooks/bitnob", async (request, reply) => {
    if (!env.bitnobWebhookSecret) {
      throw new ApiError(
        503,
        "payouts_unconfigured",
        "Local withdrawal webhooks are not configured. Set BITNOB_WEBHOOK_SECRET from the Bitnob dashboard, and expose a public API_URL that reaches POST /webhooks/bitnob.",
      );
    }
    const raw = request.body as Buffer;
    const signature = request.headers["x-bitnob-signature"];
    if (typeof signature !== "string" || !verifyHmacSha512(raw, signature, env.bitnobWebhookSecret)) {
      throw new ApiError(401, "invalid_signature", "Payout webhook signature did not match");
    }
    const event = JSON.parse(raw.toString("utf8")) as { event_id?: string; event?: string; data?: { reference?: string; id?: string; quote_id?: string } };
    if (!event.event_id || !event.event) throw new ApiError(400, "invalid_event", "Payout webhook is missing an event id");
    const claim = await prisma.webhookEvent.createMany({ data: [{ id: event.event_id, type: event.event, payload: event, status: "processing" }] }).catch(() => null);
    if (!claim) return reply.status(200).send({ duplicate: true });
    const payoutMatch = [event.data?.id ? { providerPayout: event.data.id } : null, event.data?.quote_id ? { providerQuote: event.data.quote_id } : null].filter((value): value is { providerPayout: string } | { providerQuote: string } => value !== null);
    if (payoutMatch.length && event.event === "payouts.withdrawal.success") {
      await prisma.withdrawal.updateMany({ where: { OR: payoutMatch, kind: "local", status: "processing" }, data: { status: "completed" } });
    }
    if (payoutMatch.length && (event.event === "payouts.withdrawal.failed" || event.event === "payouts.withdrawal.expired")) {
      await prisma.withdrawal.updateMany({ where: { OR: payoutMatch, kind: "local", status: "processing" }, data: { status: "failed" } });
    }
    await prisma.webhookEvent.update({ where: { id: event.event_id }, data: { status: "done", processedAt: new Date() } });
    return { ok: true };
  });

  return app;
}

function businessView(business: { id: string; name: string; country: string; balanceSats: bigint; reservedSats: bigint; aiMode: string; openaiModel: string; openaiKeyCipher: string | null }) {
  return {
    id: business.id,
    name: business.name,
    storefrontUrl: `${env.appUrl}/store/${business.id}`,
    country: business.country,
    balanceSats: sats(business.balanceSats),
    reservedSats: sats(business.reservedSats),
    availableSats: sats(business.balanceSats - business.reservedSats),
    aiMode: business.aiMode,
    openaiModel: business.openaiModel,
    hasOwnKey: Boolean(business.openaiKeyCipher),
    network: configuredLightningNetwork(),
  };
}

function productView(product: { id: string; name: string; description: string; priceSats: bigint; active: boolean }) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    priceSats: sats(product.priceSats),
    active: product.active,
  };
}

async function setSession(reply: FastifyReply, userId: string, body: unknown) {
  const token = randomToken();
  await prisma.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) },
  });
  reply.setCookie("flow_session", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return body;
}

async function ownedPayment(businessId: string, id: string) {
  const payment = await prisma.payment.findFirst({ where: { id, businessId }, include: { order: true } });
  if (!payment) throw new ApiError(404, "not_found", "Payment not found");
  return payment;
}

async function withIdempotency(request: FastifyRequest, businessId: string, run: () => Promise<unknown>) {
  const key = request.headers["idempotency-key"];
  if (!isValidIdempotencyKey(key)) {
    throw new ApiError(400, "idempotency_key_required", "Send an Idempotency-Key header");
  }
  const requestHash = sha256Hex(JSON.stringify(request.body ?? {}));
  const existing = await prisma.idempotencyKey.findUnique({ where: { businessId_key: { businessId, key } } });
  if (existing) {
    if (existing.requestHash !== requestHash) throw new ApiError(409, "idempotency_conflict", "That key was used for a different request");
    return existing.responseJson;
  }
  const response = await run();
  await prisma.idempotencyKey.create({
    data: { businessId, key, requestHash, statusCode: 200, responseJson: response as object },
  });
  return response;
}

function paymentLinkView(link: { id: string; slug: string; status: string; productId: string }) {
  return {
    id: link.id,
    productId: link.productId,
    slug: link.slug,
    url: `${env.appUrl}/pay/link/${link.slug}`,
    status: link.status,
  };
}

async function createPaymentLink(businessId: string, input: { productId: string }) {
  const product = await prisma.product.findFirst({ where: { id: input.productId, businessId, active: true } });
  if (!product) throw new ApiError(404, "not_found", "That product is not available");
  const existing = await prisma.paymentLink.findFirst({
    where: { businessId, productId: product.id, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return paymentLinkView(existing);
  const link = await prisma.paymentLink.create({
    data: { businessId, productId: product.id, slug: randomToken(8) },
  });
  return paymentLinkView(link);
}

async function listPaymentLinks(businessId: string) {
  const links = await prisma.paymentLink.findMany({ where: { businessId }, orderBy: { createdAt: "desc" } });
  return links.map(paymentLinkView);
}

async function retrievePaymentLink(businessId: string, id: string) {
  const link = await prisma.paymentLink.findFirst({ where: { id, businessId } });
  if (!link) throw new ApiError(404, "not_found", "Payment link not found");
  return paymentLinkView(link);
}

function webhookEndpointView(endpoint: { id: string; url: string; createdAt: Date }) {
  return { id: endpoint.id, url: endpoint.url, createdAt: endpoint.createdAt.toISOString() };
}

async function createWebhookEndpoint(businessId: string, input: { url: string }) {
  const secret = `flw_whsec_${randomToken(24)}`;
  const endpoint = await prisma.webhookEndpoint.create({
    data: { businessId, url: input.url, secretCipher: encrypt(secret) },
  });
  return { ...webhookEndpointView(endpoint), secret };
}

async function listWebhookEndpoints(businessId: string) {
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { businessId }, orderBy: { createdAt: "desc" } });
  return endpoints.map(webhookEndpointView);
}

async function deleteWebhookEndpoint(businessId: string, id: string) {
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, businessId } });
  if (!endpoint) throw new ApiError(404, "not_found", "Webhook endpoint not found");
  await prisma.webhookEndpoint.delete({ where: { id: endpoint.id } });
  return { ok: true };
}
