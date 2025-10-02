import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from 'dotenv';

config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

class RateLimiter {
  private requestCount = 0;
  private lastResetTime = Date.now();
  private readonly limit: number;
  private readonly window: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.window = windowMs;
  }

  private formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => {
      let remaining = ms;
      const interval = setInterval(() => {
        remaining -= 500;
        process.stdout.write(`\r⏳ Rate limit: ${this.formatTime(remaining)}  `);
        if (remaining <= 0) {
          clearInterval(interval);
          process.stdout.write('\r\n');
          resolve();
        }
      }, 500);
    });
  }

  async checkLimit(): Promise<void> {
    if (this.requestCount >= this.limit) {
      const elapsed = Date.now() - this.lastResetTime;
      const remainingTime = this.window - elapsed + 1000;
      
      if (remainingTime > 0) {
        await this.wait(remainingTime);
      }
      
      this.lastResetTime = Date.now();
      this.requestCount = 0;
    }
    
    this.requestCount++;
  }
}

// Default rate limiter: 10 requests per 60 seconds
const defaultLimiter = new RateLimiter(10, 60 * 1000);

export interface AIConfig {
  model?: string;
  rateLimiter?: RateLimiter;
}

export async function generateContent(
  prompt: string,
  config: AIConfig = {}
): Promise<string> {
  const { model: modelName = 'gemini-2.5-flash', rateLimiter = defaultLimiter } = config;

  await rateLimiter.checkLimit();

  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw error;
  }
}


export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  return new RateLimiter(limit, windowMs);
}

