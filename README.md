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

**The app is fully functional without a key.** Scores, evidence, rankings, the triage list and the
suggested actions are all computed in code. The one AI surface falls back to a committed batch of real
model output, and to a keyword scanner below that, and says on screen which one you are looking at.

Other commands:

| command | what it does |
|---|---|
| `npm run verify` | Prints the full ranking, the confidence spread and the model's sanity checks. Every number in this README comes from here. |
| `npm run eval` | Rules against the model on note detection, on the supplied notes and on reworded ones. |
| `npm run eval:beyond` | The question the product actually asks: does a note add risk the signals do not already have? |
| `npm run eval:cross` | The same call against a company the system has never seen. The number that decides whether the model ships. |
| `npm test` | 119 tests: unit, property-based (thousands of generated portfolios), a second company's export, and the model-output validators. |
| `npm run smoke` | End-to-end checks against a running server: status codes, rendered content, AI failure paths. |
| `npm run secret-scan` | Fails if a key could reach a commit, a browser bundle or a log. |
| `npm run check` | Typecheck, lint, tests, secret scan and verification in one command. |
| `npm run second-read:batch` | Regenerates `data/second-read.json`, the committed model output that lets a reviewer without a key see the real feature. |
| `npm run build` | Production build. |

---

## Who I would prioritise first

**Northstar Logistics.** £210,000, renewing in 18 days, and the only account where every axis agrees.
Active users fell 48% in a month (612 → 318), the invoice is disputed, the sponsor left in June, there
has been no contact for 71 days, and the renewal process has not started. It ranks **first on
priority** and second on risk, behind a £12,000 account that is in even worse shape and should still
not be the first call. That gap is finding 2.

Then Meridian Health Systems (£180k, usage −38%, four critical tickets), Lantern Hospitality (£68k,
has asked for a cancellation clause), Atlas Manufacturing (£140k, caught in a vendor consolidation),
and Oakwell Design (£12k, the most distressed account in the book; see finding 2).

---

## Five findings

### 1. Eight accounts renew inside 30 days, and half of the near-term risk is process, not product

£817,000 renews within 30 days of the snapshot. Four accounts worth **£385,000** renew within 45 days
with the renewal stage still at *Not started*. That is the cheapest risk on the board. Nothing is
wrong with those customers; we simply have not opened the conversation.

This is why the model scores *renewal process readiness* at 16 of 100, second only to adoption. "Not
started" is unremarkable at 120 days out and an emergency at 18, so the signal compares the stage
reached against the time remaining rather than treating stage as a flat category.

### 2. The most at-risk account in the portfolio is worth £12,000, and it should not be the first call

**Oakwell Design** ranks **#1 on risk**. Active users down 82%, 3 of 25 seats in use, NPS −42, 120
days since anyone spoke to them, champion gone. It is worth £12,000. **Northstar Logistics** has the
same pathology at **17.5× the value.**

A single blended health score sends the CSM to Oakwell. So the app computes two axes and never merges
them: **risk** (is this account in trouble) and **value at stake** (ARR, weighted by how soon it
renews). Oakwell falls from risk #1 to **priority #5**. Still visible, still worth an email, no
longer the thing you do first. The portfolio table shows this movement in a **vs risk** column, and
the scatter makes it visible in one glance: Oakwell sits far right and near the floor, while a dense
cluster of £150k–£260k accounts sits quietly in the top-left. That is the expensive corner a
risk-sorted queue never reaches.

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
re-normalise, so an account measured on 51% of the model still sits on the same 0–100 scale as one
measured on 100%. What staleness costs is **confidence**, which is displayed separately and never
folded into the risk number. The honest response to a 238-day-old data point is a wider band, not a
smaller number.

The same rule applies to usage, not just sentiment — one rule for stale inputs rather than a special
case for NPS. **Stonebridge Education** (£95,000, renewing in 25 days) had its usage feed last synced
33 days before the snapshot, so its "last 30 days" figures describe a window that closed a month
earlier. Both usage signals are excluded. It is scored on **51% of the model**, marked Low confidence,
and the app says so on the account page rather than presenting a confident 46.

