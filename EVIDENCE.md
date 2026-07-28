# Evidence

Supporting material for [README.md](README.md), which answers the questions you asked. This file is
the working underneath: the measurements, the methodology, and the places where testing my own
assumptions changed my mind. Nothing here is required reading, because the README stands on its own.

Every figure here reproduces from a command, with the exceptions named where they appear: the two
recall figures from prompt versions no longer in the repo, the two stickiness correlations below, and
the rejection counts from the first Second Read batch, all computed over the file or recorded from
runs whose code is gone, none of them printed by anything. Worth knowing before you run any of it: the
rules columns of every eval run without a key, and the model columns need `OPENAI_API_KEY`.
`npm run verify`, `npm run sensitivity`, `npm run eval`, `npm run eval:beyond`, `npm run eval:cross`.

---

## Are the weights arbitrary? I tested it rather than asserting

The obvious objection to a hand-built rubric is that the ranking is an artefact of numbers I invented.
That is testable without any outcome data: jitter every weight and see whether the answer survives.
`npm run sensitivity` does it with a fixed seed, so the figures below reproduce exactly.

**Perturbation, every one of the nine weights randomly moved by up to ±40%, 1,000 times:**

| | Held across trials |
|---|---|
| Same account at #1 | **100%** |
| Same accounts in the top 3 | 99.8% |
| Same accounts in the top 5 | **100%** |
| Same accounts in the top 10 | **100%** |

**Ablation, deleting each signal entirely and re-ranking:** the top 5 is unchanged in all nine cases.
Removing adoption trend, the heaviest signal at 18 of 100, does not move it. Northstar and Oakwell are
not top-ranked because of how I weighted anything; they are extreme on six signals at once.

**And the half of the result that is less flattering, which is the reason to run it at all:**

| Where an account starts | How far it moves under the same jitter |
|---|---|
| Ranks 1–5 | mean **0.03** places, worst 1 |
| Ranks 6–15 | mean 0.29, worst 3 |
| **Ranks 16–30** | mean 0.77, **worst 6** |
| Ranks 31–40 | mean 0.28, worst 2 |

So the ends of the list are a genuine ordering and **the middle is not**. An account at #22 could
reasonably be at #18 or #28, and presenting that as a precise position would be false precision from a
model that has no outcome data to justify it. The product consequence: treat the top ten as an order
and the rest as a band. That is stated on the method page rather than left for a reader to discover.

**The parameter that does move the answer is not a weight.** Priority is risk × value weight × urgency,
and the nine weights only touch the first term. The value floor of 0.45 decides how flat the second one
is: it compresses a 17.5× spread in ARR into a 2.08× multiplier. `npm run sensitivity` now jitters it
too, and it moves the top of the list further than any of the nine weights does.

| Value floor | Where Oakwell Design lands |
|---|---|
| 0.27 (−40%) | #6 |
| **0.45 (shipped)** | **#5** |
| 0.63 (+40%) | #2 |
| 0, no floor, so the value axis is ARR, still clamped at the £210,000 reference | #20 |

Across 1,000 trials with the floor jittered ±40% Oakwell ranges #2 to #6, median #5; jitter the urgency
curve as well and it ranges #2 to #8 and sits in the top 5 in 73% of them. So the top 5 is a property of
the data under any weighting, and Oakwell's position inside it is a property of the floor.

Worth saying plainly, because straight expected loss (risk × ARR × urgency, no floor and no clamp) is
a defensible ranking and it is not this one. It puts Oakwell at #20: the highest-risk account in the
book, renewing in 13 days, ranked below nineteen accounts in better shape because it is worth £12,000.
It also promotes Sterling Aviation #14 → #7, Quantum Public Sector #15 → #8 and Aurora Marine #11 → #9.
The first two the note-risk triage list surfaces independently, which is the mitigation. Aurora it does
not, and that is the honest half of the same result. The floor is a commercial judgement about how much a small
account is allowed to matter, and I would want an operator to argue with it rather than inherit it.

---

## Three columns I did not score, and the evidence for each

The file has 25 columns. Nine are scored, several are identity or filters, and three carry numbers I
deliberately left out. Leaving a column unused is a decision, so each one has a measurement behind it
rather than an oversight.

**`weekly_active_users_30d`, excluded because it barely varies.** As a stickiness ratio (weekly ÷
monthly actives) it looks promising, and it correlates −0.64 with the risk score. But across the whole
book it ranges **55.6% to 69.5%**, a 13.9-point spread. A signal that barely varies cannot separate
accounts; it would add weight without adding information. It is also 0.70 correlated with seat
utilisation and 0.59 with adoption trend, and I am not going to lean on that, because those two are
0.94 correlated with each other and both read `active_users_30d`. 30 of the 100 points already measure
one column twice. That is deliberate, since direction and depth answer different questions and I capped
the pair at 30 combined, but it means the honest reason to drop stickiness is the variance, not the
overlap.

