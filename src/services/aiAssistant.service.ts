import { supabase } from './supabase';

export interface AiMessage { role: 'user' | 'assistant'; text: string }

/** Thrown when the server has no Gemini key yet, so the chat can say "not set up" instead of "error". */
export class AiNotConfiguredError extends Error {}

export const aiAssistantService = {
  /** Kesari only while testing; all managers once app_config.aiAssistantScope = 'managers' (migration 0102). */
  async canUse(): Promise<boolean> {
    const { data, error } = await supabase.rpc('can_use_ai_assistant');
    return !error && data === true;
  },
  /** Sends the conversation; the server answers from live team data (read-only). */
  async ask(messages: AiMessage[]): Promise<string> {
    const { data, error } = await supabase.functions.invoke('ai-assistant', { body: { messages } });
    if (error) {
      let body: any = null;
      try { body = await (error as any).context?.json?.(); } catch { /* not JSON */ }
      if (body?.error === 'not_configured') throw new AiNotConfiguredError(body.message || 'The AI assistant is not set up yet.');
      throw new Error(body?.error || 'The AI could not answer right now. Try again.');
    }
    if (!data?.reply) throw new Error('The AI gave an empty answer. Try asking another way.');
    return data.reply as string;
  },
};