### 4. "Verbal commitment" is not a safe stage: three of the four are stuck on money

| Account | ARR | Stage | Invoice |
|---|---|---|---|
| Greenway Bank | £240,000 | Verbal commitment | **Disputed** |
| BluePeak Software | £84,000 | Verbal commitment | **Overdue** |
| Meadow Homeware | £28,000 | Verbal commitment | **Overdue** |
| Mosaic Foods | £56,000 | Verbal commitment | Current |

**£352,000 sits in the most reassuring stage in the CRM with unresolved billing underneath it.**
Greenway Bank in particular reads as healthy on every behavioural signal (NPS 61, usage up 8%) while
the order form is unsigned and finance is disputing a services charge.

The app does not resolve this. Picking a side would invent a fact, and either record could be the
stale one. It flags the pair as a contradiction, **lowers confidence, leaves the risk score alone**,
and puts the two records side by side so a human can settle it with one phone call.

### 5. The rules I wrote score 95% on this data and 7% when the wording changes

The scoring model reads nine structured columns. It cannot read `customer_notes`, and that column
carries facts that change the answer.

The sharpest case is **Quantum Public Sector**, the **largest account in the book at £260,000**,
renewing in 30 days. Usage is growing, NPS is 46, funding is approved, the invoice is current. It
scores **14.9 risk** and ranks **#15**. The note reads: *"the original sponsor moves roles on 1 August
and no replacement is recorded."* Nothing in the structured data knows this.

Before reaching for a model I wrote a keyword scanner and measured it, because "an LLM would be better
here" is an assertion until it is tested. Against 38 hand-labelled note risks in the supplied file it
caught **36 of 38 (95%)** with zero false positives, which looked like an argument for deleting the
API call.

That number is contaminated. **I wrote those regexes after reading all forty notes**, so it measures
how well I transcribed a corpus I had already read. So I rewrote 14 of the same facts the way another
team would phrase them. *"No replacement is recorded"* becomes *"nobody has been lined up to pick this
up"*. Then I re-ran:

| Detected a material risk in the note | supplied notes | same facts, reworded |
|---|---|---|
| Keyword rules | 36/38 — **95%** | 1/14 — **7%** |
| `gpt-4.1-nano` | 35/38 — **92%** | 13/14 — **93%** |

The model matches the rules on the file the rules were written against, and holds when the wording
changes, where the rules collapse. That is the whole argument, and `npm run eval` reproduces it.

**One honest correction to my own measurement.** My first version scored exact agreement with my
label taxonomy, and on that metric the model looked *worse* than the rules (45% against 95%). Reading
the failures showed why: on *"our main advocate is no longer with the business"* I had labelled
`sponsor-loss` and the model answered `ownerless-blocker`. Both readings send a CSM to the same place.
I was scoring a multi-label problem as single-label and penalising defensible answers. The table above
measures detection, which is what the product actually needs; the exact-label column is still printed
by `npm run eval` so the disagreement is visible rather than tidied away.

Both figures are biased and I wrote both sets; the second is unfair to the rules in exactly the way
the first is generous to them. What they agree on is the finding: **the rules encode one company's
writing conventions, not the meaning.** That is a transfer problem, and it is precisely what would
break the day this pointed at a second company.

**So I tested that directly, and it is the number I would put in front of you first.** The repo already
contains a second company's export as a test fixture — different columns, unseen enum values, an SMB
book two orders of magnitude smaller, and notes in a different register: lowercase, informal,
*"practice manager retiring in sept, no handover planned yet"*. Nothing was tuned for it. The prompt is
generated from the signal list and the enum constants, so it adapts without being edited; the regexes
are exactly the ones written for the first company.

| On a book the system has never seen | Notes whose risk the signals miss |
|---|---|
| Keyword rules | **1 of 4** |
| `gpt-4.1-nano` | **3 of 4** |

The rules miss *"practice manager retiring in sept"*, *"site closed in may; unclear if they are
continuing"*, and *"renewal agreed verbally; paperwork with their accountant"*. Reproduce with
`npm run eval:cross`. Four accounts is a small sample and a single run, so I would quote it as a
direction rather than a rate — but the direction is the whole point of the hire.

