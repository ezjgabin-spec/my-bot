// Rates in nanodollars per token. 3,000 means $3 per million tokens.
// Versioned configuration: reconcile these estimates with the provider invoice.
export type ModelRates = {
  version: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
};
export const SONNET_RATES: ModelRates = {
  version: "sonnet-4-6-standard-2026-10",
  input: 3000,
  output: 15000,
  cacheRead: 300,
  cacheWrite5m: 3750,
  cacheWrite1h: 6000,
};
export function modelRates(model: string): ModelRates {
  const overrides = process.env.AI_PRICING_JSON;
  const rates = overrides
    ? (JSON.parse(overrides) as Record<string, ModelRates>)[model]
    : model === "claude-sonnet-4-6"
      ? SONNET_RATES
      : undefined;
  if (
    !rates ||
    !rates.version ||
    ![
      rates.input,
      rates.output,
      rates.cacheRead,
      rates.cacheWrite5m,
      rates.cacheWrite1h,
    ].every((n) => Number.isSafeInteger(n) && n > 0)
  )
    throw new Error(
      "This AI model needs a verified pricing configuration before it can be used.",
    );
  return rates;
}
export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: {
    ephemeral_5m_input_tokens: number;
    ephemeral_1h_input_tokens: number;
  } | null;
};
export function usageCost(usage: TokenUsage, rates: ModelRates) {
  const input = usage.input_tokens,
    output = usage.output_tokens;
  const read = usage.cache_read_input_tokens ?? 0;
  const created = usage.cache_creation_input_tokens ?? 0;
  const oneHour = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const fiveMinute =
    usage.cache_creation?.ephemeral_5m_input_tokens ?? created - oneHour;
  if (
    ![input, output, read, created, oneHour, fiveMinute].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    oneHour + fiveMinute !== created
  )
    throw new Error("Invalid provider usage");
  const cost = Math.ceil(
    (input * rates.input +
      output * rates.output +
      read * rates.cacheRead +
      fiveMinute * rates.cacheWrite5m +
      oneHour * rates.cacheWrite1h) /
      1000,
  );
  if (!Number.isSafeInteger(cost)) throw new Error("Invalid provider cost");
  return { cost, input, output, cacheRead: read, cacheWrite: created };
}
