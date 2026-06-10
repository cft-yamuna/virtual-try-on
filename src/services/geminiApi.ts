import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from './supabase'; // Make sure this path is correct

export interface TryOnRequest {
  userImage: string;
  clothingImage: string;
  mode?: 'tryOn' | 'faceSwap';
}

const GEMINI_MODEL = 'gemini-3.1-flash-image';
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// No changes needed for this helper function, it looks good.
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


export const generateVirtualTryOn = async (request: TryOnRequest): Promise<string> => {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error('Missing VITE_GEMINI_API_KEY environment variable');
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const userImageBlob = await convertImageToBase64(request.userImage);
    const clothingImageBlob = await convertImageToBase64(request.clothingImage);

    const prompt =
      request.mode === 'faceSwap'
        ? `Generate a realistic face swap using Image 1 as the user's face reference and Image 2 as the target image.

Put the face and exact hair from Image 1 onto the person in Image 2. Preserve the target image from Image 2 as the source of truth for the body, clothing, pose, background, lighting direction, camera angle, and composition. Replace the face identity and hairstyle with the user's face and hair from Image 1. The user's hair is a locked identity feature: preserve the same hairline, forehead coverage, parting, length, volume, shape, texture, curls or straightness, flyaways, beard or facial hair if visible, and hair color exactly as shown in Image 1. Do not beautify, restyle, shorten, lengthen, smooth, add, remove, or reinterpret the user's hair. Only adjust lighting, perspective, and edge blending enough to make the exact same hair fit naturally into Image 2.

Keep the target person's clothing, accessories, body shape, pose, and background from Image 2 unchanged unless tiny adjustments are needed to blend the user's face and exact hair realistically. The final head should look like the user from Image 1, including the same hairstyle and hair details, while fitting naturally onto the target image. Make the final output look like a premium, high-quality, realistic portrait.

Negative Prompt:

Do not change the target clothing, pose, body, background, accessories, or composition. Do not keep the target person's original hairstyle if it conflicts with the user's hair from Image 1. Do not invent a new hairstyle. Do not make the hair longer, shorter, thicker, thinner, neater, messier, straighter, curlier, darker, lighter, or more stylized than Image 1. Do not create a collage or side-by-side image. Avoid pasted-on face, mismatched skin tone, wrong hairstyle, wrong hairline, wrong hair color, changed hair length, warped facial features, blurry details, bad anatomy, extra faces, duplicated heads, distorted eyes, unrealistic shadows, or visible seams.`
        : `Generate a realistic virtual try-on image using Image 1 as the person reference and Image 2 as the clothing reference.

The person from Image 1 must be shown wearing the exact clothing item from Image 2. The clothing is the source of truth and must remain unchanged. Preserve all visible logos, sponsor marks, numbers, names, badges, patches, labels, seams, trims, collar details, sleeve details, patterns, stripes, typography, colors, gradients, and fabric details exactly as in Image 2. Do not add, remove, simplify, distort, or invent any clothing elements. Fit the garment naturally onto the person’s body with realistic folds, wrinkles, shadows, and depth so it looks physically worn, not pasted.

The person may be enhanced to look more AI-generated, polished, and visually appealing. Improve the face, skin, lighting, and overall appearance while keeping the same general identity, pose, and body structure. Make the person look cleaner, sharper, more refined, and aesthetically elevated with smooth natural skin, balanced facial symmetry, flattering lighting, clear details, and a premium high-quality AI-generated portrait feel. You may enhance facial clarity, glow, hair neatness, and overall presentation, but keep the result believable and visually attractive.

Final output should look like a premium high-quality AI-generated fashion try-on image, with the clothing preserved exactly and the person enhanced beautifully.

Negative Prompt:

Do not change the clothing design. Do not invent or modify logos, text, numbers, badges, sponsors, patches, colors, stripes, patterns, seams, trims, or typography. Do not distort the garment. Avoid blurry results, bad anatomy, fake fabric fit, incorrect perspective, pasted-on clothing, extra limbs, deformed hands, low detail, or unrealistic shadows.`;

    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: userImageBlob.mimeType, data: userImageBlob.data } },
      { inlineData: { mimeType: clothingImageBlob.mimeType, data: clothingImageBlob.data } }
    ]);

    const response = await result.response;
    console.log('Full response:', JSON.stringify(response, null, 2));
    console.log('Candidates:', response.candidates);
    console.log('First candidate parts:', response.candidates?.[0]?.content?.parts);

    const firstPart = response.candidates?.[0]?.content?.parts?.[0];

    if (firstPart && 'inlineData' in firstPart && firstPart.inlineData?.data) {
      const generatedImageBase64 = `data:${firstPart.inlineData.mimeType};base64,${firstPart.inlineData.data}`;
      
      // --- START: Supabase Upload and URL Retrieval Logic ---
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
          // If upload fails, throw the error to the catch block below
          throw uploadError;
        }

        // Get the public URL of the uploaded file
        const { data: urlData } = supabase.storage
          .from('try-on')
          .getPublicUrl(uploadData.path);
        
        console.log('Successfully generated and uploaded image to:', urlData.publicUrl);
        // **RETURN THE SUPABASE URL**
        return urlData.publicUrl;

      } catch (uploadError) {
        console.error('Error uploading to Supabase. Returning base64 as fallback.', uploadError);
        // Fallback: return the base64 string if upload fails
        return generatedImageBase64;
      }
      // --- END: Supabase Logic ---
    }

    // If no image part is found in the response
    throw new Error('No image was generated by the AI model.');

  } catch (error) {
    console.error('Error in generateVirtualTryOn:', error);
    throw new Error('Failed to generate virtual try-on result');
  }
};