**`contract_term_months`, excluded because it is a proxy for segment rather than for risk.** The raw pattern
is striking: mean risk 35.1 on 12-month terms, 15.7 on 24-month, 11.7 on 36-month. It is also
confounded. Term correlates **0.78** with ARR, and the split is almost total: 1 of 23 twelve-month
accounts is Enterprise, against 7 of 7 on 36-month terms. Scoring term as risk would systematically
penalise every SMB for being an SMB. That is a bias wearing a signal's clothes.

**`products_owned`, excluded because the effect is not there.** Mean risk is 28.6 on one product and
26.4 on two, which is noise. Three-product accounts average 13.2, but there are only three of them.
Multi-product stickiness is a real effect in general; this book is too small to show it.

**`csm_name`, used as a table filter and nothing else, and the largest thing left on the table.**
Aisha Khan holds priority #1, #2, #4, #5 and #7: £637,000 across five accounts, four of them renewing
inside 32 days. Ben Carter's whole book of eight starts at #18. Nothing in the product says that. The
question a head of CS asks after "which renewals need attention" is whether the person who owns them
has the week, and grouping the priority list by CSM is a `groupBy` and a count. I built the CSM's view
because that is what the brief asked for; the manager's view is one screen away and it is the first
thing I would add for a second user.

**One thing the audit did turn up in the model's favour.** The risk distribution has a clean gap
exactly where the Elevated threshold sits: twelve accounts score 45 or above, then nothing until 36. The Elevated threshold sits at 45,
which lands on that break rather than cutting through a cluster. The "needs attention" set is a real
group in the data, not an artefact of where I put a line.

The same audit checked the file for internal contradictions and found none: no account has more
critical tickets than total tickets, more weekly than monthly actives, or a date after the snapshot,
and all 40 ids and names are unique. The dirtiness in this dataset is staleness and omission, not
incoherence.

---

## Where the AI earns its place, in full

**Second Read.** Open any account and it reads the note against the signals the score already counted,
then says what the note adds. One call type, one call per account, no second call.

Three properties are enforced by code rather than promised in a prompt:

1. **The model returns a clause number, not a quote.** Code splits the note into clauses, the model
   points at one by index, and code renders the text. A fabricated quote is not *checked and rejected*:
   it is unrepresentable.
2. **The score is not in the prompt.** The model sees which signals fired and their evidence; never the
   risk number, the band or the rank. If it knew an account scored 15/100 it would reason toward that
   number instead of reading the note, and "the note disagrees with the score" would stop being an
   independent judgement.
3. **An attribution must name a signal that actually fired.** You cannot contest a signal that scored
   nothing. Failed attributions are dropped and the finding is kept without one.

**Counting what the validator threw away caught a bug of mine, not the model's.** The first full batch
over all forty accounts logged 42 rejected outputs, showing on two thirds of the book. That reads like
the checks earning their keep, and I nearly wrote it up that way. Nineteen of the 42 were findings
citing a clause that "does not exist", and the clauses did exist. The prompt numbered them from 0 and
the model answered in 1-based terms, which is what any reader would do. Numbering from 1 and
subtracting on the way in took the same batch to **0 rejections**. A second branch, which let the model
challenge a structured field rather than the note, survived validation once in twenty-three attempts;
that is not a feature, it is noise on two thirds of the accounts, and it was cut. Neither fact was
visible from reading the output. Both came from counting the rejects, which is the argument for putting
them on screen rather than swallowing them.

**It answers yes/no questions, not a multiple choice, and that was a correction.** The first version
asked the model to pick one of four directions. It returned *adds-nothing* for Quantum, the account
this feature exists for, and *adds-opportunity* for a competitor being trialled. I should have
predicted that: `npm run eval` measures this model at 92–93% on detection and **45%** on picking a
label from a taxonomy, and I had built on the second number. Independent binaries sit much closer to
the task that was actually measured.

**The triage list stays deterministic, and that is also measured.** `npm run eval:beyond` scores both
systems on "does this note add risk the signals do not already have":

| | Precision | Recall | Accounts it puts on the list |
|---|---|---|---|
| Keyword rules | 71% | 48% | **9 accounts, £1,281,000** |
| `gpt-4.1-nano` | 67% | 80% | 19 of 28 calm accounts |

