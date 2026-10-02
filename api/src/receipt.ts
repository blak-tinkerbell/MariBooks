/**
 * Receipt/invoice extraction with Amazon Textract (AnalyzeExpense).
 *
 * AnalyzeExpense is purpose-built for receipts and invoices: it returns structured summary
 * fields (TOTAL, INVOICE_RECEIPT_DATE, VENDOR_NAME, …) with per-field confidence, so there is
 * no model to train and no prompt to tune. We read the file the owner just uploaded to S3,
 * map the fields we care about, and — exactly like the SMS parser — treat the result as
 * untrusted: amounts, dates and currency are re-validated against the domain before they are
 * offered to prefill the capture form, which the owner always confirms before saving.
 */
import {
  AnalyzeExpenseCommand,
  TextractClient,
  type ExpenseField,
} from "@aws-sdk/client-textract";
import { CURRENCIES, type Currency, type ReceiptDraft } from "@maribooks/shared";
import { bucketName, keyBelongsToTenant } from "./s3.js";

// Textract is not available in every region (notably not af-south-1), and AnalyzeExpense with an
// S3 object requires the bucket and the Textract call to share a region. TEXTRACT_REGION lets us
// point at the region where the proof bucket actually lives (see infra); it falls back to the
// Lambda's region only when unset.
const TEXTRACT_REGION = process.env.TEXTRACT_REGION || process.env.AWS_REGION;

let client: TextractClient | null = null;
const textract = () => (client ??= new TextractClient({ region: TEXTRACT_REGION }));

const DEC = /^\d+(\.\d{1,2})?$/;

const CURRENCY_HINTS: [RegExp, Currency][] = [
  [/\b(usd|us\$|\$)\b/i, "USD"],
  [/\b(zwg|zig)\b/i, "ZiG"],
  [/\b(zar|rand|\br\b)/i, "ZAR"],
];

/** Pull the typed value and confidence out of a summary field. */
function field(fields: ExpenseField[], type: string): { text: string; confidence: number } | null {
  const f = fields.find((x) => x.Type?.Text === type);
  const text = f?.ValueDetection?.Text?.trim();
  if (!text) return null;
  return { text, confidence: f?.ValueDetection?.Confidence ?? 0 };
}

/** Normalise a money string: strip currency words/symbols and thousands separators. */
function cleanAmount(raw: string): string | undefined {
  const m = raw.replace(/[^\d.,]/g, "").replace(/,/g, "");
  if (!m) return undefined;
  const n = m.includes(".") ? m : `${m}.00`;
  return DEC.test(n) && Number(n) > 0 ? Number(n).toFixed(2) : undefined;
}

/** Best-effort date normalisation to yyyy-mm-dd; returns undefined if it can't be sure. */
function cleanDate(raw: string): string | undefined {
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2}|\d{2})\b/.exec(raw);
  if (dmy) {
    const y = dmy[3]!.length === 2 ? `20${dmy[3]}` : dmy[3]!;
    const d = dmy[1]!.padStart(2, "0");
    const mo = dmy[2]!.padStart(2, "0");
    if (Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31) return `${y}-${mo}-${d}`;
  }
  return undefined;
}

function detectCurrency(...texts: (string | undefined)[]): Currency | undefined {
  const hay = texts.filter(Boolean).join(" ");
  for (const [re, cur] of CURRENCY_HINTS) {
    if (re.test(hay) && (CURRENCIES as readonly string[]).includes(cur)) return cur;
  }
  return undefined;
}

/**
 * Analyse a proof file already uploaded to S3 and return a validated draft.
 * `kind` records whether the owner tagged it an invoice or a receipt (display only).
 * Throws if the key is not inside the caller's own tenant prefix.
 */
export async function scanReceipt(
  tenantId: string,
  key: string,
  kind: "RECEIPT" | "INVOICE",
): Promise<ReceiptDraft> {
  if (!keyBelongsToTenant(tenantId, key)) {
    throw new Error("Proof key does not belong to this tenant");
  }

  const res = await textract().send(
    new AnalyzeExpenseCommand({
      Document: { S3Object: { Bucket: bucketName(), Name: key } },
    }),
  );

  const draft: ReceiptDraft = { kind, confidence: "LOW", source: "TEXTRACT" };
  const fields = res.ExpenseDocuments?.[0]?.SummaryFields ?? [];
  if (fields.length === 0) return draft;

  const total = field(fields, "TOTAL") ?? field(fields, "AMOUNT_DUE") ?? field(fields, "SUBTOTAL");
  const date = field(fields, "INVOICE_RECEIPT_DATE");
  const vendor = field(fields, "VENDOR_NAME") ?? field(fields, "RECEIVER_NAME");

  const confidences: number[] = [];
  if (total) {
    const amt = cleanAmount(total.text);
    if (amt) {
      draft.amount = amt;
      confidences.push(total.confidence);
    }
  }
  if (date) {
    const d = cleanDate(date.text);
    if (d) {
      draft.date = d;
      confidences.push(date.confidence);
    }
  }
  if (vendor && vendor.text.length <= 60) {
    draft.vendor = vendor.text;
  }
  const cur = detectCurrency(total?.text, ...fields.map((f) => f.ValueDetection?.Text ?? undefined));
  if (cur) draft.currency = cur;

  // Confidence band: driven by whether we got a usable amount, and Textract's own scores.
  const avg = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
  draft.confidence = draft.amount && avg >= 90 ? "HIGH" : draft.amount ? "MEDIUM" : "LOW";
  return draft;
}
