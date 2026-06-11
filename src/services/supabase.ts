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
