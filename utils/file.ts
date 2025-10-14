import fs from 'fs/promises';
import path from 'path';
import { parseFile, type ParserOptionsArgs } from 'fast-csv';

async function ensureDir(filepath: string) {
  const dir = path.dirname(filepath);
  await fs.mkdir(dir, { recursive: true });
}

const getSavePath = (filename: string) => {
  return path.resolve('jobs', process.env.JOB_NAME || '', 'output', filename);
};


export const getJobFilePath = (filename: string) => {
  return path.resolve('jobs', process.env.JOB_NAME || '', filename);
};

export async function saveToJSON(
  data: unknown,
  filepath: string,
  prettyPrint = true
): Promise<void> {
  filepath = getSavePath(filepath);
  await ensureDir(filepath);
  const content = prettyPrint
    ? JSON.stringify(data, null, 2)
    : JSON.stringify(data);
  await fs.writeFile(filepath, content, 'utf8');
  console.log(`✅ Saved to ${filepath}`);
}

export async function saveToCSV(
  data: unknown,
  filepath: string
): Promise<void> {
  filepath = getSavePath(filepath);
  await ensureDir(filepath);

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('CSV export requires non-empty array of objects');
  }

  // Extract headers from the first object
  const headers = Object.keys(data[0]);
  const csvHeader = headers.join(',') + '\n';

  // Convert data to CSV rows
  const csvRows = data.map((item: Record<string, unknown>) => {
    return headers
      .map(header => {
        const value = String(item[header] ?? '');
        // Escape commas and quotes
        if (
          value.includes(',') ||
          value.includes('"') ||
          value.includes('\n')
        ) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      })
      .join(',');
  });

  const csvContent = csvHeader + csvRows.join('\n');
  await fs.writeFile(filepath, csvContent, 'utf8');
  console.log(`✅ Saved ${data.length} records to ${filepath}`);
}

export async function saveToTXT(
  data: unknown,
  filepath: string
): Promise<void> {
  filepath = getSavePath(filepath);
  await ensureDir(filepath);
  const content =
    typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  await fs.writeFile(filepath, content, 'utf8');
  console.log(`✅ Saved to ${filepath}`);
}

export async function appendToTXT(
  data: unknown,
  filepath: string
): Promise<void> {
  filepath = getSavePath(filepath);
  await ensureDir(filepath);
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  await fs.appendFile(filepath, content + '\n', 'utf8');
  console.log(`✅ Appended to ${filepath}`);
}

export async function loadJSON<T = unknown>(filepath: string): Promise<T> {
  const content = await fs.readFile(filepath, 'utf8');
  return JSON.parse(content);
}

export function loadCSV<T = unknown>(
  filepath: string,
  options: ParserOptionsArgs
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const rows: T[] = [];
    parseFile(filepath, options)
      .on('error', error => reject(error))
      .on('data', row => {
        rows.push(row);
      })
      .on('end', () => {
        resolve(rows);
      });
  });
}

export async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}
