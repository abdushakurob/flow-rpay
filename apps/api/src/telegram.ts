import { z } from "zod";
import { prisma } from "@flow/db";
import { assist } from "./ai.js";
import { decrypt, encrypt, randomToken } from "./crypto.js";
import { env } from "./env.js";
import { ApiError } from "./errors.js";

export const telegramConnectSchema = z.object({
  token: z.string().trim().min(20).max(200),
});

type TelegramMe = { id: number; username?: string; is_bot?: boolean };
type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id: number };
  };
};

async function telegramApi<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await response.json()) as { ok: boolean; description?: string; result?: T };
  if (!json.ok) {
    throw new ApiError(400, "telegram_error", json.description ?? "Telegram rejected the request");
  }
  return json.result as T;
}

function botView(bot: { username: string; status: string }) {
  return { connected: true as const, username: bot.username, status: bot.status };
}

export async function getTelegramStatus(businessId: string) {
  const bot = await prisma.telegramBot.findUnique({ where: { businessId } });
  if (!bot || bot.status !== "connected") return { connected: false as const };
  return botView(bot);
}

export async function connectTelegram(businessId: string, token: string) {
  const me = await telegramApi<TelegramMe>(token, "getMe");
  if (!me.is_bot || !me.username) {
    throw new ApiError(400, "telegram_error", "That token is not a Telegram bot");
  }

  const secret = randomToken(24);
  const webhookUrl = `${env.apiUrl}/webhooks/telegram/${secret}`;
  await telegramApi(token, "setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    drop_pending_updates: true,
    allowed_updates: ["message"],
  });

  const bot = await prisma.telegramBot.upsert({
    where: { businessId },
    create: {
      businessId,
      username: me.username,
      tokenCipher: encrypt(token),
      secret,
      status: "connected",
    },
    update: {
      username: me.username,
      tokenCipher: encrypt(token),
      secret,
      status: "connected",
    },
  });

  return botView(bot);
}

export async function disconnectTelegram(businessId: string) {
  const bot = await prisma.telegramBot.findUnique({ where: { businessId } });
  if (!bot) return { connected: false as const };

  const token = decrypt(bot.tokenCipher);
  await telegramApi(token, "deleteWebhook", { drop_pending_updates: true });
  await prisma.telegramBot.delete({ where: { id: bot.id } });
  return { connected: false as const };
}

export async function handleTelegramWebhook(secret: string, update: TelegramUpdate, secretHeader: string | undefined) {
  const bot = await prisma.telegramBot.findFirst({
    where: { secret, status: "connected" },
  });
  if (!bot) throw new ApiError(404, "not_found", "Unknown Telegram webhook");
  if (!secretHeader || secretHeader !== bot.secret) {
    throw new ApiError(401, "invalid_signature", "Telegram secret did not match");
  }

  const text = update.message?.text?.trim();
  const chatId = update.message?.chat?.id;
  if (!text || chatId === undefined) return { ok: true };

  const token = decrypt(bot.tokenCipher);
  try {
    const { reply } = await assist(bot.businessId, text, "customer");
    await telegramApi(token, "sendMessage", {
      chat_id: chatId,
      text: (reply || "I could not find an answer.").slice(0, 4000),
    });
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : "The assistant could not reply right now";
    await telegramApi(token, "sendMessage", {
      chat_id: chatId,
      text: message.slice(0, 4000),
    });
  }

  return { ok: true };
}
