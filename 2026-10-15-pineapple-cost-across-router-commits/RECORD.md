# Record a run

Paste this into a chat opened in this folder after a run has finished and its `/score` has been taken. Replace `N` with the run's number.

---

Record pineapple-N the way pineapple-3 and pineapple-4 are recorded. Change only the files listed here. Write only numbers you read from the sources below. Do not estimate.

**Find the run**
- Score: `pineapple-N/.nullrouter/score-<id>.svg`. Its 8-character id is the start of the session id. If there is more than one, use the newest one tagged `build`.
- Numbers: `sqlite3 -readonly ~/.config/nullrouter/nullrouter.db`
  - `score_sessions`: the row whose `session_id` starts with that id. It gives `started`, `ended`, `ts` (the time the score was taken), `calls`, the token columns, `cost`, `cost_*`, `read_per_written` and `spec`.
  - `delegations`: the rows for that session (how many reads went to a fork, and fork and worker cost).
  - `messages`: the run's last assistant message (what was built, findings, what is unchecked).
- Don't match on `project` or `cwd`: a chat can run in another run's folder. Match on the score's id.
- Times are local (+02:00). Tokens are input + cache_write + cache_read + output.
- Spec size: the byte count of `pineapple-N/.nullrouter/specs/<spec>.md`, written in KB.
- Commits: in `../../nullrouter`, list `git log` from after the last commit named in `CHANGES.md` up to the run's start time. The run's "nullrouter at" is the last commit before it started. Commits made after the run ended don't belong to it.

**Write**
1. `pineapple-N/score.svg`: a copy of the score svg.
2. `pineapple-N/pineapple-N.html`: a copy of the built single file, wherever the run's build script writes it.
3. `pineapple-N/REPORT.md`: the same sections as `pineapple-4/REPORT.md`: Cost, Where the money went, Which models, Compared (every run so far), What was built, Verification (only checks the run actually ran), Not done at this snapshot.
4. `CHANGES.md`:
   - Add a row to the runs table. Give the cost as a % change against the previous run, and update the run count in the sentence above the table.
   - Add a "What went in before" bullet: the commits, what moved against the previous run and which cost line caused it, and whether the new features actually fired (for example, zero delegations means they can't be credited).
   - Add the "not like for like" differences, such as a browser or headless check, or tests ruled out.
   - Add a changelog section at the top for the new commits, written from their diffs, with each short hash in brackets. Fold in any loose notes I left at the bottom of the file, then remove them.
5. `README.md`:
   - Add the run's row to the runs table, the same as the row in `CHANGES.md` plus a link to its report.
   - Add the run to the `xychart-beta` graph: a new x-axis label and its cost in the first `line` list. Add one more value to each flat baseline line (7.70 and 6.94). Raise the y-axis top if the cost goes above it.
   - Update the "from pineapple-1" percentages, plus the Summary average and range if the run counts toward them (finished runs from pineapple-5 onward).

**Check**
- `cmp` each copy against its source.
- The runs tables in `CHANGES.md` and `README.md`, and the graph, each have one entry per `pineapple-*` folder.
- Each number in the report matches the svg and the DB row.

Then reply with the run's card (run, cost, tokens and turns, read:written, cache reads) and anything you left out and why.
