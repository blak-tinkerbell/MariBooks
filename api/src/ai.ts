/**
 * Optional Amazon Bedrock refinement for pasted payment SMS.
 *
 * The deterministic parser in @maribooks/shared always runs first. Bedrock is only consulted
 * when that result is not HIGH confidence AND a model is configured (BEDROCK_MODEL_ID). The
 * model's answer is treated as untrusted input: every field is re-validated against the domain
 * enums and decimal format before it is returned, and fields the rules already found win.
 */
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  CURRENCIES,
  RAILS,
  parseMoneySms,
  type Currency,
  type Rail,
  type SmsDraft,
} from "@maribooks/shared";

const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "";
const REGION = process.env.BEDROCK_REGION || process.env.AWS_REGION;

let client: BedrockRuntimeClient | null = null;

const SYSTEM = `You extract one payment from a Zimbabwean mobile-money or bank SMS.
Reply with ONLY a JSON object, no prose, with these optional keys:
amount (principal as a decimal string, no commas), currency ("USD" | "ZiG" | "ZAR"; ZWG means ZiG),
direction ("IN" if the owner received money, "OUT" if they paid/sent),
rail ("CASH" | "ECOCASH" | "ONEMONEY" | "INNBUCKS" | "ZIPIT" | "BANK" | "CARD"),
fee (rail charge, decimal string), imtt (IMTT/transfer tax, decimal string),
counterparty (name of the other party), reference, date (yyyy-mm-dd).
Never use the account balance as the amount. Omit any key you are not sure of.`;

const DEC = /^\d+(\.\d{1,2})?$/;

function pick(obj: Record<string, unknown>): Partial<SmsDraft> {
  const out: Partial<SmsDraft> = {};
  const s = (k: string) => (typeof obj[k] === "string" ? (obj[k] as string).trim() : undefined);
  const amount = s("amount")?.replace(/,/g, "");
  if (amount && DEC.test(amount) && Number(amount) > 0) out.amount = amount;
  const cur = s("currency");
  if (cur && (CURRENCIES as readonly string[]).includes(cur)) out.currency = cur as Currency;
  const dir = s("direction");
  if (dir === "IN" || dir === "OUT") out.direction = dir;
  const rail = s("rail");
  if (rail && (RAILS as readonly string[]).includes(rail)) out.rail = rail as Rail;
  const fee = s("fee");
  if (fee && DEC.test(fee)) out.fee = fee;
  const imtt = s("imtt");
  if (imtt && DEC.test(imtt)) out.imtt = imtt;
  const cp = s("counterparty");
  if (cp && cp.length <= 60) out.counterparty = cp;
  const ref = s("reference");
  if (ref && ref.length <= 60) out.reference = ref;
  const date = s("date");
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) out.date = date;
  return out;
}

export function aiEnabled(): boolean {
  return MODEL_ID.length > 0;
}

export async function parseSms(text: string): Promise<SmsDraft> {
  const rules = parseMoneySms(text);
  if (rules.confidence === "HIGH" || !aiEnabled()) return rules;

  try {
    client ??= new BedrockRuntimeClient({ region: REGION });
    const res = await client.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: SYSTEM }],
        messages: [{ role: "user", content: [{ text }] }],
        inferenceConfig: { maxTokens: 300, temperature: 0 },
      }),
    );
    const reply = res.output?.message?.content?.find((c) => "text" in c)?.text ?? "";
    const json = reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1);
    const ai = pick(JSON.parse(json) as Record<string, unknown>);
    // Rules win where they found something; the model fills the gaps.
    const merged: SmsDraft = { ...ai, ...stripUndefined(rules), source: "AI", confidence: "LOW" };
    const core = [merged.amount, merged.currency, merged.direction].filter(Boolean).length;
    merged.confidence = core === 3 ? "HIGH" : core === 2 ? "MEDIUM" : "LOW";
    return merged;
  } catch (err) {
    console.warn("Bedrock refinement failed; returning rules result", err);
    return rules;
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
