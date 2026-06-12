import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const createUploadId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const getImageExtension = (contentType: string) => {
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('png')) return 'png';
  return 'png';
};

export const uploadImageToTryOnBucket = async (
  imageSource: string,
  folder: string,
  fallbackContentType = 'image/png'
): Promise<string> => {
  console.info('[Supabase] Uploading image to try-on bucket.', {
    folder,
    sourceType: imageSource.startsWith('data:') ? 'data-url' : 'url'
  });

  const imageResponse = await fetch(imageSource);

  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image for upload: ${imageResponse.status}`);
  }

  const blob = await imageResponse.blob();
  const contentType = blob.type || fallbackContentType;
  const imageName = `${folder}/${Date.now()}-${createUploadId()}.${getImageExtension(contentType)}`;

  const { data, error } = await supabase.storage
    .from('try-on')
    .upload(imageName, blob, {
      contentType,
      upsert: false
    });

  if (error) {
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from('try-on')
    .getPublicUrl(data.path);

  console.info('[Supabase] Image upload completed.', {
    folder,
    path: data.path,
    publicUrl: urlData.publicUrl
  });

  return urlData.publicUrl;
};

export const uploadCapturedImage = (imageData: string): Promise<string> =>
  uploadImageToTryOnBucket(imageData, 'captured', 'image/jpeg');

export const uploadTryOnInputImage = (
  imageSource: string,
  inputType: 'camera' | 'clothing'
): Promise<string> => uploadImageToTryOnBucket(imageSource, `try-on-inputs/${inputType}`);

export const uploadSharedResultImage = async (imageData: string): Promise<string> => {
  return uploadImageToTryOnBucket(imageData, 'shared-results', 'image/png');
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