**And the conclusion I would say out loud: on the forty notes you supplied, the rules beat the model,
and if this file were the whole world I would delete the API call.** It earns its place because
company number eleven writes its notes differently and nobody is going to rewrite the regexes.

**The failure that actually worries me is the other direction.** A missed flag costs a flag. A *wrong*
flag puts a confident false statement in front of a CSM and can fire a playbook rule. `lib/noteScan.test.ts`
holds adversarial cases for exactly that, and one of them is worth quoting because I could not fix it
by tightening: *"The contract is signed; the unsigned draft copies were destroyed."* My first pattern
matched a document noun near the word "unsigned"; the two words were four apart and the meaning was
the opposite. Requiring the document to be the grammatical subject of "is unsigned" fixed that
sentence — and would not fix the next one. **Patterns match tokens; only a reader gets the meaning.**

So the design constraint is that a note flag can never quietly assert anything: it cannot move the
risk score, it cannot change a rank, and it always renders the exact sentence that triggered it, so a
wrong match is visible in the same glance as the claim.

---

## Three columns I did not score, and the evidence for each

The file has 25 columns. Nine are scored, several are identity or filters, and three carry numbers I
deliberately left out. Leaving a column unused is a decision, so each one has a measurement behind it
rather than an oversight.

**`weekly_active_users_30d` — excluded for lack of variance and collinearity.** As a stickiness ratio
(weekly ÷ monthly actives) it looks promising, and it correlates −0.64 with the risk score. That
correlation is the reason to exclude it, not to include it: it is 0.70 correlated with seat
utilisation and 0.59 with adoption trend, both of which are already scored, so it mostly re-measures
them. And across the whole book it ranges **56% to 69%** — a 14-point spread. A signal that barely
varies cannot separate accounts; it would add weight without adding information.

**`contract_term_months` — excluded because it is a proxy for segment, not for risk.** The raw pattern
is striking: mean risk 35.1 on 12-month terms, 15.7 on 24-month, 11.7 on 36-month. It is also
confounded. Term correlates **0.78** with ARR, and the split is almost total: 1 of 23 twelve-month
accounts is Enterprise, against 7 of 7 on 36-month terms. Scoring term as risk would systematically
penalise every SMB for being an SMB. That is a bias wearing a signal's clothes.

**`products_owned` — excluded because the effect is not there.** Mean risk is 28.6 on one product and
26.4 on two, which is noise. Three-product accounts average 13.2, but there are only three of them.
Multi-product stickiness is a real effect in general; this book is too small to show it.

**One thing the audit did turn up in the model's favour.** The risk distribution is bimodal, with a
clean gap: twelve accounts score 45 or above, then nothing until 36. The Elevated threshold sits at 45,
which lands on that break rather than cutting through a cluster. The "needs attention" set is a real
group in the data, not an artefact of where I put a line.

The same audit checked the file for internal contradictions and found none: no account has more
critical tickets than total tickets, more weekly than monthly actives, or a date after the snapshot,
and all 40 ids and names are unique. The dirtiness in this dataset is staleness and omission, not
incoherence.

---

## The one AI feature, and where the evidence put it

**Second Read.** Open any account and it reads the note against the signals the score already counted,
then says what the note adds. One call type, one call per account, no second call.

Three properties are enforced by code rather than promised in a prompt:

1. **The model returns a clause number, not a quote.** Code splits the note into clauses, the model
   points at one by index, and code renders the text. A fabricated quote is not *checked and rejected* —
   it is unrepresentable.
2. **The score is not in the prompt.** The model sees which signals fired and their evidence; never the
   risk number, the band or the rank. If it knew an account scored 15/100 it would reason toward that
   number instead of reading the note, and "the note disagrees with the score" would stop being an
   independent judgement.
3. **An attribution must name a signal that actually fired.** You cannot contest a signal that scored
   nothing. Failed attributions are dropped and the finding is kept without one.

**It answers yes/no questions, not a multiple choice, and that was a correction.** The first version
asked the model to pick one of four directions. It returned *adds-nothing* for Quantum — the account
this feature exists for — and *adds-opportunity* for a competitor being trialled. I should have
predicted that: `npm run eval` measures this model at 92–93% on detection and **45%** on picking a
label from a taxonomy, and I had built on the second number. Independent binaries sit much closer to
the task that was actually measured.

