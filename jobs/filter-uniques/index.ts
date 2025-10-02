import path from 'path';
import { start, loadCSV } from '../../utils/index.ts';

const dirname = path.dirname(new URL(import.meta.url).pathname);

interface Data {
  Name: string;
  Email: string;
  Source: string;
}

const init = async () => {
  const filepath = path.join(dirname, 'data.csv');
  return await loadCSV(filepath, { headers: true });
};

export default async function main() {
  const uniques = new Set<string>();
  await start<undefined>(init, undefined)
    .pipeEachFiltered<Data>(arr => {
      if (uniques.has(arr.Email)) {
        return undefined;
      }
      uniques.add(arr.Email);
      return arr;
    })
    .saveAs('filtered.csv')
    .run();
}
