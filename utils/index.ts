export * from './file.ts';
export * from './ai.ts';
export * from './browser.ts';

import readline from 'node:readline';
import { Job, type JobInit } from './job.ts';


export const waitForInput = (text: string) => {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(text, () => {
      rl.close();
      resolve(void 0);
    });
  });
};

export const start = <T>(init: JobInit<T, any>, globalState: T) => {
  return new Job(init, globalState);
};
