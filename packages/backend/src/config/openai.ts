import OpenAI from 'openai';
import { env } from './env';

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY.');
    }
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return client;
}
