import { GoogleGenAI, Modality } from '@google/genai';
import { supabase } from './supabase'; // Make sure this path is correct

export interface TryOnRequest {
  userImage: string;
  clothingImage: string;
}

type GeminiResponsePart = {
  text?: string;
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
};

const GEMINI_MODEL = 'gemini-3.1-flash-image';
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const convertImageToBase64 = async (imageSource: string): Promise<{ mimeType: string; data: string }> => {
  if (imageSource.startsWith('data:')) {
    const [header, data] = imageSource.split(',');
    const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
    return { mimeType, data };
  }

  const response = await fetch(imageSource);
  const blob = await response.blob();
  const mimeType = blob.type || 'image/jpeg';

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const data = base64.split(',')[1];
      resolve({ mimeType, data });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const findGeneratedImage = (response: unknown): { mimeType: string; data: string } | null => {
  const candidates = (response as { candidates?: Array<{ content?: { parts?: GeminiResponsePart[] } }> }).candidates || [];

  for (const candidate of candidates) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData?.data) {
        return {
          mimeType: part.inlineData.mimeType || 'image/png',
          data: part.inlineData.data
        };
      }
    }
  }

  return null;
};

const getResponseText = (response: unknown): string => {
  const candidates = (response as { candidates?: Array<{ content?: { parts?: GeminiResponsePart[] } }> }).candidates || [];

  return candidates
    .flatMap(candidate => candidate.content?.parts || [])
    .map(part => part.text)
    .filter((text): text is string => Boolean(text))
    .join('\n')
    .trim();
};

const uploadGeneratedImage = async (generatedImageBase64: string): Promise<string> => {
  try {
    const imageName = `try-on-results/${Date.now()}.png`;
    const imageResponse = await fetch(generatedImageBase64);
    const blob = await imageResponse.blob();

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('try-on') // Your bucket name
      .upload(imageName, blob, {
        contentType: 'image/png',
        upsert: false
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: urlData } = supabase.storage
      .from('try-on')
      .getPublicUrl(uploadData.path);

    console.log('Successfully generated and uploaded image to:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (uploadError) {
    console.error('Error uploading to Supabase. Returning base64 as fallback.', uploadError);
    return generatedImageBase64;
  }
};

const generateImageWithPrompt = async (
  ai: GoogleGenAI,
  prompt: string,
  userImageBlob: { mimeType: string; data: string },
  clothingImageBlob: { mimeType: string; data: string }
): Promise<{ image: { mimeType: string; data: string } | null; text: string }> => {
  const response = await ai.models.generateContentStream({
    model: GEMINI_MODEL,
    config: {
      responseModalities: [Modality.IMAGE, Modality.TEXT]
    },
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { text: 'IMAGE 1 - CAPTURED USER PHOTO. Use this image as the only identity source. The final face/head/neck must look like this person, not the person in Image 2.' },
          { inlineData: { mimeType: userImageBlob.mimeType, data: userImageBlob.data } },
          { text: 'IMAGE 2 - BASE POSTER TEMPLATE. Use this image only for the poster, body, jersey, pose, crop, background, logo positions, and collar contact point. The person currently shown in this template is not the output identity.' },
          { inlineData: { mimeType: clothingImageBlob.mimeType, data: clothingImageBlob.data } }
        ]
      }
    ]
  });

  const textParts: string[] = [];

  for await (const chunk of response) {
    const image = findGeneratedImage(chunk);
    if (image) {
      return { image, text: textParts.join('\n').trim() };
    }

    const text = getResponseText(chunk) || chunk.text;
    if (text) {
      textParts.push(text);
    }
  }

  return { image: null, text: textParts.join('\n').trim() };
};


