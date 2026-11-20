import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const satsSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "Amount must be a positive integer number of sats")
  .refine((value) => BigInt(value) <= 100_000_000n, "Amount is above 1 BTC");

export const checkoutCreateSchema = z.object({
  amount: satsSchema,
  description: z.string().trim().min(1).max(280),
  reference: z.string().trim().min(1).max(80),
});

export const productCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).default(""),
  priceSats: satsSchema,
});

export const bitcoinWithdrawalSchema = z
  .object({
    amount: satsSchema,
    address: z.string().trim().min(1).optional(),
    invoice: z.string().trim().min(1).optional(),
  })
  .refine((value) => Boolean(value.address) !== Boolean(value.invoice), {
    message: "Provide a Bitcoin address or a Lightning invoice",
  });

export const localQuoteSchema = z.object({
  amount: satsSchema,
  country: z.string().trim().length(2),
  currency: z.string().trim().min(3).max(8),
});

export const localWithdrawalSchema = localQuoteSchema.extend({
  quoteId: z.string().trim().min(1),
  beneficiary: z.object({
    destinationType: z.enum(["bank", "mobile_money"]),
    accountName: z.string().trim().min(1).max(120),
    accountNumber: z.string().trim().min(1).max(64),
    bankCode: z.string().trim().max(32).optional(),
    network: z.string().trim().max(32).optional(),
  }),
});

export const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
  businessName: z.string().trim().min(1).max(80),
  country: z.string().trim().length(2),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const paymentLinkCreateSchema = z.object({
  productId: z.string().trim().min(1),
});

export const buyerDetailsSchema = z.object({
  buyerName: z.string().trim().max(120).optional(),
  buyerEmail: z.string().trim().email().max(254).optional(),
});

export const webhookEndpointCreateSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .refine((value) => value.startsWith("https://") || value.startsWith("http://localhost") || value.startsWith("http://127.0.0.1"), {
      message: "Webhook URL must be https, or http on localhost",
    }),
});

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function preimageMatches(preimageBase64: string, paymentHashHex: string): boolean {
  const preimage = Buffer.from(preimageBase64, "base64");
  if (preimage.length === 0) return false;
  return sha256Hex(preimage) === paymentHashHex.toLowerCase();
}

export function signHmacSha512(rawBody: Buffer | string, secret: string): string {
  return createHmac("sha512", secret).update(rawBody).digest("hex");
}

export function verifyHmacSha512(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = signHmacSha512(rawBody, secret);
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(signature, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isValidIdempotencyKey(key: unknown): key is string {
  return typeof key === "string" && key.length >= 8 && key.length <= 200;
}

export function availableSats(balance: bigint, reserved: bigint): bigint {
  return balance - reserved;
}
