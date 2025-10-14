import { appendToTXT, start } from '../../utils/index.ts';
import { glob } from 'glob';
import fs from 'fs/promises';

const GLOB_PATTERNS = ['**/result-*.txt'];
const OUTPUT_FILE = 'out.txt';

interface State {
  inputFiles: string[];
  outputFile: string;
}

const init = async ({ inputFiles }: State) => {
  const allFiles = await glob(inputFiles);
  return allFiles;
};

export default async function main() {
  const inputFiles = GLOB_PATTERNS;
  const state = { inputFiles, outputFile: OUTPUT_FILE };
  await start<State>(init, state)
    .sort((a: string, b: string) => a.localeCompare(b))
    .pipeEach(async (file: string, { outputFile }: State) => {
      const content = await fs.readFile(file, 'utf8');
      appendToTXT(content + '\n\n\n', outputFile);
    })
    .run();
}
