import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const uploadCapturedImage = async (imageData: string): Promise<string> => {
  const imageResponse = await fetch(imageData);
  const blob = await imageResponse.blob();
  const imageName = `captured/${Date.now()}.jpg`;

  const { data, error } = await supabase.storage
    .from('try-on')
    .upload(imageName, blob, {
      contentType: 'image/jpeg',
      upsert: false
    });

  if (error) {
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from('try-on')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
};

export const uploadSharedResultImage = async (imageData: string): Promise<string> => {
  const imageResponse = await fetch(imageData);
  const blob = await imageResponse.blob();
  const imageName = `shared-results/${Date.now()}.png`;

  const { data, error } = await supabase.storage
    .from('try-on')
    .upload(imageName, blob, {
      contentType: 'image/png',
      upsert: false
    });

  if (error) {
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from('try-on')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
};

interface CreateTryOnSessionInput {
  userName: string;
  gender: 'male' | 'female' | null;
  selectedJersey: 'j1' | 'j2' | null;
  capturedImageUrl: string | null;
  resultImageUrl: string;
}

export const createTryOnSession = async ({
  userName,
  gender,
  selectedJersey,
  capturedImageUrl,
  resultImageUrl
}: CreateTryOnSessionInput): Promise<string> => {
  const { data, error } = await supabase
    .from('try_on_sessions')
    .insert({
      user_name: userName,
      gender,
      selected_jersey: selectedJersey,
      captured_image_url: capturedImageUrl,
      result_image_url: resultImageUrl
    })
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  return data.id;
};

export const updateTryOnSessionSharedResult = async (
  sessionId: string,
  sharedResultUrl: string
): Promise<void> => {
  const { error } = await supabase
    .from('try_on_sessions')
    .update({
      result_image_url: sharedResultUrl,
      shared_result_url: sharedResultUrl
    })
    .eq('id', sessionId);

  if (error) {
    throw error;
  }
};
