# UX principles (owner and architect, 18 Oct 2026)

Goal: a first-time user imports a file and reaches a scored, exportable dataset without help, never wonders what to do next, and never misses a problem. Every screen follows these rules. New screens are checked against them before review.

## 1. The journey is visible, without numbers
- The big tabs (Configure, Data Quality, Export, Report) and the left steps (ID, Subscales, Response scales, Bands, Scoring) are not numbered: users do not always need every tab, and the left steps already read top to bottom.
- Only attention is flagged: an amber dot with a count on a tab or step that needs something; a green check on a left step that is complete. No "not started" state is shown.
- Each step panel starts with its title and one plain line saying what it is for.

## 2. One obvious next action, without a sticky footer
- No sticky bottom button (it would duplicate the left steps). The natural next step is offered as a text link on the right of the status bar once something completes (for example "Scored 30 respondents - Next: check data quality"). Existing buttons such as "Continue to export" stay.
- If something needs attention, the status bar shows that first, with its fix button.
- Empty states have one obvious primary button.

## 3. Problems are loud, calm and actionable
- The existing full-width status bar under the toolbar is the single place for state. It changes colour: quiet green (all clear), amber (needs attention: a count and a button "Review N checks"), red only when something is broken. When scoring is waiting for the user, the bar is amber and carries the fix button itself ("Go to Subscale 1").
- The Checks panel (opened from the bar) lists each issue as a small card: what happened, which cells (clickable, naming the respondent ID, highlighting the cell), what the app did about it, and one button to fix it. The Summary-sheet notes and the Data Quality screen use the same wording.
- Never a small icon alone for something important.

## 4. Show the problem where it is
- A cell the app did not count gets an amber corner; hovering gives the reason ("7 is outside 1-5, not counted"). "No band" is amber too.
- Cards show a chip for their own issue; the rail shows a count badge for the step.

## 5. Cards: summary first, detail on demand
- Each card is one line when collapsed: name, key facts, status chip. A card that needs a decision opens itself and scrolls into view; the others stay collapsed.
- Open cards show sections in a fixed order. Advanced options (custom formulas, thresholds) sit under "Advanced".

## 6. Plain words
- Every message says what happened, what the app did, and what the user can do. "Failed" is only used when something really broke.
- A small (i) icon explains each technical term on hover ("Confirm range", "reverse scoring", "summary rows").

## 7. Never a dead end, never an empty page
- Empty states have one obvious button ("Add your first subscale").
- A blocked action says why and what to do. Navigation is never trapped.

## 8. Consistency
- Primary action bottom right, destructive actions ask for confirmation, the same word for the same thing everywhere (item, subscale score, overall score, summary rows).
- A quiet "All changes saved on this device" indicator reassures local-first users.
- Every fact appears in exactly one place on a card (no duplicate editors); controls appear only when they apply to the data on screen.

## 9. Fast path first
- Defaults give a sensible result in the fewest steps: the app detects and suggests, the user confirms. A dismissible first-run checklist at the top of Configure lists the five steps.

## Build plan
- Now (P2c-1b, P2c-2): the card pattern and one-line notices inside Response scales; the status bar gets the "Go to" fix button when scoring is waiting.
- After P2d, "clarity pass" C1: attention badges (no numbers) on tabs and left steps, the contextual next-step link in the status bar, the Checks bar and panel, amber cell marks, toolbar cleanup (remove the duplicate Data Quality button), empty states.
- Clarity pass C2: (i) tips, first-run checklist, saved indicator, wording and step-name pass (for example Bands and Scoring), unified notes in the Summary sheet and Data Quality.
- Each pass is checked against this file. Prompts for C1 and C2 are written after P2d.