**The triage list stays deterministic, and that is also measured.** `npm run eval:beyond` scores both
systems on "does this note add risk the signals do not already have":

| | Precision | Recall | Accounts it puts on the list |
|---|---|---|---|
| Keyword rules | 71% | 50% | **9 — £1,281,000** |
| `gpt-4.1-nano` | 68% | 96% | 22 of 28 calm accounts |

A list of 22 out of 28 is not a triage list, it is the book. So the rules select the nine accounts on
the portfolio page and the model reads the note once you are on one. Each does the job it measurably
does better.

**One caveat I will not bury: I tuned that prompt twice against 40 labels I wrote myself.** The first
version biased to "no" (recall 25%), the second to "yes" (recall 96%). Those bracket the answer rather
than find it, and both are overfitted to a set of forty. `npm run eval:beyond` prints that warning
above its own numbers. It is the reason `eval:cross` — a book I did not label and did not tune for —
is the figure I trust most.

**No second call.** No critic, no self-verifier, no judge. At this model size the deterministic
validator is a strictly better critic than another pass of the same model: it is free, reproducible,
and it cannot be talked out of its answer. The independent checks are the clause-index render, the
firing-signal gate, the enum validator, and the human. The panel is deliberately built to **show what
validation rejected**, because a rejected output is better evidence that the checks are real than a
clean one.

---

## How I made the key decisions

| Decision | Why | What I gave up |
|---|---|---|
| **A transparent additive rubric, not a model** | There are no historical renewal outcomes in the file. There is nothing to fit and nothing to validate against, so a fitted model would be a confident-looking number with no evidence underneath it. The brief says the same thing from the other side: no churn probabilities. | Any claim to predictive accuracy. In exchange every point is inspectable and arguable. |
| **Two axes, never blended** | "Risk *and* commercial priority" is two questions. Finding 2 is what happens when you answer them with one number. | Two numbers to explain instead of one. The `vs risk` column pays that cost. |
| **Confidence is a third, separate output** | Folding staleness into the score silently converts a guess into a measurement. | Users read two things. It is the only treatment of stale data that does not quietly lie. |
| **Stale signals are dropped and the model re-normalises** | A 238-day-old NPS is not evidence about today, and neither is a usage window that closed a month before the snapshot. Zeroing the weight keeps accounts comparable and makes "% of model applied" an honest headline. | An account scored on 51% of the model is not strictly comparable to one on 100%. That figure is therefore shown, not hidden. |
| **Contradictions lower confidence, never risk** | Three of four verbal commitments contradict their billing record. Resolving that silently, in either direction, invents a fact. | The app declines to answer the hardest cases. That is the answer. |
| **Next action chosen by decision table** | Routing attention is a small, knowable answer space. A rule can be read, argued with and corrected; a generated action cannot. | Less fluent phrasing than a model would produce. |
| **Exactly one LLM call, and it cannot move a number** | Finding 5. The score is computed server-side and passed to the model as read-only context; the response is advisory and rendered in its own panel. An unreproducible output must not reorder a work queue. | The insight is ignorable. Correct. |
| **Everything anchors to the stated 2026-07-21 snapshot** | The file is a snapshot; the app has a clock. Using `new Date()` would make "18 days to renewal" drift every day you open it, and no number here would reproduce. | The app is not live. It is honest about being a snapshot. |

**On cost and model choice.** The feature is one call per account, on demand. Never on page load,
never in a loop over the portfolio. Capped at 400 output tokens, temperature 0.2, a 12-second timeout,
cached per account so a reviewer clicking through 40 accounts twice pays for 40 calls rather than 80,
and rate limited to 40 calls per IP per 10 minutes so a public URL cannot run up somebody else's bill.
The expensive mistake would have been putting the model in the scoring path, where it would run 40
times per page load and produce a ranking that changed between refreshes.

The model is `gpt-4.1-nano`, and it was chosen by the key rather than by me. The key you supplied is
scoped to exactly one model, which I found by asking the API rather than by guessing:

