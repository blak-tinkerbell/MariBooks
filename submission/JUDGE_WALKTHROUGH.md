# MariBooks — Judge's walkthrough (how to use the app)

A short, repeatable tour so you can see every scored feature in a few minutes, using a real
sample business. Nothing to install, no sign-up.

**Open:** https://d3vn6ch6zctfj4.cloudfront.net/?demo
*(Open in a private/incognito window for a clean start. The `?demo` link loads a demo business
kept only in your browser — it never touches live data.)*

**The demo business:** *TS Haute Couture* — Tryphine's boutique selling clothing and
accessories across **two branches** (Avondale and CBD). It trades mainly in **USD**, imports
stock from **China and Turkey**, runs **business-sourcing trips** (flights, hotels, transport),
treats **store renovations and display mannequins as assets**, and has **account clients who buy
on credit and settle at month-end**. Six months of records are pre-loaded, so every screen has
something to show.

> If a screen looks empty or shows old data, click **Reset demo** in the sidebar/Settings, or
> reopen the `?demo` link. The data is deterministic — the figures are the same on every load.

---

## 1 minute: the one-question dashboard

The landing screen answers one question: **"Are you making money?"**

1. Read the big number and the plain-language yes/no sentence under it.
2. Change **Period** (top-right of the hero): *This month → Last month → Last 90 days →
   All time*. Watch profit, the trend arrow, and the six-month bar chart update.
3. Look at the four tiles: **Money in**, **Operating costs**, **Asset spend** (kept out of
   profit), and **Fees & IMTT** (what the rails cost her, as a % of money in).
4. **Cash by method** shows the net position per rail (card, cash, EcoCash, InnBucks, OneMoney,
   bank). **Recent activity** lists the latest entries with branch names in the notes.

**What to notice (Creativity & storytelling):** the first thing an owner sees is an answer, not a
ledger. The chevron motif and teal/marigold palette are drawn from Great Zimbabwe.

## 1 minute: multi-currency and dual rate basis

Still on the dashboard, use the **view controls** (currency + rate basis):

1. Switch currency **USD → ZiG → ZAR**. Every figure recalculates into that reporting currency.
2. Switch basis **Market rate → Official**. The label next to each figure changes with it.

**What to notice (Technical innovation):** amounts are stored in the currency they happened in
and translated only when a report is built. Each foreign entry carries the **market rate the
owner actually got**; a separate **official** rate table drives statutory-style figures. The
basis label travels with every number, so nothing is silently converted.

## 1 minute: record money, including "paste the SMS"

Go to **Record money** (sidebar, or the button on the dashboard).

1. **Type an entry:** toggle **Money in / Money out**, enter an amount, pick a currency and a
   rail. For ZiG/ZAR a **"market rate you got"** field appears — enter e.g. `18.20` for rand.
   The live preview on the right shows the USD equivalent, fee and IMTT.
2. **Fees as a percentage:** type `2` in IMTT and watch it compute the charge and keep it
   **separate from the principal** (so profit stays honest). There's a one-tap "add the usual 2%
   IMTT" shortcut for electronic money-out.
3. **Paste a payment SMS** (right-hand card). Paste this and click **Fill the form**:

   ```
   You paid USD 2,100.00 to Istanbul Textiles on 12/09/2026. Charge: USD 10.00 IMTT: USD 42.00 Ref TR8842
   ```

   The form fills itself — amount, currency, direction, rail, fee, IMTT, reference, date — and
   says how confident it was. It reads the amount, not the running balance.
4. **See validation** (Communication quality): try an amount like `12.345`, a fee of `150`, or a
   future date. Each shows a plain-language message next to the field, in-line.

**What to notice:** this is how the boutique records a China/Turkey stock payment or a daily
sale in seconds. The SMS parser runs offline in the browser; low-confidence messages can
optionally be refined by Amazon Bedrock on the server, then re-validated.

## 30 seconds: assets kept out of profit

1. On **Record money**, choose **Money out**, tick **"This is an asset"**, and pick a kind
   (e.g. *Property* for a store renovation, *Furniture & fittings* for mannequins).
2. Note the helper text: an asset is **kept out of the month's profit** and **added to the
   credit passport** as a declared asset base.

The demo already contains store renovations (Property) and mannequins/shelving (Furniture) — you
can see them on the **Credit passport** screen as the declared asset base.

## 1 minute: lender-ready statement

Go to **Statement**.

1. Pick a **period** (e.g. a single month, or all time).
2. Read the income statement: **money in**, **operating costs by category** (Stock, Rent,
   Wages, Transport, Fees, Other), **net profit and margin**, and **assets listed below the
   line** (not mixed into profit). The **rate basis and currency** are disclosed on the report.
3. Click **Download PDF** — this is the artifact an owner hands to a lender.

**What to notice:** business-trip costs (flights, hotels, transport) appear under **Transport**;
imported stock appears under **Stock**; renovations/mannequins appear as **assets**, not costs.

## 1 minute: credit passport, with consent

Go to **Credit passport**.

1. Read the summary: **average monthly turnover**, **cash-flow stability**, **length of
   continuous records**, **declared assets**, and a **4-point readiness check** a lender looks
   for.
2. **Share with a lender:** sharing requires an **explicit consent** tick. Create a share
   (there's a sample lender share already present), then **revoke** it.
3. Note that entries included in an **active share are locked** against edit/delete — a lender
   always sees exactly what was sent.

**What to notice (Community & market impact):** the same records that tell the owner her profit
become a trustworthy, consent-gated history she can show a lender — and take back.

## 30 seconds: works on a bad connection

This is best seen in a **signed-in (live) account** rather than the demo, but worth knowing:

- If a save fails because the connection dropped, the entry is **kept on the device** and synced
  when the connection returns. Client-generated ids are idempotency keys, so a resend **never
  duplicates**. The app shell loads offline.

---

## What maps to each judging axis

| Axis | Where to look |
|---|---|
| **Creativity & storytelling** | Dashboard "Are you making money?" hero; branch-aware notes; the place-rooted design. |
| **Technical innovation** | Currency/basis toggles on the dashboard; fees/IMTT kept separate on Record; the SMS parser; assets excluded from profit; consent-locked sharing. |
| **Community & market impact** | Credit passport + statement — a notebook becomes a lender-ready history, with consent. |
| **Communication quality** | In-line validation on Record; disclosed rate basis on every figure; this guide + the spec in `.kiro/specs/maribooks-mvp/`. |

## Full tour in order (copy/paste checklist)

1. Open `…/?demo` in a private window.
2. **Dashboard:** change Period; switch USD → ZiG → ZAR; switch Market → Official.
3. **Record money:** type a ZAR sale with a market rate; add 2% IMTT; paste the SMS above;
   trigger a validation error.
4. **Record money → asset:** tick "This is an asset", choose Property/Furniture.
5. **Statement:** pick a period → Download PDF.
6. **Credit passport:** read the readiness check; create a consented share; revoke it.
7. (Optional) **Settings:** change the business name; **Reset demo** to restore the sample.

*This is clearly-labelled sample data — the business name ends in "(demo)" and any shared
passport names an example lender — so it is never mistaken for real trading records.*
