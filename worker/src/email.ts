import { EmailMessage } from 'cloudflare:email';
import { ApiProblem } from './http';
import type { Env } from './types';

export function emailConfigured(env: Env): boolean {
  return Boolean((env.EMAIL && env.EMAIL_FROM) || (env.RESEND_API_KEY && env.RESEND_FROM));
}

export async function sendTextEmail(env: Env, to: string, subject: string, body: string): Promise<void> {
  const bindingFrom = env.EMAIL_FROM;
  const resendFrom = env.RESEND_FROM;
  if (env.EMAIL && bindingFrom) {
    const fromAddress = bindingFrom.match(/<([^>]+)>/u)?.[1] || bindingFrom;
    const messageIdDomain = fromAddress.split('@')[1];
    const raw = [
      `From: ${bindingFrom}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@${messageIdDomain}>`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      body
    ].join('\r\n');
    await env.EMAIL.send(new EmailMessage(fromAddress, to, raw));
    return;
  }
  if (env.RESEND_API_KEY && resendFrom) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'rated-n-api'
      },
      body: JSON.stringify({ from: resendFrom, to: [to], subject, text: body })
    });
    if (!response.ok) throw new ApiProblem(502, 'email_delivery_failed', 'Email delivery provider rejected the message.');
    return;
  }
  throw new ApiProblem(503, 'email_unavailable', 'Email delivery is not configured yet.');
}
