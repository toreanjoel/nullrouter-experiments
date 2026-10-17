# Changes

Newest first.

## Runs: what each one had

All five are Opus builds of the same `spec.md`. Times are local (+02:00), taken from the chat logs and spec files; commits are nullrouter's.

| Run | Ran | nullrouter at | Cost | Tokens | Turns | Read:written | Cache reads | Spec size |
|---|---|---|---|---|---|---|---|---|
| pineapple-1 | 15 Oct 19:31–20:25 | `87cc47d` | $8.53 | 9.3M | 116 | 47:1 | $1.72 | 11.1 KB |
| pineapple-2 | 16 Oct 00:41–01:15 | `c111ebb` | $7.34 (−14%) | 10.7M | 72 | 61:1 | $2.07 | 8.8 KB |
| pineapple-3 | 16 Oct 12:44–14:16 | `0c377fc` + plan first | $5.58 (−24%) | 3.7M | 32 | 23:1 | $0.67 | 5.0 KB |
| pineapple-4 | 16 Oct 20:01–20:29 | `5ff22fc` | $5.86 (+5%) | 3.9M | 26 | 21:1 | $0.70 | 3.6 KB |
| pineapple-5 | 16 Oct 23:59–17 Oct 00:16 | `8ef10a9` | $3.74 (−36%) | 2.9M | 32 | 27:1 | $0.53 | 2.7 KB |

What went in before each run:

- **pineapple-1** (baseline): Cheaper specs, Spec plan and execute, Escalation and tools. The escalation merge landed at 19:30, six minutes before the spec froze.
- **pineapple-2**: adds Terse runs (`ea72635`) and Auto-only routing, warm forks (`c111ebb`). No compactions ($0.61 in run 1) and no model switches. Turns fell 116 → 72 and output $3.88 → $3.48. Tokens rose: each turn read more (61:1).
- **pineapple-3**: adds Effort live per turn (`3f18c4d`), Read-only steps to a low-effort fork (`0c377fc`) and Plan first (`054931b`). Plan first was committed at 13:15, during the run, but the run's spec was already written the plan-first way (blank, no C4 template), so it was live. Tokens fell 65% and cache reads 68%. The spec in context was 5.0 KB, against 8.8 KB. The score shows no delegated-reads line, so the fork-and-worker path cannot be credited with any of it.
- **pineapple-4**: adds Forks that keep the cache (`6422bb7`, `4bae222`, `5a03916`, `5ff22fc`, 18:50–19:11). Turns fell 32 → 26. Cost rose $0.28, and the $0.86 in compactions (none in run 3) is more than the whole rise. New context fell $1.67 → $0.75, and output rose $3.12 → $3.51. No delegated reads were recorded, so none of this can be credited to the new fork paths. The spec in context was 3.6 KB.
- **pineapple-5**: adds Edit, unless new (`29fa391`, 23:39) and No long summary at either end (`8ef10a9`, 23:51). Cost fell $2.12 (−36%). Output fell $3.51 → $2.09, and there were no compactions ($0.86 in run 4). Those two lines account for nearly all of the drop. New context rose $0.75 → $1.07, and turns rose 26 → 32. The score still flags two whole-file writes (calls 21 and 22), even though Write over an existing file is now blocked by default. No delegated reads were recorded, so the fork paths can't be credited here either. The spec in context was 2.7 KB.

Not like for like: pineapple-1 ran headless WebGPU checks with screenshots, and pineapple-2 and -3 never opened a browser. pineapple-4 and -5 ran their physics headless in Node but never compiled their shaders. pineapple-5's spec ruled out automated checks: the user checks the result by hand in a browser. pineapple-3's spec also ruled out tests. Some of the drop is less work, not cheaper work.

A Sonnet build (the old pineapple-2: $1.96, 23 turns) was removed from the comparison, because the runs measure Opus.

## Edits, not rewrites; short endings

- **Edit, unless new** (`29fa391`). `whole_file_writes` now defaults to `"block"`. A Write over an existing file is refused with "use Edit", so a change sends only the part that changed. New files are still written whole. Set `"flag"` or `"allow"` to turn it off.
- **No long summary at either end** (`8ef10a9`). The plan chat ends with "see spec" and writes no plan file or recap. At the end of a run, the transcript shows only the line naming its `.progress.md`, because the spec already says the rest.

## Forks that keep the cache

