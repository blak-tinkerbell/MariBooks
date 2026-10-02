# MariBooks — 2–3 minute demo video script

A tight shot list and narration for the submission video. Structure follows what judges look
for: **problem → live demo → architecture → what's next.** Keep it under 3 minutes; aim for ~2:30.

Record at 1280×720 or higher. Open the app in a private window first:
`https://d3vn6ch6zctfj4.cloudfront.net/?demo`. Have the architecture image
(`submission/architecture.png`) ready to cut to.

---

## 0:00–0:25 · The problem (talking head or voiceover over the dashboard)

> "This is Tryphine. She runs TS Haute Couture — a boutique with two branches in Harare. She
> buys stock in US dollars from China and Turkey, sells in dollars, card, EcoCash and rand, and
> some clients pay at month-end. At the end of the month she has a notebook full of numbers in
> three currencies — and still can't answer one question: *am I making money?* And because her
> records are scattered, no lender will give her the loan to open branch three."

*On screen:* the dashboard hero, "Are you making money?"

## 0:25–1:05 · One screen, one answer (screen capture — Dashboard)

> "MariBooks answers that in one screen."

- Point to the big profit figure and the plain-language sentence.
- Change **Period**: This month → Last 90 days → All time. "The same records, any window."
- Switch currency **USD → ZiG → ZAR**, then basis **Market rate → Official**.

> "Every amount is stored in the currency it happened in and converted only when I ask. She
> enters the *market rate she actually got* — and a separate official rate drives statutory
> reports. The basis label travels with every number, so nothing is silently converted."

- Glance at the tiles: money in, operating costs, **asset spend kept out of profit**, fees & IMTT.

## 1:05–1:40 · Record money, including paste-the-SMS (screen capture — Record)

> "Recording takes seconds — and she doesn't even have to type."

- Open **Record money**. Paste into the SMS box:
  `You paid USD 2,100.00 to Istanbul Textiles on 12/09/2026. Charge: USD 10.00 IMTT: USD 42.00 Ref TR8842`
- Click **Fill the form.** "It reads the amount, currency, direction, rail, fee, IMTT, reference
  and date — and it never mistakes a running balance for the amount."
- Tick **This is an asset**, choose *Furniture* / *Property*. "A store renovation or display
  mannequins aren't a cost of the month — they're assets that build her credit record."
- Quickly type a bad value (e.g. fee `150`) to show the inline validation message.

## 1:40–2:05 · Statement + credit passport (screen capture — Statement, Passport)

- Open **Statement**, pick a period, click **Download PDF**. "A lender-ready income statement —
  costs by category, net profit, assets below the line, rate basis disclosed."
- Open **Credit passport**. "Turnover, cash-flow stability, length of record, declared assets,
  and a readiness check."
- Create a share, then revoke it. "Shared only with explicit consent, revocable any time — and
  entries in an active share are locked, so a lender always sees exactly what was sent."

## 2:05–2:30 · Architecture + what's next (cut to architecture.png)

> "It's serverless on AWS in Cape Town — CloudFront and S3 for the app, API Gateway and Lambda
> over DynamoDB, Cognito for auth, KMS encryption, WAF and CloudTrail. The whole thing was built
> spec-first with an AI coding agent connected to the account. Optional Amazon Bedrock refines
> low-confidence SMS parsing, re-validated against the domain before use."

> "Next: a lender view through the share link, WhatsApp and USSD capture for feature phones, and
> ZIMRA fiscal-invoice integration. The more an owner records, the stronger their passport — and
> the more reason to keep recording. That's MariBooks."

*End card:* the live URL + `#commercial-potential` · `#startups`.

---

## Tips
- Reset the demo before recording (sidebar → **Reset demo**) so figures look clean.
- Do a silent dry run once; the SMS paste and the currency toggles are the two "wow" beats —
  land them clearly.
- If you run long, cut the validation demo (1:35) and the ZiG toggle; keep the SMS paste and the
  passport share, which carry the story.
- Record the narration separately if live talking slows you down; the screen capture is what
  matters most.
