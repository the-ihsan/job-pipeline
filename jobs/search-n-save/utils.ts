import fs from 'fs/promises';
import path from 'path';
import { waitForInput } from '../../utils/index.ts';


export async function getManualFilePath(
  trySaveTo: string
): Promise<[string, number]> {
  const dirname = path.dirname(trySaveTo);

  const basename = path.basename(trySaveTo);
  const ext = path.extname(basename);
  const filename = basename.replace(ext, '');
  const num_str = filename.match(/(\d+)$/)?.[1]!;
  const no_num = filename.replace(num_str, '');
  let num = parseInt(num_str);

  while (true) {
    const filepath = path.join(dirname, `${no_num}${padNumber(num)}${ext}`);
    try {
      await fs.access(filepath);
      // File exists, ask for new starting number
      console.log(`⚠️  Image file ${filename} already exists!`);
      const newStart = (await waitForInput(
        'Enter a new starting number: '
      )) as string;
      const newNumber = parseInt(newStart.trim());
      if (isNaN(newNumber) || newNumber < 0) {
        console.log('❌ Invalid number.');
        continue;
      }
      num = newNumber;
    } catch (error) {
      return [filepath, num];
    }
  }
}

export const padNumber = (num: number) => {
  return num.toString().padStart(10, '0');
};

