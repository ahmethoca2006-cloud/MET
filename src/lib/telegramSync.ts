import { supabase } from './supabaseClient';

export interface TelegramCredentials {
  apiId: string;
  apiHash: string;
  phone: string;
  session: string;
  chatId: string;
}

export async function loadTelegramCredentials(): Promise<TelegramCredentials | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;
  const { data } = await supabase
    .from('telegram_credentials')
    .select('api_id, api_hash, phone, session, chat_id')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return null;
  return {
    apiId: data.api_id || '',
    apiHash: data.api_hash || '',
    phone: data.phone || '',
    session: data.session || '',
    chatId: data.chat_id || '',
  };
}

export async function saveTelegramCredentials(partial: Partial<TelegramCredentials>): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return;
  const row: Record<string, string> = { id: userId };
  if (partial.apiId !== undefined) row.api_id = partial.apiId;
  if (partial.apiHash !== undefined) row.api_hash = partial.apiHash;
  if (partial.phone !== undefined) row.phone = partial.phone;
  if (partial.session !== undefined) row.session = partial.session;
  if (partial.chatId !== undefined) row.chat_id = partial.chatId;
  await supabase.from('telegram_credentials').upsert(row);
}
