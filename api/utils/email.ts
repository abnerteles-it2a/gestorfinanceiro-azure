import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";


export async function sendEmail({ to, subject, html, text }: { to: string, subject: string, html: string, text?: string }) {
  const SES_REGION = process.env.SES_REGION || process.env.REGION || "sa-east-1";
  const SES_SENDER = process.env.SES_SENDER || "contato@it2a.com";

  const accessKeyId = process.env.SES_ACCESS_KEY_ID || process.env.ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.SES_SECRET_ACCESS_KEY || process.env.SECRET_ACCESS_KEY || "";

  if (!accessKeyId || !secretAccessKey) {
    console.error(`[SES] ERRO FATAL: Credenciais AWS não encontradas no ambiente!`);
  }

  const sesClient = new SESClient({
    region: SES_REGION,
    credentials: { accessKeyId, secretAccessKey },
  });

  const params = {
    Source: SES_SENDER,

    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: "UTF-8",
      },
      Body: {
        Html: {
          Data: html,
          Charset: "UTF-8",
        },
        Text: {
          Data: text || subject,
          Charset: "UTF-8",
        },
      },
    },
  };

  try {
    const command = new SendEmailCommand(params);
    const result = await sesClient.send(command);
    console.log(`[SES] Email sent to ${to}. MessageId: ${result.MessageId}`);
    return { success: true, messageId: result.MessageId };
  } catch (error: any) {
    console.error(`[SES] Error sending email to ${to}:`, error);
    // IMPORTANTE: Estamos lançando o erro para que o endpoint de signup saiba que falhou.
    // Assim, podemos tratar o erro no frontend e não deixar o usuário "preso" sem e-mail.
    throw new Error(`Falha ao enviar e-mail: ${error.message}`);

  }
}

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function generateResetToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
