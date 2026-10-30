# Balancing Chemical Equations

An interactive learning tool for general chemistry students. It runs entirely in the browser: no install, no login, no server.

## Sections

**Coaching**
- **A. Variable Substitution** — students (1) assign a letter to each species, (2) write the atom inventory for each element in terms of those letters (e.g. `8a = c`), (3) choose a variable to set equal to 1 and solve for the others (fractions allowed), (4) clear fractions, and (5) take an atom inventory as a check before submitting. Each step is checked before the next one unlocks, and hints are available along the way.
- **B. Sequential Inventory** — students change one coefficient at a time and watch a live atom inventory (green = matched, red = not). Every change is recorded in an inventory history, like Inventory 1 → 4 in the lecture slides. Fractions such as `25/2` are allowed; once everything balances, students are prompted to clear the fraction. When a polyatomic ion stays intact on both sides, an optional shortcut counts it as a single unit.
- Each method opens with a step-through worked example (isooctane combustion).
- Students can practice on bank problems by level or type in their own equation.

**Testing**
- Five difficulty levels; students pick one and may use either method.
- Unlimited attempts. After two wrong tries, hints unlock in stages: an atom inventory of the student's last attempt, then one revealed coefficient, then the full answer.
- Balanced answers that aren't in lowest terms are marked correct, with a note.
- A blank coefficient counts as 1.

**Instructor** (open the page with `?instructor` at the end of the URL)
- Add a problem by typing only the unbalanced equation. The tool computes the coefficients itself and rejects equations that can't be balanced or that balance more than one way.
- Upload a CSV or tab-delimited file of problems, one per row: `equation, level, source`.
- Browse the full bank with answers.
- Problems you add are saved in that browser only. To give them to all students, click **Download problems.js** and upload the file to the `js/` folder, replacing the existing `problems.js`.

## Problem bank

`js/problems.js` holds 174 problems: the instructor's worksheet and answer-sheet problems, standard additions, and 48 challenge problems from chemteam.info, distributed across levels 1–5. Only the unbalanced equations are stored, so a wrong answer key can't creep in. To check the bank:

```
node tests/verify-bank.js -v
```

## Hosting on GitHub Pages

Settings → Pages → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save.
The site will appear at `https://lufox2021.github.io/Balancing-Chemical-Equations/`.

## Files

- `index.html` — page shell
- `css/styles.css` — styles
- `js/chem.js` — chemistry engine: formula parser (parentheses, hydrates, state labels), exact-fraction solver with uniqueness check, inventory, polyatomic-unit detection
- `js/problems.js` — problem bank
- `js/app.js` — Coaching, Testing and Instructor interface
