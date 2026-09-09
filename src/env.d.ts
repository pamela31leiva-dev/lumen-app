export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_SUPABASE_URL: string;
      NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
      /** Solo para scripts de servidor/administracion, y para src/lib/telemetry/reporter.ts (logs de sistema). Nunca se lee desde codigo que corra en el navegador. */
      SUPABASE_SERVICE_ROLE_KEY?: string;
      /** Selecciona el proveedor detras de infrastructure/ai/adapter.ts. 'gemini' es el modo $0 (nivel gratuito). Default: 'mock'. */
      AI_PROVIDER?: 'mock' | 'openai' | 'gemini' | 'anthropic';
      OPENAI_API_KEY?: string;
      /** Cambiar a 'https://openrouter.ai/api/v1' para usar OpenRouter en vez de la API de OpenAI. */
      OPENAI_BASE_URL?: string;
      OPENAI_MODEL?: string;
      /** Motor principal (de pago) cuando AI_PROVIDER=anthropic. */
      ANTHROPIC_API_KEY?: string;
      ANTHROPIC_MODEL?: string;
      /** Motor activo cuando AI_PROVIDER=gemini (nivel gratuito); tambien sirve de respaldo si AI_PROVIDER=anthropic falla. */
      GEMINI_API_KEY?: string;
      GEMINI_MODEL?: string;
      /** Correo visible de soporte (pie de pagina, ajustes). */
      NEXT_PUBLIC_SUPPORT_EMAIL?: string;
      /** Token que /api/cron/health-check exige en el header Authorization: Bearer <token>. */
      CRON_SECRET?: string;
    }
  }
}