```
GET /v1/models  →  { "count": 1, "models": ["gpt-4.1-nano"] }
```

That is a sensible thing for you to have done, and it exercised the fallback in production before any
reviewer saw it. My first deploy requested `gpt-4o-mini`, got a 403 `model_not_found`, and the app
served the deterministic brief with a visible note instead of showing an error. The model is read from
`OPENAI_MODEL`, so pointing this at a different one is an environment variable, not a code change.

---

## What could change these decisions

- **Historical renewal outcomes.** The single input that would change the most. With two years of
  labelled outcomes I would fit a model, hold the rubric as the explanation layer, and finally be able
  to say whether these nine signals predict anything. Right now nobody can.
- **The weights are judgement, not evidence.** They encode a view, that commercial process signals
  sit closer to the decision than sentiment does, and a CSM who has actually worked this book might
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
- **A churn probability.** Explicitly ruled out by the brief, and it would have been wrong anyway:
  there is nothing to calibrate against.
- **Authentication.** The brief asks for something reviewers can open without credentials.
- **Email or CRM integrations.** No system to integrate with, and a mocked one proves nothing.
- **Any chart beyond the one scatter.** The ranked list is the product; the risk-against-value plot
  earns its place because it is the argument. Trend lines would need history the dataset does not have,
  and a segment breakdown answers a question nobody asked.
- **A second AI feature.** The brief asks for one, so there is one. The three below are what I would
  build next, and they are worth stating because they point the opposite way to where this usually goes.

### AI at design time, not at runtime

The obvious next move is to let a model check the ambiguous cases as they occur. I think that is the
wrong shape: it puts an unreproducible call on every account forever, and it makes the system harder
to explain to the person who has to defend a ranking. The same intelligence is worth more spent once,
at the point a new company is onboarded.

1. **A schema-mapping assistant.** Company number two arrives with `Part-paid` and `Legal review` in
   columns this model has never seen. That is a real fixture in `lib/portability.test.ts`, and today
   those values are correctly excluded and a human has to map them by hand. A model is good at
   proposing that mapping. It proposes, a person approves, the result is written to `lib/config.ts`,
   and **runtime stays pure arithmetic**. This is the only place the deterministic design is genuinely
   worse for the user today.

2. **Rule generation instead of rule execution.** Finding 5 shows the keyword scanner is a
   transcription of one company's phrasing. Rather than calling a model for every account forever,
   point it at a sample of the new company's notes and have it *propose the patterns*, reviewed by a
   human. You buy the language understanding once, for pennies, instead of per-account indefinitely.

3. **Drift monitoring.** `npm run eval` already compares rules against the model on a labelled set.
   Run it weekly on a sample and alert when the gap crosses a threshold. That is a model auditing the
   deterministic system, which is the useful direction, and it costs about a penny a week.

4. **Score history.** The brief's binding constraint is that there are no historical renewal outcomes.
   But a tool that runs weekly *creates* them: snapshot every score, and after two renewal cycles
   there is finally something to validate the weights against. This is the single highest-value thing
   missing, and it is deterministic. It is also what turns the measurement plan below from a promise
   into a measurement.

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

That test needs one thing this does not yet do: **keep its own history.** The brief's binding
constraint is that there are no historical renewal outcomes. A tool that runs weekly creates
them. Snapshotting every score is a small deterministic change and it is what converts everything
above from a plan into an actual measurement. It is the first thing I would build.

---

## Built for the next dataset, not just this one

This is a snapshot of 40 rows. Everything below exists because the next file will not be.

**Nothing is tuned to this file's contents.** The scoring engine (`lib/scoring.ts`) contains no
numbers at all. Every weight, threshold and staleness limit lives in `lib/config.ts`. The value
reference is derived from the portfolio's ARR distribution at load time; an earlier version had
`ARR_REFERENCE = 260_000` hard-coded to this book's largest account, which would have flattened the
value axis on any book with a bigger one. Urgency extends past a year rather than clamping at this
file's 129-day horizon.

