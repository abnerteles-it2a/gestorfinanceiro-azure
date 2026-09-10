import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';

export const DEFAULT_MODEL_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4.1';

let clientInstance: AzureOpenAI | null = null;

export function getAzureOpenAIClient(): AzureOpenAI {
  if (clientInstance) return clientInstance;

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT || 'https://abner-7506-resource.cognitiveservices.azure.com/';
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-06-01';

  if (apiKey && apiKey.trim()) {
    clientInstance = new AzureOpenAI({
      endpoint,
      apiKey: apiKey.trim(),
      apiVersion,
    });
  } else {
    const scope = 'https://cognitiveservices.azure.com/.default';
    const azureADTokenProvider = getBearerTokenProvider(new DefaultAzureCredential(), scope);
    clientInstance = new AzureOpenAI({
      endpoint,
      azureADTokenProvider,
      apiVersion,
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
  deployment,
}: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  deployment?: string;
}): Promise<string> {
  const modelDeployment = deployment || process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4.1';
  const client = getAzureOpenAIClient();

  const response = await client.chat.completions.create({
    model: modelDeployment,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });

  return response.choices[0]?.message?.content || '';
}