Two of the model's false positives, Greenway Bank and BluePeak Software, are a disagreement about the
question rather than a model error: the prompt tells the model to answer yes to a stalled PO, and my
labels answer no because the contradiction detector already puts that pair on the account page. Count
those two as correct and the model's precision is 73%. The table quotes 67%.

A list of 19 out of 28 is not a triage list, it is the book. So the rules select the nine accounts on
the portfolio page and the model reads the note once you are on one. Each does the job it measurably
does better.

**One caveat I will not bury: I tuned that prompt twice against 40 labels I wrote myself.** The first
version biased to "no" (recall 25%), the second to "yes" (recall 96%). Both are earlier prompt versions,
not the one in the table above, and both scored before I corrected the Harbor Retail label. Those
bracket the answer rather than find it, and both are overfitted to a set of forty. `npm run eval:beyond` prints that warning
above its own numbers. `eval:cross` is the closest thing to an
independent check, and even that is qualified: I wrote the fixture and its labels too. What is
genuinely true of it is that nothing in the system was tuned for it: same prompt template, same
regexes, same validators. An honest reading of every number here is that they were produced by the
person being evaluated.

**No second call.** No critic, no self-verifier, no judge. At this model size the deterministic
validator is a strictly better critic than another pass of the same model: it is free, reproducible,
and it cannot be talked out of its answer. The independent checks are the clause-index render, the
firing-signal gate, the enum validator, and the human. The panel is deliberately built to **show what
validation rejected**, because a rejected output is better evidence that the checks are real than a
clean one.

---

## Built for the next dataset, not just this one

This is a snapshot of 40 rows. Everything below exists because the next file will not be.

**Nothing in the score is tuned to this file's contents.** Every weight, threshold, curve and staleness
limit the score uses lives in `lib/config.ts`; `lib/scoring.ts` holds the logic and the two scale
constants it needs, a 0-100 rescale and a day in milliseconds. The next-action table is the exception
and it is worth naming rather than hiding: seven cut-offs are written into `lib/playbook.ts`: 35, 60
and 90 days to renewal, 0.65 and 0.6 on two signal curves, two critical tickets, half a range in the
default, and 7 of its 17 rules fire off the keyword scanner, the least portable component in the repo.
That file is meant to be rewritten per company, so today that means editing code rather than config.
Lifting its numbers into `config.ts` is an hour I did not spend. The value
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

**The data source is swappable.** `PortfolioSource` in `lib/data.ts` is a name and one method,
`load()`, returning raw records and any structural issues together. A warehouse query, an HTTP export
or a CRM API is a new implementation and nothing else changes.
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

**119 tests, and the ones that matter are not the hand-written ones.** Example tests only check cases
the author thought of, which on a 40-row file is a weak claim. `lib/properties.test.ts` uses
`fast-check` to generate thousands of portfolios per run (unmapped enums, negative ARR, dates
centuries apart, lone surrogates, empty books, duplicate ids) and asserts invariants that must hold
for *any* input: the risk score is always finite and in range, priority is never negative, the
evidence panel's contributions always sum to the headline number, ranks are always a permutation of
1..n.

It found three defects in the first run, and all three were the silent kind:

| Found | Why it mattered |
|---|---|
| A trailing comma produced two columns named `""`, and assigning by name meant the second **overwrote the first**. `id,name,,` + `1,bob,x,y` parsed to `{id:"1", name:"bob", "":"y"}` and `x` vanished | Excel writes trailing commas by default. No error was raised anywhere |
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

`npm run check` runs typecheck, lint, tests, the secret scan and the verification harness together.

**What does not port** is the keyword scanner. Finding 5 measured exactly how badly (7%), and that is
the honest boundary between the part of this that is a system and the part that is a transcription of
one company's writing habits.

---

## Reproducing every figure in these two documents

```bash
npm run verify        # the ranking, the findings, and the columns left unscored
npm run sensitivity   # weight perturbation and ablation, fixed seed
npm run eval          # keyword rules vs model on note detection
npm run eval:beyond   # the question the product actually asks
npm run eval:cross    # the same call on a company the system has never seen
npm test              # 119 tests, including the model-output validators
```

Every number in the README and in this file is printed by one of the commands above, with the
exceptions listed at the top of this file: the 25% and 96% recalls of the two discarded prompt versions,
the two stickiness correlations, and the first batch's rejection counts. Both were recorded from
runs I cannot reproduce, because neither prompt is still in the repo. They are in the document
because the tuning history is the caveat, but they are the only two figures here you have to take
on trust, and you should read them as the range I searched rather than as measurements of anything
that ships.
