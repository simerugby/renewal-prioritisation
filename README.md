# Renewal Prioritisation

A tool for a customer success manager deciding **which renewals need attention, why, and what to do next.**

**Live app** — https://renewal-prioritisation.vercel.app
**Repository** — https://github.com/simerugby/renewal-prioritisation

40 accounts, £4,431,000 of ARR, snapshot dated 2026-07-21.

Working and measurements behind the decisions here: **[EVIDENCE.md](EVIDENCE.md)**.

---

## Setup

```bash
npm install
npm run dev            # http://localhost:3000
```

Optional, for the one AI feature:

```bash
cp .env.example .env.local     # then add OPENAI_API_KEY
```

**The app is fully functional without a key.** Scores, evidence, rankings, the triage list and the
suggested actions are all computed in code. The AI feature falls back to a committed batch of real
model output, and to a keyword scanner below that, and says on screen which one you are seeing.

| command | what it does |
|---|---|
| `npm run verify` | Prints the ranking and every figure quoted in these two documents. |
| `npm run sensitivity` | Perturbs the weights 1,000 times to test whether the ranking survives them. |
| `npm run eval` / `eval:beyond` / `eval:cross` | The three measurements behind the AI decision. |
| `npm test` | 119 tests: unit, property-based, a second company's export, model-output validation. |
| `npm run smoke` | End-to-end against a running server: status codes, content, AI failure paths. |
| `npm run check` | Typecheck, lint, tests, secret scan, verification. |

---

## Who I would prioritise first

**Northstar Logistics.** £210,000, renewing in 18 days, and the only account where every axis agrees.
Active users fell 48% in a month (612 → 318), the invoice is disputed, the sponsor left in June, no
contact for 71 days, renewal process not started. It ranks first on priority and second on risk,
behind a £12,000 account in even worse shape that should still not be the first call — finding 2.

Then Meridian Health Systems (£180k, usage −38%, four critical tickets), Lantern Hospitality (£68k,
has asked for a cancellation clause), Atlas Manufacturing (£140k, caught in a vendor consolidation),
and Oakwell Design (£12k, the most distressed account in the book).

---

## Five findings

### 1. Half the near-term risk is process, not product

£817,000 renews within 30 days. Four accounts worth **£385,000** renew within 45 days with the stage
still at *Not started*. That is the cheapest risk on the board — nothing is wrong with those customers;
we simply have not opened the conversation.

So the model scores *renewal process readiness* at 16 of 100, second only to adoption, and compares
the stage reached against the time remaining. "Not started" is unremarkable at 120 days and an
emergency at 18.

### 2. The most at-risk account is worth £12,000, and should not be the first call

**Oakwell Design** ranks **#1 on risk** — users down 82%, 3 of 25 seats active, NPS −42, 120 days
since contact, champion gone. It is worth £12,000. **Northstar** has the same pathology at **17.5×**
the value.

A single blended health score sends the CSM to Oakwell. So the app computes two axes and never merges
them: **risk** (is this account in trouble) and **value at stake** (ARR weighted by how soon it
renews). Oakwell falls to **priority #5** — still visible, no longer first. The table shows the
movement in a `vs risk` column; the scatter shows it in one glance.

The value reference is the portfolio's 90th percentile of ARR, derived at load time rather than
hard-coded, so the model behaves sensibly on a book of £20k SMBs and a book of £5m enterprises alike.

### 3. NPS is the least trustworthy column, and the one CS teams lead with

| | |
|---|---|
| Accounts with no NPS at all | 3 |
| Of the 37 with one, older than a week | **36** |
| Median age | **43 days** · oldest **238** |
| Accounts with usage data over a week stale | **4** (median sync age: 1 day) |

Sentiment is stale almost everywhere; behaviour is fresh almost everywhere. So adoption is weighted 18
and sentiment 5, sentiment halves past 45 days, and **drops out entirely past 120** — which excludes
7 accounts' NPS from scoring.

Excluded signals are not scored as zero. Their weight is removed and the rest re-normalise, so an
account measured on 51% of the model sits on the same 0–100 scale as one on 100%. What staleness costs
is **confidence**, shown separately and never folded into risk. The honest response to a 238-day-old
data point is a wider band, not a smaller number.

The same rule applies to usage. **Stonebridge Education** (£95,000, renewing in 25 days) last synced
33 days before the snapshot, so its "last 30 days" figures describe a window that closed a month
earlier. Both usage signals are excluded, it is scored on **51% of the model**, and the app says so
rather than presenting a confident 46.

### 4. "Verbal commitment" is not a safe stage — three of four are stuck on money

| Account | ARR | Invoice |
|---|---|---|
| Greenway Bank | £240,000 | **Disputed** |
| BluePeak Software | £84,000 | **Overdue** |
| Meadow Homeware | £28,000 | **Overdue** |
| Mosaic Foods | £56,000 | Current |

**£352,000 sits in the most reassuring stage in the CRM with unresolved billing underneath it.**
Greenway reads as healthy on every behavioural signal — NPS 61, usage up 8% — while the order form is
unsigned and finance disputes a services charge.

