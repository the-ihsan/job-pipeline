# Scraping Pipeline

A composable, type-safe pipeline for web scraping with Puppeteer and AI-powered data extraction.

## 🎯 Features

- **Pipeline Architecture**: Compose jobs with `start().pipe().pipe().saveAs()`
- **Type-Safe**: Full TypeScript support with strong typing
- **Error Handling**: Built-in retry logic and error recovery
- **Rate Limiting**: Automatic rate limiting for API calls
- **Modular**: Reusable utilities for common scraping patterns
- **Easy to Extend**: Add new jobs without touching core code

## 📁 Project Structure

```
scraping-pipeline/
├── jobs/
│   ├── newspaper-scraper/    # Scrape newspaper contact info
│   └── channel-processor/    # AI-powered data extraction
├── utils/
│   ├── pipeline.ts           # Core pipeline implementation
│   ├── puppeteer.ts          # Puppeteer helpers
│   ├── ai.ts                 # AI/Gemini utilities
│   └── file.ts               # File I/O utilities
├── types/
│   └── index.ts              # Shared type definitions
└── output/                   # Job output files
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Environment Variables

Create a `.env` file:

```bash
GEMINI_API_KEY=your_api_key_here
```

### 3. Run a Job

```bash
# Run newspaper scraper
pnpm newspaper

# Run channel processor
pnpm channels
```

## 📝 Creating a New Job

Here's a minimal example:

```typescript
// jobs/my-job/index.ts
import { start } from '../../utils/pipeline.js';
import { createBrowser } from '../../utils/puppeteer.js';

interface JobState {
  browser?: Browser;
  data?: string[];
}

async function initBrowser(state: JobState) {
  return { ...state, browser: await createBrowser() };
}

async function scrapeData(state: JobState) {
  // Your scraping logic here
  const data = ['result1', 'result2'];
  return { ...state, data };
}

export default async function main() {
  await start<JobState>({})
    .pipe(initBrowser, 'Initialize Browser')
    .pipe(scrapeData, 'Scrape Data')
    .saveAs('output.json');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
```

Add to `package.json`:

```json
{
  "scripts": {
    "my-job": "tsx jobs/my-job/index.ts"
  }
}
```

## 🔧 Utility Functions

### Pipeline API

```typescript
import { start } from './utils/pipeline.js';

const result = await start<State>(initialState, {
  errorHandling: 'retry',  // 'stop' | 'continue' | 'retry'
  retryAttempts: 3,
  retryDelay: 1000,
  verbose: true
})
  .pipe(step1)
  .pipe(step2)
  .saveAs('output.csv', { format: 'csv' });

// Or run without saving
const result = await start<State>({})
  .pipe(step1)
  .run();
```

### Puppeteer Utilities

```typescript
import {
  createBrowser,
  extractText,
  extractAttribute,
  processBatch,
  navigateWithRetry
} from './utils/puppeteer.js';

const browser = await createBrowser({ headless: true });
const page = await browser.newPage();

await navigateWithRetry(page, 'https://example.com');
const title = await extractText(page, 'h1');
const href = await extractAttribute(page, 'a', 'href');

// Process items in batches
const results = await processBatch(
  items,
  async (item) => processItem(item),
  5  // batch size
);
```

### AI Utilities

```typescript
import {
  extractStructured,
  generateContent,
  createRateLimiter
} from './utils/ai.js';

// Extract structured data
const result = await extractStructured<{ name: string, email: string }>(
  'Contact us at hello@example.com',
  '{ "name": "string", "email": "string" }'
);

// Custom rate limiter
const limiter = createRateLimiter(15, 60000); // 15 req/min
```

### File Utilities

```typescript
import {
  saveToJSON,
  saveToCSV,
  loadJSON,
  fileExists
} from './utils/file.js';

await saveToJSON(data, 'output/data.json', true);
await saveToCSV(arrayData, 'output/data.csv');

const loaded = await loadJSON<MyType>('output/data.json');
```

## 🎨 Best Practices

### 1. **Keep Jobs Self-Contained**

Each job should have its own directory and manage its own state:

```
jobs/
├── job1/
│   ├── index.ts        # Main job logic
│   ├── types.ts        # Job-specific types (optional)
│   └── config.ts       # Job config (optional)
```

### 2. **Use Type-Safe State**

Always define your state interface:

```typescript
interface JobState {
  browser?: Browser;
  data?: MyData[];
  processed?: ProcessedData[];
}
```

### 3. **Handle Errors Gracefully**

Use appropriate error handling strategies:

```typescript
start<State>({}, {
  errorHandling: 'retry',  // Retry failed steps
  retryAttempts: 3,
  retryDelay: 2000
})
```

### 4. **Name Your Steps**

Provide descriptive names for better debugging:

```typescript
.pipe(initBrowser, 'Initialize Browser')
.pipe(scrapeData, 'Scrape Product Data')
.pipe(enrichData, 'Enrich with AI')
```

### 5. **Batch Processing**

Process large datasets in batches to avoid overwhelming resources:

```typescript
import { processBatch } from './utils/puppeteer.js';

const results = await processBatch(items, processItem, 10);
```

## 🔍 Example Jobs

### Newspaper Scraper

Scrapes Bangladesh newspaper websites for contact information:

```bash
pnpm newspaper
```

Output: `output/newspapers.csv`

### Channel Processor

Uses AI to extract structured data from text:

```bash
pnpm channels
```

Output: `output/channels.csv`

## 🛠️ Advanced Configuration

### Custom Save Options

```typescript
.saveAs('output.csv', {
  format: 'csv',        // 'json' | 'csv' | 'txt'
  outputDir: 'output',
  prettyPrint: true     // JSON only
})
```

### Pipeline Without Saving

```typescript
const result = await start<State>({})
  .pipe(step1)
  .pipe(step2)
  .run();

if (result.success) {
  console.log(result.data);
  console.log(`Completed in ${result.metadata.duration}ms`);
}
```

## 📊 Type Safety

All utilities are fully typed:

```typescript
import type { Step, JobResult, PipelineConfig } from './types/index.js';

const myStep: Step<MyState> = async (state) => {
  // TypeScript ensures state matches MyState
  return { ...state, newField: 'value' };
};

const result: JobResult<MyState> = await pipeline.run();
```

## 🐛 Debugging

Enable verbose logging:

```typescript
start<State>({}, { verbose: true })
```

Check linter errors:

```bash
pnpm lint
```

## 📦 Dependencies

- **puppeteer-extra**: Stealth scraping
- **@google/generative-ai**: Gemini AI integration
- **dotenv**: Environment variable management
- **tsx**: Fast TypeScript execution

## 🤝 Contributing

When adding new utilities:

1. Add to appropriate `utils/*.ts` file
2. Export types from `types/index.ts`
3. Document in README
4. Add example usage

## 📄 License

MIT

