# MariBooks — Zero to Shipped Submission Checklist

Deadline: **projects due October 2, 2026, 11:59 PM PDT.** Everything below must be true and
posted on your Builder Center project before then. Verify each item against the hackathon's
**Rules** tab — this checklist reflects the About page and can miss fine print.

---

## 0. Ship gate (pass-or-fail — do these first)
- [x] The app is **live on AWS** and reachable at a **public URL**.
      URL: **https://d3vn6ch6zctfj4.cloudfront.net**
      (Sign-in is self-service; account creation is the intended first step, not a wall.)
- [x] The live app works end to end (auth → capture → dashboard → statement → passport);
      API verified against the live stack (200s, validation 400, tenant-scoped list).
- [x] A **coding agent is connected to AWS** with **documented proof**
      (`submission/aws-connection-proof.md`, account 985923204885, af-south-1).
- [ ] The application is **original** and has **not been published before** — confirm.

> If the app is not live and reachable, the project does not advance to judging — no exceptions.

- [ ] Redesign + `/parse` route deployed (steps in `infra/DEPLOYED.md` → "Deploying the redesign").
- [ ] `https://d3vn6ch6zctfj4.cloudfront.net/?demo` opens the demo dashboard in a private window.

## 1. Category & lane tags (both required)
- [ ] App category tag added: **`#commercial-potential`**
- [ ] Lane tag added: **`#startups`** (or `#community` if you decide to reposition)
- [ ] Both tags are on the project in Builder Center **before the deadline**.

## 2. Coding-agent → AWS connection proof
- [ ] Screenshot(s) or logs showing your coding agent authenticated/connected to the AWS
      console or account.
- [ ] A short written note of what the agent did (provisioned resources, deployed, etc.).
- [ ] Proof file(s) stored in `submission/` and linked from the write-up.
      Proof link: ____________________________

## 3. Project write-up (must show all of these)
- [ ] Your **development process**.
- [ ] **How the coding agent helped you ship** (concrete moments).
- [ ] Your **category and lane** stated explicitly.
- [ ] A **link to the live app**.
- [ ] `submission/SUBMISSION.md` completed with every `‹CONFIRM›` / `‹PASTE›` filled in.

## 4. Spec-driven evidence (strengthens "development process" + "communication quality")
- [ ] `.kiro/specs/maribooks-mvp/requirements.md` present and current.
- [ ] `.kiro/specs/maribooks-mvp/design.md` present and current.
- [ ] `.kiro/specs/maribooks-mvp/tasks.md` present and current.
- [ ] These are reachable by judges (public repo or included in the project link).
- [ ] `submission/JUDGE_WALKTHROUGH.md` present — a step-by-step tour using the demo business,
      mapped to the judging axes.

## 5. Live app readiness (functional demo)
- [ ] Two-tap capture of money in/out, currency (USD/ZiG) and rail selectable.
- [ ] Fees / IMTT recorded separately from principal.
- [ ] Dashboard toggles USD ↔ ZiG using dated FX rates.
- [ ] Lender-ready statement exports/shares, rate basis disclosed.
- [ ] Credit passport generates and shares only after explicit consent.
- [ ] Capture is reliable on slow connections: saves confirmed, retried on failure, no
      duplicates on retry, nothing silently dropped.
- [ ] No secrets/keys committed to the repo or exposed in the app.

## 6. AWS footprint (verify what is actually deployed)
- [ ] Public-facing surface serving the live URL (e.g. Amplify Hosting / CloudFront).
- [ ] Backend running on AWS (e.g. API Gateway + Lambda).
- [ ] Data store on AWS (e.g. DynamoDB / Aurora Serverless).
- [ ] Encryption + identity as applicable (KMS, Cognito).
- [ ] The `SUBMISSION.md` AWS list matches what is really running — no aspirational services.

## 7. Judging-axis polish (Round 1 AI scoring)
- [ ] Every `‹PERSONALISE›` / `‹ADD›` in `SUBMISSION.md` filled with real facts (owner story,
      sourced market figures, early-user results) — or the line removed. No invented numbers.
- [ ] 2–3 minute demo video recorded and linked (problem → live demo → architecture → next).
- [ ] Screenshots from `submission/screenshots/` and `submission/architecture.png` attached to the post.
- [ ] **Creativity & storytelling** — clear narrative and hook.
- [ ] **Technical innovation** — multi-currency/rail ledger + dated FX explained.
- [ ] **Community & market impact** — who benefits and how many.
- [ ] **Communication quality** — clean write-up, working demo path, spec artifacts.

## 8. Eligibility (check the Rules tab — do not assume)
- [ ] Builder is **18 or older** with a **Builder Center profile**.
- [ ] Not in an **excluded country**.
- [ ] Not an **excluded employee** (e.g. AWS/affiliate restrictions).
- [ ] Any teammates also meet eligibility.

## 9. Final pre-submit pass
- [ ] Live URL opened from a fresh browser / incognito to confirm public reachability.
- [ ] All `‹CONFIRM›` / `‹PASTE›` placeholders in `SUBMISSION.md` are resolved.
- [ ] Both tags present; write-up links to the live app.
- [ ] Submitted before **Oct 2, 11:59 PM PDT** (with buffer for upload issues).

---

### Timeline (for planning)
| Milestone | Date |
|---|---|
| Launch | Sep 18 |
| Projects due | **Oct 2** |
| Gate 1 (AI + human scoring) | Week of Oct 5 |
| Gate 2 (human judging) | Week of Oct 12 |
| Winners announced | Week of Oct 19 |
