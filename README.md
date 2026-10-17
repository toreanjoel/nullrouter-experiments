# nullrouter-experiments

Measuring the value of AI-assisted engineering, not just the cost: real runs
on real tasks, with the prompts, settings, builds and data.

The tool these runs come from is a personal model router, and it isn't
public. What is here is the evidence: what was asked, what ran, what it
cost, and what came out, so the numbers can be checked and the runs compared.

## Experiments

| Date | Question | What differed | Cost | Controlled? |
|---|---|---|---|---|
| 2026-10-14 | [One shot against a spec with goals and checks, same prompt](2026-10-14-island-one-shot-vs-spec) | Spec, goals and checks | $19.07 vs $56.80 | No |
| 2026-10-15 | [Same spec, built at later nullrouter commits](2026-10-15-pineapple-cost-across-router-commits) | nullrouter commit | $4.92 avg vs $7.70 / $6.94 | No |

## How runs are measured

- **One pricing basis per figure.** Every run states the per-token prices used.
  Cache writes are priced at the provider's write rate, not the plain input
  rate.
- **Cost is split into output, cache reads and cache writes,** since in long
  runs the cache is most of the bill.
- **Subscription runs are priced as metered API use** and labelled as such.
- **Each run says whether it was controlled,** meaning the same setup apart
  from one change, and how many times it was run.
- **Old results aren't rewritten.** Corrections are added to the experiment
  they affect.

This is one engineer's evidence from a small number of runs, not a general
claim.
