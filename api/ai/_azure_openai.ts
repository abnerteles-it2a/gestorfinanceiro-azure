import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || 'https://abner-7506-resource.cognitiveservices.azure.com/';
const API_KEY = process.env.AZURE_OPENAI_API_KEY || '';
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2024-06-01';
export const DEFAULT_MODEL_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4.1';

let clientInstance: AzureOpenAI | null = null;

export function getAzureOpenAIClient(): AzureOpenAI {
  if (clientInstance) return clientInstance;

  if (API_KEY) {
    clientInstance = new AzureOpenAI({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      apiVersion: API_VERSION,
    });
  } else {
    const scope = 'https://cognitiveservices.azure.com/.default';
    const azureADTokenProvider = getBearerTokenProvider(new DefaultAzureCredential(), scope);
    clientInstance = new AzureOpenAI({
      endpoint: ENDPOINT,
      azureADTokenProvider,
      apiVersion: API_VERSION,
    });
  }

  return clientInstance;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function askAzureOpenAI({
  messages,
  temperature = 0.3,
  maxTokens = 1500,
  jsonMode = false,
  deployment = DEFAULT_MODEL_DEPLOYMENT,
}: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  deployment?: string;
}): Promise<string> {
  const client = getAzureOpenAIClient();

  const response = await client.chat.completions.create({
    model: deployment,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });

  return response.choices[0]?.message?.content || '';
}
