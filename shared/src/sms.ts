/**
 * Payment-SMS parser — turns a pasted mobile-money / bank confirmation message into a draft
 * transaction, so an owner can record money by pasting the SMS they already received.
 *
 * Deterministic and offline: runs in the browser with no network. The API can optionally
 * refine low-confidence results with an LLM (Amazon Bedrock); this parser is always the
 * first pass and the fallback. It never guesses silently — every field it could not find is
 * left undefined and `confidence` says how much of the draft is trustworthy.
 */

import type { Currency, Direction, Rail } from "./types.js";

export interface SmsDraft {
  amount?: string; // decimal string, principal
  currency?: Currency;
  direction?: Direction;
  rail?: Rail;
  fee?: string; // rail charge, same currency
  imtt?: string; // IMTT / transfer tax, same currency
  counterparty?: string;
  reference?: string;
  date?: string; // yyyy-mm-dd when the SMS carries one
  confidence: "HIGH" | "MEDIUM" | "LOW";
  source: "RULES" | "AI";
}

const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
const CUR = String.raw`(USD|US\$|\$|ZWG|ZiG|ZAR|R)`;

const CURRENCY_MAP: Record<string, Currency> = {
  usd: "USD",
  us$: "USD",
  $: "USD",
  zwg: "ZiG",
  zig: "ZiG",
  zar: "ZAR",
  r: "ZAR",
};

const RAIL_WORDS: [RegExp, Rail][] = [
  [/\becocash\b/i, "ECOCASH"],
  [/\bone ?money\b/i, "ONEMONEY"],
  [/\binnbucks\b/i, "INNBUCKS"],
  [/\bzipit\b/i, "ZIPIT"],
  [/\b(pos|swipe|card|visa|mastercard)\b/i, "CARD"],
  [/\b(bank|cbz|stanbic|steward|fbc|nmb|cabs|zb|ecobank|first capital|rtgs|account)\b/i, "BANK"],
  [/\bcash\b/i, "CASH"],
];

const IN_WORDS = /\b(received|you have received|credited|deposit(?:ed)?|cash[- ]?in|payment from|incoming)\b/i;
const OUT_WORDS = /\b(paid|sent|payment to|transfer(?:red)? to|debited|withdraw(?:n|al)?|cash[- ]?out|purchase|bought)\b/i;

function clean(n: string): string {
  const s = n.replace(/,/g, "");
  return s.includes(".") ? s : `${s}.00`;
}

/** Remove "balance ... <amount>" segments so a running balance is never read as the amount. */
function stripBalances(text: string): string {
  return text.replace(
    new RegExp(String.raw`(new |available |your )?bal(ance)?\.?\s*(is|:)?\s*${CUR}?\s*${NUM}\s*${CUR}?`, "gi"),
    " ",
  );
}

function findAmount(text: string): { amount: string; currency?: Currency } | null {
  const prefixed = new RegExp(String.raw`${CUR}\s?${NUM}`, "i").exec(text);
  const suffixed = new RegExp(String.raw`${NUM}\s?(USD|ZWG|ZiG|ZAR)\b`, "i").exec(text);
  const pick =
    prefixed && suffixed ? (prefixed.index <= suffixed.index ? "pre" : "suf") : prefixed ? "pre" : suffixed ? "suf" : null;
  if (pick === "pre" && prefixed) {
    return { amount: clean(prefixed[2]!), currency: CURRENCY_MAP[prefixed[1]!.toLowerCase()] };
  }
  if (pick === "suf" && suffixed) {
    return { amount: clean(suffixed[1]!), currency: CURRENCY_MAP[suffixed[2]!.toLowerCase()] };
  }
  // A bare number after "of" / "amount" as a last resort.
  const bare = new RegExp(String.raw`\b(?:of|amount|amt)[:\s]+${NUM}`, "i").exec(text);
  return bare ? { amount: clean(bare[1]!) } : null;
}

function findCharge(text: string, words: RegExp): string | undefined {
  const m = new RegExp(String.raw`(?:${words.source})[^\d]{0,24}?${CUR}?\s?${NUM}`, "i").exec(text);
  return m ? clean(m[2]!) : undefined;
}

function findDirection(text: string): Direction | undefined {
  const i = IN_WORDS.exec(text);
  const o = OUT_WORDS.exec(text);
  if (i && o) return i.index <= o.index ? "IN" : "OUT";
  if (i) return "IN";
  if (o) return "OUT";
  return undefined;
}

function findDate(text: string): string | undefined {
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2}|\d{2})\b/.exec(text);
  if (dmy) {
    const y = dmy[3]!.length === 2 ? `20${dmy[3]}` : dmy[3]!;
    const d = dmy[1]!.padStart(2, "0");
    const m = dmy[2]!.padStart(2, "0");
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) return `${y}-${m}-${d}`;
  }
  return undefined;
}

export function parseMoneySms(raw: string): SmsDraft {
  const text = raw.replace(/\s+/g, " ").trim();
  const body = stripBalances(text);
  const draft: SmsDraft = { confidence: "LOW", source: "RULES" };

  const imtt = findCharge(body, /imtt|tax|levy/);
  const fee = findCharge(body, /charge[sd]?|fee|commission/);

  // Look for the principal only before the first charge mention, so a fee isn't read as it.
  const chargeAt = body.search(/\b(imtt|tax|levy|charge[sd]?|fee|commission)\b/i);
  const principalZone = chargeAt > 0 ? body.slice(0, chargeAt) : body;
  const amt = findAmount(principalZone) ?? findAmount(body);

  if (amt) {
    draft.amount = amt.amount;
    draft.currency = amt.currency;
  }
  if (fee && fee !== draft.amount) draft.fee = fee;
  if (imtt && imtt !== draft.amount) draft.imtt = imtt;

  draft.direction = findDirection(body);
  for (const [re, rail] of RAIL_WORDS) {
    if (re.test(text)) {
      draft.rail = rail;
      break;
    }
  }

  const party = /\b(?:from|to)\s+([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,3})/.exec(body);
  if (party) draft.counterparty = party[1]!.trim();

  const ref = /\b(?:ref(?:erence)?|txn ?id|trans(?:action)? ?id|approval code)[\s:.#-]*([A-Z0-9][A-Z0-9.]{3,})/i.exec(text);
  if (ref) draft.reference = ref[1]!.replace(/\.+$/, "");

  draft.date = findDate(text);

  const core = [draft.amount, draft.currency, draft.direction].filter(Boolean).length;
  draft.confidence = core === 3 ? "HIGH" : core === 2 ? "MEDIUM" : "LOW";
  return draft;
}