- Effort used to follow the user's prompts, so a basic call between steps could take the previous high effort and cost more than it needed to. Basic reads now go to a low-effort fork of the warm session.
- **Read asked in chat → fork** (`5ff22fc`). A chat message that only reads files, sent on a warm Claude session with nothing attached, is answered by a low-effort fork. The main model gets the brief on its next turn and still reads its own cache. If the fork can't answer, the message goes to the main model as usual.
- **Briefs always arrive** (`5a03916`). When a run ends, fork briefs that no work step used are carried into the main model's next chat turn or run.
- **Reads in a row share one fork** (`4bae222`). Three read-only steps in a row on the same model start one fork, not three. A read that comes back empty goes to the executor, and the rest get their own forks.
- **Fork cache shown** (`6422bb7`). The fork's first turn records how much it read against how much it wrote. The step shows "cache 97% read", or "cold fork: wrote …" when it rebuilt the context. `/score` counts how many forks read the cache and how many rebuilt it.

## Plan first

- New chats, `/clear` and `/cd` start in plan mode (`plan_first`, on by default).
- The spec starts blank and is written by talking. The C4 questions are a private checklist, written with ids, so locks, slices, build order and lint still work.
- The spec sits behind the Spec button.

## Read-only steps to a low-effort fork

- A step that only reads forks the executor's session (same cache prefix) at the lowest effort. A worker or the fork reads, and a short summary goes back into the main thread.
- `delegate_reads_to` names a text-only worker model. Its commands run under a read-only allowlist, at most 3 per request.
- The round trip is bounded by the executor's remaining cache life. With no warm session, the step runs inline.
- `/score` shows delegated reads, the tokens kept out of the main thread, and fork and worker cost against inline.

## Effort live per turn

- A kept Claude process takes each turn's effort through `apply_flag_settings`, with the cache kept.
- Keep-alive pings run at low effort. A refused change keeps the old level and reports it.
- Effort forks, mid-goal effort restarts and `restart_pays` are removed.

## Auto-only routing, warm forks

- **Optimize mode removed** (^v, `/optimize`, setting, reader picker, `optimize` in `models.toml`). Why: it moved the main model mid-session, and every model switch rewrote the whole context at write price. Now: pin a model, or `auto`.
- **Effort by fork.** Jev's effort differs from the running one → fork the warm session at that effort, up or down. Same model, same cached prefix: measured 15,429 read, 25 written. No rewrite.
- **Forked turns recorded** as `via = "fork"`.
- **Main model stays.** Picked once, at start or at a reset. It only moves up when the work is beyond it, and only while context is under `stay_context`.
- **`stay_context` 100k → 20k.** Past it, the main model is kept whatever the task, so the cache is never rewritten.
- **Harder than the main model → side session.** A stronger model (e.g. Opus) gets a short brief in its own session; the answer comes back as a brief into main. Measured: 8 Opus side turns read ~108k vs ~1.76M per turn on main-session Opus.
- **Bulky reads and simple lookups** go to fresh Haiku workers with small contexts.
- **Spec steps** take the lowest capable model first; stuck steps climb the escalation ladder.
- **`/models`** shows the index score each effort needs.
- **`model_share.py`** gained columns: `via` (main / fork / side) and effort sent ≠ suggested.
- Saved `clever` setting ignored.

## Terse runs

- Terse reply rules; shorter system, error and backend messages.
- Image reads blocked in the tool hook (config flag).
- Spec goals can end "yours to check" (human checks).
- Diffs as activity rows with +/- counts; steps keep their changes.
- Live run panel: stepper, progress bar, chat row.
- "continue" carries a stopped spec run on, like `/run`.

## Escalation and tools

- Model strength ladder; stuck steps escalate to a stronger model.
- Specs can be frozen and amended; acceptance targets; goal and pointer warnings; phases.
- `/score`: context split, flags, outliers, per-shipped cost, image tokens.
- Jev price and spec run records stored.
- `nullrouter.tools`: capped command output, write hooks, param sweeps.

## Spec plan and execute

- Plan mode owns the spec; leaving discards an unrun plan, a run one stays read only.
- Stopped or failed runs carry on in place; plan mode talks the fix over meanwhile.
- Contradictions from the check show as warnings on the spec.
- The check names the main model and why; C4 template per task.
- Context cap default 180k, never past 90% of a model's window.

## Cheaper specs

- Warm sessions, briefs between steps, goals, a context cap, cost by cause.
- Warm-up and keep-alive for spec runs; idle models' caches kept until their next step.
- Failures recorded; summary always last.
- `/score`, `/insights`, `/btw`, consult.
