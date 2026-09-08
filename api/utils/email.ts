import { EmailClient } from '@azure/communication-email';
import { DefaultAzureCredential } from '@azure/identity';

const CONNECTION_STRING = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING || process.env.AZURE_COMMUNICATION_CONNECTION_STRING || '';
const ENDPOINT = process.env.AZURE_COMMUNICATION_ENDPOINT || '';
const SENDER = process.env.AZURE_EMAIL_SENDER || process.env.EMAIL_SENDER || 'DoNotReply@it2a.azurecomm.net';

let emailClientInstance: EmailClient | null = null;

function getEmailClient(): EmailClient | null {
  if (emailClientInstance) return emailClientInstance;

  if (CONNECTION_STRING) {
    emailClientInstance = new EmailClient(CONNECTION_STRING);
  } else if (ENDPOINT) {
    emailClientInstance = new EmailClient(ENDPOINT, new DefaultAzureCredential());
  }

  return emailClientInstance;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ success: boolean; messageId?: string }> {
  const client = getEmailClient();

  if (!client) {
    console.warn(`[Azure Email] AVISO: Nenhuma credencial do Azure Communication Services configurada (COMMUNICATION_SERVICES_CONNECTION_STRING). Simulando envio para ${to}`);
    return { success: true, messageId: `mock-${Date.now()}` };
  }

  try {
    const poller = await client.beginSend({
      senderAddress: SENDER,
      content: {
        subject,
        plainText: text || subject,
        html,
      },
      recipients: {
        to: [{ address: to }],
      },
    });

    const response = await poller.pollUntilDone();
    console.log(`[Azure Email] E-mail enviado com sucesso para ${to}. ID: ${response.id}`);
    return { success: true, messageId: response.id };
  } catch (error: any) {
    console.error(`[Azure Email] Erro ao enviar e-mail para ${to}:`, error);
    throw new Error(`Falha no envio de e-mail via Azure: ${error.message}`);
  }
}

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function generateResetToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
