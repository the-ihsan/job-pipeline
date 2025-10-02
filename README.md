# Job Pipeline

A tiny TypeScript job runner and composable pipeline for scraping/ETL with Puppeteer and optional AI (Gemini).

## 🎯 Features

- **CLI job runner**: `pnpm job <jobName>` or interactive picker
- **Composable pipeline**: `start(init, state).pipe(...).saveAs(...).run()`
- **Built-in CSV/JSON/TXT output** stored per-job under `jobs/<job>/output/`
- **Gemini client + rate limiting** in `utils/ai.ts` (optional)

## 📦 Requirements

- Node.js ≥ 22 (uses `--experimental-strip-types`)
- pnpm ≥ 8

## 🚀 Quick start

```bash
pnpm install

# Run a job directly
pnpm job newspaper1

# Or pick interactively (shows a numbered list)
pnpm job
```

The CLI script is `cli.ts`. When a job runs, the environment variable `JOB_NAME` is set automatically and outputs are written under `jobs/$JOB_NAME/output/`.

## 🧰 Available jobs

- **newspaper1**: Crawl `allonlinebanglanewspapers.com` to collect newspaper names and details.
  - Saves: `jobs/newspaper1/output/newspaper-d.json`
  - Extracts emails with preferences and saves: `jobs/newspaper1/output/newspaper-with-email-d.csv`
- **search-helper**: Opens Google queries for each scraped name to manually find emails; waits for Enter to continue. Does not write output files.
- **filter-uniques**: De-duplicates rows by `Email` from `jobs/filter-uniques/data.csv` and saves `jobs/filter-uniques/output/filtered.csv`.

## 🔧 Scripts

- `pnpm job` — run the CLI (`node --experimental-strip-types cli.ts`)
- `pnpm lint` — TypeScript typecheck only (`tsc --noEmit`)

## 🗂️ Project layout

```
rough/
├── cli.ts                  # Job runner (argument or interactive)
├── jobs/
│   ├── newspaper1/         # Scraper that saves JSON + CSV
│   │   ├── index.ts
│   │   ├── utils.ts
│   │   └── output/
│   ├── search-helper/      # Manual assist flow (opens searches)
│   │   └── index.ts
│   └── filter-uniques/     # CSV de-dup by Email
│       ├── data.csv
│       └── index.ts
├── utils/
│   ├── ai.ts               # Gemini client + rate limiter
│   ├── file.ts             # saveToJSON/CSV/TXT, loadCSV/JSON
│   ├── job.ts              # Pipeline implementation
│   └── index.ts            # Public exports + start(), waitForInput()
└── tsconfig.json
```

## 🧪 Using the pipeline

Minimal example of a job using the pipeline:

```ts
// jobs/my-job/index.ts
import { start } from '../../utils/index.ts';

interface JobState {
  counter: number;
}

const init = async ({ counter }: JobState) => {
  return Array.from({ length: counter }, (_, i) => i + 1);
};

const squareAll = async (nums: number[]) => nums.map(n => n * n);

export default async function main() {
  await start<JobState>(init, { counter: 5 })
    .pipe(squareAll)
    .saveAs('squares.json') // -> jobs/my-job/output/squares.json
    .run();
}
```

Key helpers:

- `pipe(fn)`: pass whole data through a step
- `pipeSliced(fn, size)`: call a step on array slices (batched)
- `pipeEach(fn)`: call a step per item, collect results
- `pipeEachFiltered(fn)`: like `pipeEach` but drops falsy returns
- `saveAs(filename)`: auto-saves into `jobs/$JOB_NAME/output/`

## 🔑 Environment variables

- `GEMINI_API_KEY` (optional): required only if your job uses `utils/ai.ts`.
  - Loaded via `dotenv` if present in a `.env` file at repo root.

## 📝 Notes

- Puppeteer jobs run headless and include Linux-friendly flags (no-sandbox, etc.).
- Outputs are created lazily; directories are made if missing.

## 📄 License

MIT