export const generateVirtualTryOn = async (request: TryOnRequest): Promise<string> => {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error('Missing VITE_GEMINI_API_KEY environment variable');
    }

    const ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY
    });

    const userImageBlob = await convertImageToBase64(request.userImage);
    const clothingImageBlob = await convertImageToBase64(request.clothingImage);
    const faceOnlyPrompt = `Return one edited image only. Do not add any text, name, caption, watermark, badge, QR code, sparkle, or extra logo.

You are given two images:
Image 1 is the captured user photo and is the only source for the replacement face identity.
Image 2 is the fixed base poster.

Identity replacement is mandatory. The face, full head, hair, ears if visible, jaw, chin, and visible neck in the output must clearly be the captured user from Image 1. Do not keep any part of the original reference person's face, hair, head shape, jaw, chin, ears, beard, or neck from Image 2. Do not return Image 2 unchanged or nearly unchanged.

Hair preservation is mandatory. Use only the captured user's real hair from Image 1. Do not invent, extend, lengthen, thicken, restyle, feminize, beautify, or add hair. Do not add shoulder-length hair, side hair, loose hair over the jersey, long hair around the neck, or hair volume that is not visible in Image 1. If the captured user's hair is tied back, short, cropped, thin, hidden, or close to the scalp, keep it that way. The final hair silhouette must match Image 1, not the template and not a generic female hairstyle.

Edit Image 2 by replacing the complete head-to-neck region: full hair silhouette, forehead, face, ears if visible, jaw, chin, throat, and all visible neck/upper-chest skin down to the jersey collar opening. Use the user's identity from Image 1 for this entire head-and-neck skin region. The replacement must cover the original template person's full head, full neck, and every visible skin patch above the jersey collar; no original hair, neck, throat, or collar-opening skin should remain visible behind or around the user. Keep the exact original head position, eye line, chin height, neck width, collar contact point, and head-to-body scale from Image 2. Keep Image 2's canvas size, crop, body, jersey, arms, shoulders, collar shape, smoke, black background, red top logo, bottom-right white logo, footer spacing, colors, shadows, and every jersey detail unchanged. Do not regenerate the poster, jersey, body, arms, shoulders, collar, or background. Do not make the head larger, lower, wider, closer to camera, or more forward than the original head in Image 2. Do not change the body size, pose, framing, or any layout element.

The replacement headshot must keep the user's recognizable identity: exact hairstyle, exact hairline, exact hair volume, exact hair length, full head shape, face shape, eyes, eyebrows, nose, lips, cheeks, jaw, chin, neck skin tone, facial hair if present, glasses if present, marks, asymmetry, and expression. Match only the lighting, perspective, color temperature, sharpness, and contrast needed for the head and neck to blend naturally into Image 2. The neck must be continuous with the face and must attach naturally to the original body exactly at the visible jersey collar opening, replacing all skin visible inside that opening without covering the jersey chest, badge, stars, logos, or collar trim.

Finishing quality is critical: no visible cutout edge, no halo, no leftover template hair behind the user, no double hairline, no dark rim around the face, no neck seam, and no mismatched skin patch at the collar. The hair edge and neck edge must look naturally photographed against the same smoke/black background and attached to the same body.

The final image should look like the original Image 2 poster with only the head and visible neck swapped.`;

    const response = await generateImageWithPrompt(ai, faceOnlyPrompt, userImageBlob, clothingImageBlob);
    console.log('Response text:', response.text);

    let generatedImage = response.image;

    if (!generatedImage) {
      const retryPrompt = `Return one edited image only. Image 1 is the captured user and must be the output identity. Image 2 is only the fixed base poster. Replace the complete original Image 2 head-to-neck region with the captured user from Image 1: full hair silhouette, forehead, face, ears if visible, jaw, chin, throat, and all visible neck/upper-chest skin down to the jersey collar opening. Use the exact hair from Image 1 only. Do not invent, lengthen, thicken, restyle, feminize, or add shoulder-length/side hair. Do not keep any reference face, hair, jaw, beard, neck, throat, or collar-opening skin from Image 2. Do not return Image 2 unchanged. Keep the exact original head position, eye line, chin height, neck width, collar contact point, and head-to-body scale from Image 2. Preserve Image 2's body, jersey, arms, shoulders, collar, canvas, crop, background, smoke, red logo, bottom-right logo, footer spacing, and all layout details. No visible cutout edge, halo, leftover template hair, double hairline, dark rim, or neck seam. Do not cover jersey chest details. No name, caption, watermark, QR code, sparkle, or extra text.`;

      const retryResponse = await generateImageWithPrompt(ai, retryPrompt, userImageBlob, clothingImageBlob);
      console.log('Retry response text:', retryResponse.text);
      generatedImage = retryResponse.image;
    }

    if (!generatedImage) {
      throw new Error(`No image was generated by the AI model. Response text: ${response.text || 'No text returned'}`);
    }

    const generatedImageBase64 = `data:${generatedImage.mimeType};base64,${generatedImage.data}`;
    return uploadGeneratedImage(generatedImageBase64);

  } catch (error) {
    console.error('Error in generateVirtualTryOn:', error);
    throw new Error('Failed to generate virtual try-on result');
  }
};
