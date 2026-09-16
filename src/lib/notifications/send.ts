/**
 * Envio de avisos proactivos (Bloque P6) por los dos canales soportados.
 * Server-only, sin dependencias nuevas: un webhook es un POST comun, y
 * Telegram se llama directo contra su Bot API publica (sendMessage) -- no
 * existe ningun bot propio en este proyecto, la persona trae su propio
 * bot_token (creado gratis con @BotFather) y chat_id.
 */

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface SendResult {
  success: boolean;
  error?: string;
}

/** POST generico con el texto del aviso -- compatible con Slack/Discord/Zapier ("text") y con cualquier receptor propio (ademas manda "message" por si el otro lado espera esa llave). */
export async function sendWebhookNotification(url: string, text: string): Promise<SendResult> {
  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, message: text }),
    });
    if (!response.ok) {
      return { success: false, error: `El webhook respondio ${response.status}.` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error de red desconocido.' };
  }
}

/** Llama directo a la Bot API de Telegram (sendMessage) -- bot_token y chat_id los genera la persona con @BotFather / @userinfobot, Lumen nunca los inventa ni los comparte. */
export async function sendTelegramNotification(botToken: string, chatId: string, text: string): Promise<SendResult> {
  try {
    const response = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (!response.ok || !body?.ok) {
      return { success: false, error: body?.description ?? `Telegram respondio ${response.status}.` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error de red desconocido.' };
  }
}