**Unrecognised data is excluded, never assumed healthy.** `lib/schema.ts` validates every row. A new
`invoice_status` value the model has not seen is reported, dropped from scoring, and shown in the UI.
It does *not* fall through to "Current". That was a real bug in the first version (`INVOICE_RISK[x] ??
0` scored an unknown billing state as perfectly healthy) and there is now a test named after it.

**Structural failure is loud; row-level failure is contained.** A missing required column stops the
app with a message naming the column. A single row with a malformed date is quarantined and the other
39 still load. Both surface in the product rather than in a log.

**The data source is swappable.** `PortfolioSource` in `lib/data.ts` is a two-method interface. A
warehouse query, an HTTP export or a CRM API is a new implementation and nothing else changes.
`listPortfolio` already takes the paging arguments a server-side source would need, and account pages
render per request rather than being pre-generated, so build time does not grow with the size of the
book.

**A correctness bug worth naming, because it is invisible to types and unit tests.** An unknown
customer id rendered the right "no such account" page under an HTTP **200**. `notFound()` cannot set a
status once a response has begun streaming, and a `loading.tsx` anywhere above a route is what starts
it. The fix was to scope the skeleton to the portfolio page with a route group, leaving the account
route unwrapped. `npm run smoke` asserts both behaviours against a running server: status codes,
rendered content, and the AI endpoint's failure paths.

**Scale, honestly.** Scoring is O(n) with roughly forty arithmetic operations per account and the
whole book is held in memory. Tens of thousands of accounts are fine. Millions are not, and the right
answer there is to push scoring into the warehouse and serve pre-scored pages, which is the seam
above, not a rewrite.

**103 tests, and the ones that matter are not the hand-written ones.** Example tests only check cases
the author thought of, which on a 40-row file is a weak claim. `lib/properties.test.ts` uses
`fast-check` to generate thousands of portfolios per run (unmapped enums, negative ARR, dates
centuries apart, lone surrogates, empty books, duplicate ids) and asserts invariants that must hold
for *any* input: the risk score is always finite and in range, priority is never negative, the
evidence panel's contributions always sum to the headline number, ranks are always a permutation of
1..n.

It found three defects in the first run, and all three were the silent kind:

| Found | Why it mattered |
|---|---|
| A trailing comma produced two columns named `""`, and assigning by name meant the second **overwrote the first** — `id,name,,` + `1,bob,x,y` parsed to `{id:"1", name:"bob", "":"y"}` and `x` vanished | Excel writes trailing commas by default. No error was raised anywhere |
| `scoreAll` keyed its risk ranking by customer id, so duplicate ids **collapsed to one rank** | The ranking quietly stopped being a ranking |
| An unquoted comma inside free text truncated the note and dropped the rest | The most common CSV defect there is, and it was invisible |

`lib/portability.test.ts` is the other half: **a second company's export**, written to be awkward in
the ways a real one is: BOM, CRLF, trailing commas, unquoted commas in notes, enum values this model
has never seen, no NPS columns at all, an SMB book two orders of magnitude smaller, a duplicate id, a
`15/09/2026` date and a renewal already in the past. Five accounts load, two quarantine, every
unmapped value is reported by name, and the value axis rescales to the smaller book.

It also asserts the promise that **fails**: the note scanner does not recognise *"practice manager
retiring in sept"* as a sponsor loss. That limitation is now a test, so it cannot quietly stop being
true.

`npm run check` runs typecheck, lint, tests and the verification harness together.

**What does not port** is the keyword scanner. Finding 5 measured exactly how badly (7%), and that is
the honest boundary between the part of this that is a system and the part that is a transcription of
one company's writing habits.

---

## Notes on the data

- Everything is anchored to the stated snapshot of **2026-07-21**, shown in the header on every page.
- Blank means *not recorded* and is handled as such. It is never coerced to zero, because a missing value
  scoring as a real measurement is the failure mode this dataset is built to catch.
- Every figure in this README is produced by `npm run verify` and `npm run eval` from the supplied CSV.
  Nothing here is estimated or recalled.

## Stack

Next.js 16 (App Router), TypeScript, Tailwind CSS v4, OpenAI SDK. Deployed on Vercel. No database, no
auth, no client-side state library. The data is a static snapshot and the app is honest about that.