The app does not resolve this. Picking a side invents a fact, and either record could be the stale one.
It flags the contradiction, **lowers confidence, leaves the risk score alone**, and puts both records
side by side so a human can settle it with one call.

### 5. The rules I wrote score 95% here and 7% when the wording changes

The nine signals cannot read `customer_notes`, and that column carries facts that change the answer.

The sharpest case: **Quantum Public Sector**, the **largest account at £260,000**, renewing in 30 days.
Usage growing, NPS 46, funding approved, invoice current. It scores **14.9** and ranks **#15**. The
note reads *"the original sponsor moves roles on 1 August and no replacement is recorded."*

Before reaching for a model I wrote a keyword scanner and measured it, because "an LLM would be better
here" is an assertion until tested. It caught **36 of 38** hand-labelled note risks with zero false
positives — which looked like an argument for deleting the API call. That number is contaminated: **I
wrote those regexes after reading all forty notes.** So I rewrote 14 of the same facts as another team
would phrase them and re-ran:

| Detected the risk in the note | supplied notes | same facts, reworded | a book never seen |
|---|---|---|---|
| Keyword rules | **95%** | **7%** | **1 of 4** |
| `gpt-4.1-nano` | 92% | **93%** | **3 of 4** |

The third column comes from a second company's export with notes in a different register (*"practice
manager retiring in sept, no handover planned yet"*). Read it carefully: **I wrote that fixture and
its labels**, so it is not unseen data. What it does show is that nothing in the *system* was adjusted
for it — same prompt template, same regexes, same validators. That is a weaker claim than it first
looks, and stating it precisely matters more here than anywhere else in this document.

**Said plainly: on the forty notes you supplied the rules beat the model, and if this file were the
whole world I would delete the API call.** It earns its place because company number eleven writes its
notes differently and nobody is going to rewrite the regexes.

Full methodology, including where my own measurements were wrong twice, is in
[EVIDENCE.md](EVIDENCE.md).

---

## How I made the key decisions

| Decision | Why | What I gave up |
|---|---|---|
| **A transparent rubric, not a fitted model** | No historical renewal outcomes exist in this file. Nothing to fit, nothing to validate. A model here would be a confident number with no evidence under it — which is the brief's own point about churn probabilities. | Any claim to predictive accuracy. In exchange every point is inspectable. |
| **Two axes, never blended** | "Risk *and* commercial priority" is two questions. Finding 2 is what happens when you answer both with one number. | Two numbers to explain. The `vs risk` column pays that cost. |
| **Confidence as a third, separate output** | Folding staleness into the score silently converts a guess into a measurement. | Users read two things. It is the only treatment of stale data that does not quietly lie. |
| **Stale signals dropped, model re-normalised** | A 238-day-old NPS is not evidence about today, and neither is a usage window that closed a month ago. | An account on 51% of the model is not strictly comparable to one on 100%. That figure is therefore shown. |
| **Contradictions lower confidence, never risk** | Resolving them silently, in either direction, invents a fact. | The app declines to answer the hardest cases. That *is* the answer. |
| **Next action by decision table, not by model** | Routing attention is a small, knowable answer space. A rule can be read and argued with. | Less fluent phrasing than a model would produce. |
| **One LLM call, and it cannot move a number** | The score is computed server-side and passed to the model as read-only context — in fact the score is withheld entirely, so it reads the note independently. | The insight is ignorable. Correct: an unreproducible output must not reorder a work queue. |
| **The triage list stays deterministic** | Measured, not assumed. The rules select 9 accounts at 71% precision; the model, at the recall needed to catch Quantum, flags 22 of 28 calm accounts. A list of 22 is not a list. | The model's better recall. It reads the note instead. |
| **Everything anchors to the stated 2026-07-21 snapshot** | Using `new Date()` would make "18 days to renewal" drift daily and no figure here would reproduce. | The app is not live. It is honest about being a snapshot. |

**On cost.** One call per account, on demand — never on page load, never looped over the portfolio.
Capped at 600 output tokens, cached per account, and rate limited to 40 calls per IP per 10 minutes so
a public URL cannot casually run up your bill. That limit is in-memory and therefore per instance, so
on serverless the real ceiling is the limit times the number of warm instances — a bound, not a
guarantee, and `lib/rateLimit.ts` says so where the code is. The model is `gpt-4.1-nano`, chosen by your key rather than by
me: it is scoped to exactly one model, which I found by asking the API rather than guessing. My first
deploy requested `gpt-4o-mini`, got a 403, and the app served the deterministic result with a visible
note instead of an error — the fallback proving itself in production before any reviewer saw it.

---

## What could change these decisions

- **Historical renewal outcomes.** The single input that would change the most. With two years of
  labelled outcomes I would fit a model, keep the rubric as the explanation layer, and finally know
  whether these nine signals predict anything. Nobody can say that today.
