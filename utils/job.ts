import { saveToCSV, saveToJSON, saveToTXT } from './file.ts';

export interface JobStep<T, I, R> {
  (data: I, state: T): Promise<R> | R;
}

export interface JobStepSliced<T, I, R> {
  (data: I[], startIndex: number, state: T): Promise<R> | R;
}

export interface JobStepEach<T, I, R> {
  (data: I, state: T, index: number | string): Promise<R> | R;
}

export interface JobStepSort<I> {
  (a: I, b: I): number;
}

export interface JobInit<T, R> {
  (state: T): Promise<R> | R;
}

export class Job<T> {
  private globalState: T;

  private steps: JobStep<T, any, any>[] = [];
  private init: JobInit<T, any> | null = null;

  constructor(init: JobInit<T, any>, globalState: T) {
    this.globalState = globalState;
    this.init = init;
  }

  pipe<R>(fn: JobStep<T, any, R>) {
    this.steps.push(fn);
    return this;
  }

  sort<I>(fn: JobStepSort<I>) {
    this.steps.push(data => {
      return data.sort(fn);
    });
    return this;
  }

  pipeSliced<R>(fn: JobStepSliced<T, any, R>, sliceSize: number) {
    this.steps.push(async (data, state) => {
      if (!data || !Array.isArray(data)) {
        throw new Error('Data is not an array');
      }
      const results = [];
      for (let i = 0; i < data.length; i += sliceSize) {
        const result = await fn(data.slice(i, i + sliceSize), i, state);
        if (result && Array.isArray(result)) {
          results.push(...result);
        }
      }
      return results;
    });
    return this;
  }

  pipeEach<I>(fn: JobStepEach<T, I, any>) {
    this.steps.push(async (data, state) => {
      const results = [];
      for (const i in data) {
        results.push(await fn(data[i], state, i));
      }
      return results;
    });
    return this;
  }

  pipeEachFiltered<I>(fn: JobStepEach<T, I, any>) {
    this.steps.push(async (data, state) => {
      const results = [];
      for (const i in data) {
        const result = await fn(data[i], state, i);
        if (result) {
          results.push(result);
        }
      }
      return results;
    });
    return this;
  }

  saveAs(filename: string) {
    this.steps.push(async data => {
      const fileTyp = filename.split('.').pop();
      if (fileTyp === 'csv') {
        await saveToCSV(data, filename);
      } else if (fileTyp === 'json') {
        await saveToJSON(data, filename);
      } else {
        await saveToTXT(data, filename);
      }
      return data;
    });
    return this;
  }

  async run() {
    if (!this.init) {
      throw new Error('Init not set');
    }

    let state = this.globalState;
    let data = await this.init(state);
    for (const step of this.steps) {
      data = await step(data, state);
    }

    return data;
  }
}
