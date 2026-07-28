# Renewal Prioritisation

A tool for a customer success manager deciding **which renewals need attention, why, and what to do next.**

**Live app** — https://renewal-prioritisation.vercel.app
**Repository** — https://github.com/simerugby/renewal-prioritisation

Built on the supplied `renewal_customers.csv`: 40 accounts, £4,431,000 of ARR, snapshot dated 2026-07-21.

---

## Setup

```bash
npm install
npm run dev            # http://localhost:3000
```

Optional, for the one AI feature:

```bash
cp .env.example .env.local     # then add your key
OPENAI_API_KEY=sk-...
```

**The app is fully functional without a key.** Scores, evidence, rankings and suggested actions are
all computed in code; the AI feature degrades to a rule-based brief and says so on screen.

Other commands:

| command | what it does |
|---|---|
| `npm run verify` | Prints the full ranking, the confidence spread and the model's sanity checks. Every number in this README comes from here. |
| `npm run eval` | The head-to-head behind the AI decision (see [finding 5](#5-the-rules-i-wrote-score-92-on-this-data-and-0-when-the-wording-changes)). Runs the model columns too if a key is set. |
| `npm run build` | Production build. |

---

## Who I would prioritise first

**Northstar Logistics** — £210,000, renewing in 18 days, and the only account where every axis agrees.
Active users fell 48% in a month (612 → 318), the invoice is disputed, the sponsor left in June, there
has been no contact for 71 days, and the renewal process has not started. It ranks first on risk and
first on priority.

Then: **Meridian Health Systems** (£180k, usage −38%, four critical tickets), **Lantern Hospitality**
(£68k, has asked for a cancellation clause), **Atlas Manufacturing** (£140k, caught in a vendor
consolidation), **Oakwell Design** (£12k, the most distressed account in the book — see finding 2).

---

## Five findings

### 1. Eight accounts renew inside 30 days, and half of the near-term risk is process, not product

£817,000 renews within 30 days of the snapshot. Four accounts worth **£385,000** renew within 45 days
with the renewal stage still at *Not started*. That is the cheapest risk on the board — nothing is
wrong with those customers, we simply have not opened the conversation.

This is why the model scores *renewal process readiness* at 16 of 100, second only to adoption. "Not
started" is unremarkable at 120 days out and an emergency at 18, so the signal compares the stage
reached against the time remaining rather than treating stage as a flat category.

### 2. The most at-risk account in the portfolio is worth £12,000, and it should not be the first call

**Oakwell Design** ranks **#1 on risk** — active users down 82%, 3 of 25 seats in use, NPS −42, 120 days
since anyone spoke to them, champion gone. It is worth £12,000. **Northstar Logistics** has the same
pathology at **17.5× the value.**

A single blended health score sends the CSM to Oakwell. So the app computes two axes and never merges
them: **risk** (is this account in trouble) and **value at stake** (ARR, weighted by how soon it
renews). Oakwell falls from risk #1 to **priority #5** — still visible, still worth an email, no
longer the thing you do first. The portfolio table shows this movement explicitly in a **vs risk**
column.

The value reference is the portfolio's 90th percentile of ARR, derived at load time rather than
hard-coded, so the same model behaves sensibly on a book of £20k SMB accounts and a book of £5m
enterprise ones. A floor keeps small accounts from being ranked out of existence entirely: Oakwell
still lands in the top five.

### 3. NPS is the least trustworthy column in the file, and it is the one CS teams lead with

| | |
|---|---|
| Accounts with no NPS response at all | 3 |
| Of the 37 that have one, responses older than a week | 36 |
| Median age of an NPS response | **43 days** |
| Oldest | **238 days** |
| Accounts where usage data is more than a week stale | **4** (median sync age: 1 day) |

Sentiment is stale almost everywhere; behaviour is fresh almost everywhere. So the model weights
adoption at 18 and sentiment at 5, halves the sentiment weight past 45 days, and **drops it entirely
past 120 days** — which excludes 7 accounts' NPS from scoring altogether.

Excluded signals are not scored as zero. Their weight is removed and the remaining signals
re-normalise, so an account measured on 81% of the model still sits on the same 0–100 scale as one
measured on 100%. What staleness costs is **confidence**, which is displayed separately and never
folded into the risk number. The honest response to a 238-day-old data point is a wider band, not a
smaller number.

### 4. "Verbal commitment" is not a safe stage — three of the four are stuck on money

| Account | ARR | Stage | Invoice |
|---|---|---|---|
| Greenway Bank | £240,000 | Verbal commitment | **Disputed** |
| BluePeak Software | £84,000 | Verbal commitment | **Overdue** |
| Meadow Homeware | £28,000 | Verbal commitment | **Overdue** |
| Mosaic Foods | £56,000 | Verbal commitment | Current |

**£352,000 sits in the most reassuring stage in the CRM with unresolved billing underneath it.**
Greenway Bank in particular reads as healthy on every behavioural signal — NPS 61, usage up 8% — while
the order form is unsigned and finance is disputing a services charge.

The app does not resolve this. Picking a side would invent a fact, and either record could be the
stale one. It flags the pair as a contradiction, **lowers confidence, leaves the risk score alone**,
and puts the two records side by side so a human can settle it with one phone call.

### 5. The rules I wrote score 92% on this data and 0% when the wording changes

The scoring model reads nine structured columns. It cannot read `customer_notes`, and that column
carries facts that change the answer.

The sharpest case is **Quantum Public Sector** — the **largest account in the book at £260,000**,
renewing in 30 days. Usage is growing, NPS is 46, funding is approved, the invoice is current. It
scores **14.9 risk** and ranks **#15**. The note reads: *"the original sponsor moves roles on 1 August
and no replacement is recorded."* Nothing in the structured data knows this.

Before reaching for a model I wrote a keyword scanner and measured it, because "an LLM would be better
here" is an assertion until it is tested. Against 38 hand-labelled note risks in the supplied file it
caught **35 (92%)** with zero false positives — which looked like an argument for deleting the API
call.

That number is contaminated. **I wrote those regexes after reading all forty notes**, so it measures
how well I transcribed a corpus I had already read. So I rewrote 14 of the same facts the way another
team would phrase them — *"no replacement is recorded"* becomes *"nobody has been lined up to pick this
up"* — and re-ran:

| | supplied notes | same facts, reworded |
|---|---|---|
| Keyword rules | 35/38 — **92%** | 0/14 — **0%** |

Both figures are biased and I wrote both sets; the second is unfair to the rules in exactly the way
the first is generous to them. What they agree on is the finding: **the rules encode one company's
writing conventions, not the meaning.** That is a transfer problem, and it is precisely what would
break the day this pointed at a second company. It is the reason the AI call exists, and it is
reproducible with `npm run eval`.

---

## How I made the key decisions

| Decision | Why | What I gave up |
|---|---|---|
| **A transparent additive rubric, not a model** | There are no historical renewal outcomes in the file. There is nothing to fit and nothing to validate against, so a fitted model would be a confident-looking number with no evidence underneath it. The brief says the same thing from the other side: no churn probabilities. | Any claim to predictive accuracy. In exchange every point is inspectable and arguable. |
| **Two axes, never blended** | "Risk *and* commercial priority" is two questions. Finding 2 is what happens when you answer them with one number. | Two numbers to explain instead of one. The `vs risk` column pays that cost. |
| **Confidence is a third, separate output** | Folding staleness into the score silently converts a guess into a measurement. | Users read two things. It is the only treatment of stale data that does not quietly lie. |
| **Stale signals are dropped and the model re-normalises** | A 238-day-old NPS is not evidence about today. Zeroing its weight keeps accounts comparable and makes "% of model applied" an honest headline. | An account scored on 81% of the model is not strictly comparable to one on 100%. That figure is therefore shown, not hidden. |
| **Contradictions lower confidence, never risk** | Three of four verbal commitments contradict their billing record. Resolving that silently, in either direction, invents a fact. | The app declines to answer the hardest cases. That is the answer. |
| **Next action chosen by decision table** | Routing attention is a small, knowable answer space. A rule can be read, argued with and corrected; a generated action cannot. | Less fluent phrasing than a model would produce. |
| **Exactly one LLM call, and it cannot move a number** | Finding 5. The score is computed server-side and passed to the model as read-only context; the response is advisory and rendered in its own panel. An unreproducible output must not reorder a work queue. | The insight is ignorable. Correct. |
| **Everything anchors to the stated 2026-07-21 snapshot** | The file is a snapshot; the app has a clock. Using `new Date()` would make "18 days to renewal" drift every day you open it, and no number here would reproduce. | The app is not live. It is honest about being a snapshot. |

**On cost.** The AI feature is one call per account, on demand — never on page load, never in a loop
over the portfolio. Small model, capped at 400 output tokens, temperature 0.2, 12-second timeout, and
cached per account so a reviewer clicking through 40 accounts twice pays for 40 calls, not 80. At
`gpt-4o-mini` rates a full pass over this portfolio costs a fraction of a penny. The expensive
mistake would have been putting the model in the scoring path, where it would run 40 times per page
load and produce a ranking that changes between refreshes.

---

## What could change these decisions

- **Historical renewal outcomes.** The single input that would change the most. With two years of
  labelled outcomes I would fit a model, hold the rubric as the explanation layer, and finally be able
  to say whether these nine signals predict anything. Right now nobody can.
- **The weights are judgement, not evidence.** They encode a view — that commercial process signals
  sit closer to the decision than sentiment does — and a CSM who has actually worked this book might
  reorder them. They are all in one file (`lib/config.ts`) for exactly that reason. Nothing in the
  engine hard-codes a number.
- **Which record is stale in a contradiction.** If billing were known to be authoritative over CRM
  stage, finding 4 resolves by rule and three accounts jump the ranking.
- **Whether a decline is real.** Everfield Agriculture's note says usage always falls during a seasonal
  shutdown and no prior-year baseline exists. Harbor Retail's decline is store closures, not
  disengagement. The model penalises both. A year of history would tell them apart; a sentence in a
  note currently does the job better than any column.
- **My own labels in finding 5.** I wrote the ground truth and both test sets. A reviewer who
  relabelled them would move the numbers. The notes are printed next to every miss in `npm run eval`
  so the labelling can be argued with rather than taken on trust.

---

## What I chose not to build, and why

- **A database.** Decisions persist to `localStorage`. A reviewer needs a decision to survive a
  refresh, which it does; it does not need auth and a schema to prove the workflow. A second reviewer
  on a second machine sees an empty log. The write-back seam is one function (`persist` in
  `components/DecisionRecorder.tsx`) and it is the only thing that changes when this becomes real.
- **Editable weight sliders.** Tempting, and the brief asks for a model users can challenge. But a
  slider invites fiddling until the ranking agrees with you, which is the opposite of accountability.
  The weights are published, explained and version-controlled instead. If a team wants different ones
  they should argue for them and commit them.
- **A churn probability.** Explicitly ruled out by the brief, and it would have been wrong anyway —
  there is nothing to calibrate against.
- **Authentication.** The brief asks for something reviewers can open without credentials.
- **Email or CRM integrations.** No system to integrate with, and a mocked one proves nothing.
- **Charts beyond the inline bars.** The ranked list is the product. A scatter plot of risk against
  value was the one visual I genuinely wanted; it is the first thing I would add.

---

## How I would measure whether this is useful

The trap is measuring engagement. A CSM opening the tool daily proves nothing.

**Leading (weeks 1–4)**
- **Time to first contact** on accounts entering the Critical band. This is the mechanism the whole
  product is supposed to move.
- **Coverage of the near-term book** — accounts renewing within 45 days with a recorded decision.
  Today four accounts worth £385,000 sit at *Not started*; that number should go to zero.
- **Override rate on suggested actions.** Near 0% means the CSM is rubber-stamping and has stopped
  reading. Near 100% means the rules are wrong. Somewhere around 20–30% means it is a useful default
  being genuinely reviewed.

**Lagging (two renewal cycles)**
- **Gross revenue retention on flagged versus unflagged accounts**, and specifically whether accounts
  the tool surfaced early retained better than comparable ones it did not.
- **Discount depth at renewal.** Late-discovered risk gets solved with price. Earlier intervention
  should show up here before it shows up in retention.

**The honest test.** After one cycle, take the accounts that churned and ask whether this tool had
them ranked in the top decile. If it did not, the weights are wrong and the whole model needs
rebuilding — and that is the first outcome data anyone will have. Until then every number here is a
structured opinion, and the app is written to make that opinion easy to inspect and easy to argue
with rather than easy to trust.

---

## Built for the next dataset, not just this one

This is a snapshot of 40 rows. Everything below exists because the next file will not be.

**Nothing is tuned to this file's contents.** The scoring engine (`lib/scoring.ts`) contains no
numbers at all — every weight, threshold and staleness limit lives in `lib/config.ts`. The value
reference is derived from the portfolio's ARR distribution at load time; an earlier version had
`ARR_REFERENCE = 260_000` hard-coded to this book's largest account, which would have flattened the
value axis on any book with a bigger one. Urgency extends past a year rather than clamping at this
file's 129-day horizon.

**Unrecognised data is excluded, never assumed healthy.** `lib/schema.ts` validates every row. A new
`invoice_status` value the model has not seen is reported, dropped from scoring, and shown in the UI —
it does *not* fall through to "Current". That was a real bug in the first version (`INVOICE_RISK[x] ??
0` scored an unknown billing state as perfectly healthy) and there is now a test named after it.

**Structural failure is loud; row-level failure is contained.** A missing required column stops the
app with a message naming the column. A single row with a malformed date is quarantined and the other
39 still load. Both surface in the product rather than in a log.

**The data source is swappable.** `PortfolioSource` in `lib/data.ts` is a two-method interface. A
warehouse query, an HTTP export or a CRM API is a new implementation and nothing else changes.
`listPortfolio` already takes the paging arguments a server-side source would need, and only the top
accounts are pre-rendered so the build does not grow linearly with the book.

**Scale, honestly.** Scoring is O(n) with roughly forty arithmetic operations per account and the
whole book is held in memory. Tens of thousands of accounts are fine. Millions are not, and the right
answer there is to push scoring into the warehouse and serve pre-scored pages — which is the seam
above, not a rewrite.

**52 tests** (`npm test`) cover the CSV edge cases, the validation rules, and the scoring invariants
that would otherwise fail silently: scores staying in range with missing inputs, re-normalisation
keeping partially-scored accounts comparable, division-by-zero on empty books, and renewals in the
past. `npm run check` runs typecheck, lint, tests and the verification harness together.

**What does not port** is the keyword scanner. Finding 5 measured exactly how badly — 0% — and that is
the honest boundary between the part of this that is a system and the part that is a transcription of
one company's writing habits.

---

## Notes on the data

- Everything is anchored to the stated snapshot of **2026-07-21**, shown in the header on every page.
- Blank means *not recorded* and is handled as such. It is never coerced to zero — a missing value
  scoring as a real measurement is the failure mode this dataset is built to catch.
- Every figure in this README is produced by `npm run verify` and `npm run eval` from the supplied CSV.
  Nothing here is estimated or recalled.

## Stack

Next.js 16 (App Router), TypeScript, Tailwind CSS v4, OpenAI SDK. Deployed on Vercel. No database, no
auth, no client-side state library — the data is a static snapshot and the app is honest about that.
