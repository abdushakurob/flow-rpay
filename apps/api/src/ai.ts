import { prisma } from "@flow/db";
import { env } from "./env.js";
import { ApiError } from "./errors.js";
import { decrypt } from "./crypto.js";

type ToolCall = { id: string; function: { name: string; arguments: string } };
type Message = { role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string };

async function credentials(businessId: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw new ApiError(404, "not_found", "Business not found");
  if (business.aiMode === "byok") {
    if (!business.openaiKeyCipher) {
      throw new ApiError(
        422,
        "ai_key_missing",
        "Add your OpenAI key in Settings (My OpenAI key), or switch Assistant mode back to Flow AI",
      );
    }
    return {
      apiKey: decrypt(business.openaiKeyCipher),
      model: business.openaiModel?.trim() || "gpt-4.1",
    };
  }
  const serverKey = env.openaiApiKey.trim();
  if (!serverKey) {
    throw new ApiError(
      503,
      "ai_unconfigured",
      "Flow AI needs OPENAI_API_KEY in the server .env (restart after pasting). Or use Settings → My OpenAI key (BYOK). Payments still work without it.",
    );
  }
  return { apiKey: serverKey, model: env.openaiModel.trim() || "gpt-4.1" };
}

async function runTool(
  businessId: string,
  name: string,
  args: Record<string, string>,
  audience: "merchant" | "customer",
) {
  if (audience === "customer" && name !== "searchProducts") {
    throw new ApiError(400, "unknown_tool", "That action is not available");
  }
  if (name === "searchProducts") {
    const products = await prisma.product.findMany({
      where: {
        businessId,
        active: true,
        name: args.query ? { contains: args.query, mode: "insensitive" } : undefined,
      },
      take: 10,
    });
    return products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      priceSats: product.priceSats.toString(),
    }));
  }
  if (name === "listUnpaidOrders") {
    const orders = await prisma.order.findMany({
      where: { businessId, status: "pending_payment" },
      take: 20,
      orderBy: { createdAt: "desc" },
    });
    return orders.map((order) => ({
      reference: order.reference,
      description: order.description,
      amountSats: order.amountSats.toString(),
      status: order.status,
    }));
  }
  if (name === "paymentSummary") {
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    const paid = await prisma.payment.count({ where: { businessId, status: "paid" } });
    return {
      availableSats: ((business?.balanceSats ?? 0n) - (business?.reservedSats ?? 0n)).toString(),
      paidCount: paid,
    };
  }
  throw new ApiError(400, "unknown_tool", "That action is not available");
}

const tools = [
  {
    type: "function",
    function: {
      name: "searchProducts",
      description: "List this business's products and their sat prices",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listUnpaidOrders",
      description: "List orders that are still unpaid",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "paymentSummary",
      description: "Read the available sat balance and paid count. Merchant only.",
      parameters: { type: "object", properties: {} },
    },
  },
];

export async function assist(businessId: string, prompt: string, audience: "merchant" | "customer") {
  const auth = await credentials(businessId);
  const allowed = audience === "merchant" ? tools : tools.filter((tool) => tool.function.name === "searchProducts");
  const system =
    audience === "customer"
      ? "You are Flow, a customer storefront assistant on Telegram for Bitcoin testnet. Use searchProducts for every product and price. If a tool returns nothing, say you do not have that product. Never invent products, prices, or payment confirmations. Do not claim a payment succeeded. Financial actions need an explicit customer confirmation; if they ask to buy or pay, say a merchant payment link is required and do not invent one."
      : "You are Flow, a testnet commerce assistant for merchants. Prices are satoshis on Bitcoin testnet. Use tools for every product, price, unpaid order, balance, and payment fact. If a tool returns nothing, say you do not have that data. Never invent products, prices, balances, or payment confirmations. Do not claim a payment or withdrawal succeeded. Any financial action (pay, withdraw, refund, create invoice) needs explicit merchant confirmation before you say it will happen.";
  const messages: Message[] = [
    { role: "system", content: system },
    { role: "user", content: prompt },
  ];

  for (let step = 0; step < 4; step += 1) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: auth.model, messages, tools: allowed }),
    });
    const json = (await response.json()) as {
      error?: { message?: string };
      choices?: { message: Message }[];
    };
    if (!response.ok) {
      throw new ApiError(502, "ai_error", json.error?.message ?? "The assistant request failed");
    }
    const message = json.choices?.[0]?.message;
    if (!message) throw new ApiError(502, "ai_error", "The assistant returned an empty response");
    messages.push(message);
    if (!message.tool_calls?.length) return { reply: message.content ?? "" };
    for (const call of message.tool_calls) {
      let args: Record<string, string> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, string>;
      } catch {
        throw new ApiError(502, "ai_error", "The assistant sent an invalid tool call");
      }
      const result = await runTool(businessId, call.function.name, args, audience);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  throw new ApiError(502, "ai_error", "The assistant did not finish");
}
