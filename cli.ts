#!/usr/bin/env node --experimental-strip-types

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

async function main() {
  const jobNameArg = process.argv[2];

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const jobsDir = path.resolve(__dirname, "jobs");

  // Collect available jobs
  const jobs = fs.readdirSync(jobsDir).filter((f) =>
    fs.existsSync(path.join(jobsDir, f, "index.ts"))
  );

  let jobName = jobNameArg;

  // If no job provided, let the user pick
  if (!jobName) {
    console.log("⚡ Please choose a job to run:\n");
    jobs.forEach((job, idx) => {
      console.log(`  ${idx + 1}. ${job}`);
    });

    process.stdout.write("\nEnter number: ");
    jobName = await new Promise<string>((resolve) => {
      process.stdin.setEncoding("utf-8");
      process.stdin.once("data", (input) => {
        const choice = parseInt(input.toString().trim(), 10);
        if (!isNaN(choice) && choice >= 1 && choice <= jobs.length) {
          resolve(jobs[choice - 1]);
        } else {
          console.error("❌ Invalid choice");
          process.exit(1);
        }
      });
    });
  }

  if (!jobs.includes(jobName)) {
    console.log("❌ Invalid job name.\n⚡ Available jobs:");
    jobs.forEach((job) => console.log(`  - ${job}`));
    process.exit(1);
  }

  process.env.JOB_NAME = jobName;

  try {
    const jobPath = path.resolve(jobsDir, jobName, "index.ts");
    const jobModule = await import(jobPath);

    if (typeof jobModule.default === "function") {
      await jobModule.default();
    } else {
      throw new Error(`Job "${jobName}" has no default export function.`);
    }
  } catch (err) {
    console.error(`❌ Failed to run job "${jobName}":`, err);
    process.exit(1);
  }
}

main();
