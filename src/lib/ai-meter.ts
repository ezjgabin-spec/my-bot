import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "./server";
import { reserveUsage, settleUsage } from "./billing";
import { modelRates, usageCost } from "./ai-pricing";
import type { UsageReceipt } from "./plans";

export async function meteredMessage(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  operation: UsageReceipt["operation"],
) {
  let rates;
  try {
    rates = modelRates(params.model);
  } catch {
    throw new AppError(
      "The owner needs to configure pricing for this AI model before requests can run.",
      503,
    );
  }
  // Count the actual prompt and tool schema before reserving money. No text or
  // answers enter the usage ledger. Disable SDK retries: each call is metered.
  const counted = await client.messages.countTokens({
    model: params.model,
    messages: params.messages,
    system: params.system,
    tools: params.tools,
    tool_choice: params.tool_choice,
  });
  if (
    !Number.isSafeInteger(counted.input_tokens) ||
    counted.input_tokens < 0 ||
    counted.input_tokens > 190_000
  )
    throw new AppError(
      "This request is too large. Split the source into smaller sections.",
      413,
    );
  // A margin covers small differences between counting and completion usage.
  const inputReserve = Math.ceil(
    ((counted.input_tokens + 1024) * rates.input) / 1000,
  );
  const requested =
    inputReserve + Math.ceil((params.max_tokens * rates.output) / 1000);
  const minimumOutput = operation === "interpretation" ? 600 : 2000;
  const receipt = await reserveUsage(
    { operation, model: params.model, pricingVersion: rates.version },
    requested,
    inputReserve + Math.ceil((minimumOutput * rates.output) / 1000),
  );
  const maxTokens = Math.min(
    params.max_tokens,
    Math.floor(((receipt.reserved - inputReserve) * 1000) / rates.output),
  );
  let message: Anthropic.Message;
  try {
    message = await client.messages.create(
      { ...params, max_tokens: maxTokens },
      { maxRetries: 0 },
    );
  } catch (error) {
    // Rejected HTTP requests have no generated output. Timeouts/5xx may have
    // incurred cost: keep the reservation pending instead of inventing a refund.
    const rejected =
      error instanceof Anthropic.APIError &&
      [400, 401, 403, 404, 413, 422, 429].includes(error.status ?? 0);
    await settleUsage(receipt.id, null, rejected);
    throw error;
  }
  try {
    const actual = usageCost(message.usage, rates);
    await settleUsage(receipt.id, {
      ...actual,
      providerId: message.id ?? null,
    });
  } catch {
    await settleUsage(receipt.id, null);
    throw new AppError(
      "The provider response needs a usage check. Your reservation is pending; open Plans & credits for details.",
      502,
    );
  }
  return message;
}