- **The weights are judgement, not evidence** — but not arbitrary, and I tested that rather than
  claiming it. Under ±40% random jitter across 1,000 trials the top 5 holds **100%** of the time, and
  deleting any single signal leaves it unchanged. The same test shows accounts in ranks 16–30 move up
  to **6 places**, so the middle of the list is a band, not an ordering. The method page says so.
- **Whether `renewal_stage` is ordered.** 16 of 100 weight rests on treating those five values as a
  progression. If a company uses them as unordered categories, that signal is meaningless.
- **What counts as engagement.** If a CRM logs email but not calls, silence is overstated and that
  signal inflates risk across the whole book.
- **Whether a decline is real.** Everfield's note says usage always falls during a seasonal shutdown
  and no prior-year baseline exists; Harbor Retail's decline is store closures. The model penalises
  both. A sentence in a note currently does that job better than any column.
- **My own labels, and this is the weakest joint in the whole submission.** I wrote the ground truth,
  the paraphrase sets, the prompts *and* the second-company fixture. Every eval number carries my
  fingerprints — including `eval:cross`, where I wrote both the notes and the labels. What is true of
  that run is narrower than "unseen data": nothing in the **system** was tuned for it. Same prompt
  template, same regexes, same validators, no edits. That is a real property and it is the one I would
  defend; "data I did not author" would not have been. The fix is somebody else's export and somebody
  else's labels, and I could not get either in a day.

---

## What I chose not to build, and why

- **A database.** Decisions persist to `localStorage`. A reviewer needs a decision to survive a
  refresh; it does not need auth and a schema to prove the workflow. A second reviewer on a second
  machine sees an empty log. The write-back seam is one module (`lib/decisions.ts`).
- **Editable weight sliders.** A slider invites fiddling until the ranking agrees with you, which is
  the opposite of accountability. The weights are published, explained and version-controlled instead.
- **A churn probability.** Ruled out by the brief, and it would have been wrong anyway — there is
  nothing to calibrate against.
- **Authentication.** You asked for something reviewers can open without credentials.
- **A second AI feature**, and the ideas below are the reason that is a decision rather than a limit.

### AI at design time, not at runtime

The obvious next move is to let a model check ambiguous cases as they occur. I think that is the wrong
shape: it puts an unreproducible call on every account forever. The same intelligence is worth more
spent once, when a new company is onboarded.

1. **A schema-mapping assistant.** Company two arrives with `Part-paid` and `Legal review` in columns
   this model has never seen — a real fixture in `lib/portability.test.ts`. Today those are correctly
   excluded and a human maps them by hand. A model proposes the mapping, a person approves, the result
   is written to config, and runtime stays pure arithmetic. This is the only place the deterministic
   design is genuinely worse for the user today.
2. **Rule generation instead of rule execution.** Point a model at a sample of the new company's notes
   and have it *propose* the patterns, reviewed by a human. Buy the language understanding once, for
   pennies, instead of per-account indefinitely.
3. **Drift monitoring.** `npm run eval` already compares rules against the model. Run it weekly and
   alert when the gap crosses a threshold — a model auditing the deterministic system, which is the
   useful direction.
4. **Score history.** Your binding constraint is that no historical outcomes exist. A tool that runs
   weekly *creates* them. This is deterministic, it is the highest-value thing missing, and it is what
   turns the measurement plan below into an actual measurement.

---

## How I would measure whether this is useful

The trap is measuring engagement. A CSM opening the tool daily proves nothing.

**Leading, weeks 1–4**

- **Time to first contact** on accounts entering the Critical band. This is the mechanism the product
  is supposed to move.
- **Coverage of the near-term book** — accounts renewing within 45 days with a recorded decision.
  Today four accounts worth £385,000 sit at *Not started*; that should go to zero.
- **Override rate on suggested actions.** Near 0% means the CSM is rubber-stamping and has stopped
  reading. Near 100% means the rules are wrong. Around 20–30% means a useful default being reviewed.

**Lagging, two renewal cycles**

- **Gross revenue retention on flagged versus unflagged accounts**, and specifically whether accounts
  the tool surfaced early retained better than comparable ones it did not.
- **Discount depth at renewal.** Late-discovered risk gets solved with price. Earlier intervention
  should show here before it shows in retention.

**The honest test.** After one cycle, take the accounts that churned and ask whether this had them in
the top decile. If not, the weights are wrong and the model needs rebuilding — and that is the first
outcome data anyone will have. Until then every number here is a structured opinion, and the app is
built to make that opinion easy to inspect and easy to argue with rather than easy to trust.

That test needs the one thing this does not yet do: **keep its own history.** Snapshotting every score
weekly is a small deterministic change, and it is the first thing I would build.

---

## Stack

Next.js 16 (App Router), TypeScript, Tailwind v4, OpenAI SDK. Deployed on Vercel. No database, no
auth, no client state library — the data is a static snapshot and the app is honest about that.

Every date counts from the stated snapshot, shown in the header on every page. Blank means *not
recorded* and is never coerced to zero: a missing value scoring as a real measurement is the failure
mode this dataset is built to catch.
