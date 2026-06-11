import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from './supabase'; // Make sure this path is correct

export interface TryOnRequest {
  userImage: string;
  clothingImage: string;
  mode?: 'tryOn' | 'faceSwap';
  composition?: 'closePortrait';
  poseImage?: string;
  promptVariant?: 'maleJ1ThreeReference' | 'femaleJ1ThreeReference';
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
    const poseImageBlob =
      request.poseImage && request.promptVariant !== 'femaleJ1ThreeReference'
        ? await convertImageToBase64(request.poseImage)
        : null;

    const maleJ1ThreeReferencePrompt = `You are given three reference images:

Image 1: The captured photo of the person. Use this image as the identity reference. Preserve the person's face exactly as shown, including facial structure, skin tone, hairstyle, eyes, nose, lips, jawline, facial hair, and age. The final output must clearly look like the same person from Image 1.

Image 2: jog.png. This is the jersey reference image. Replace only the person's current clothing with the exact jersey shown in jog.png. Preserve all jersey details exactly, including colors, patterns, textures, stitching, logos, badges, stars, text, collar shape, sleeve design, and placements. Do not redesign, simplify, or reinterpret the jersey.

Image 3: The pose reference image male_j2.png. Use this image to determine the exact pose and composition. Match the head position, facial direction, body orientation, shoulder alignment, arm placement, camera angle, framing, crop, and overall composition as closely as possible.

Generate a highly realistic DSLR-quality photograph with natural skin texture, realistic lighting, and realistic fabric folds.

Priority order:
1. Exact pose from male_j2.png.
2. Exact face and identity from Image 1.
3. Exact jersey reproduction from jog.png.
4. Background styling.

The final image should look like a real photograph of the person from Image 1 wearing the exact jersey from jog.png while posing exactly like Image 3.

BACKGROUND:
If the background is not mentioned, or if any reference image includes a background color other than green, replace it. Every single pixel outside the person must be exactly #00FF00. Use flat solid #00FF00 only. Do not use white, gray, black, lime, olive, yellow-green, gradients, shadows, vignettes, noise, or any background variation.

Negative Prompt:
Do not change the user's identity from Image 1. Do not change the jersey details from jog.png. Do not change the pose/composition from male_j2.png. Do not use any background except exactly #00FF00. Do not add gradients, shadows, or noise to the background. Do not produce a cartoon, illustration, stylized result, collage, or side-by-side image. Avoid bad anatomy, blurry face, deformed hands, extra limbs, unrealistic skin, changed jersey logos, changed jersey text, changed jersey colors, or wrong pose.`;

    const femaleJ1ThreeReferencePrompt = `You are given two reference images:

Image 1: The captured photo of the woman. Use this image as the identity reference. Preserve her face exactly as shown, including facial structure, skin tone, hairstyle, eyes, eyebrows, nose, lips, jawline, and age. The final output must clearly look like the same woman from Image 1. Do not beautify, feminize further, or alter her appearance.

Image 2: jog.png. This is the jersey reference image. Replace only the woman's current clothing with the exact jersey shown in jog.png. Preserve all jersey details exactly, including colors, patterns, textures, stitching, logos, badges, stars, text, collar shape, sleeve design, and placements. Do not redesign, simplify, or reinterpret the jersey. Ensure the jersey fits naturally on her body while maintaining the original design.

POSE & COMPOSITION:
Create a clean front-facing female football portrait. The woman should stand upright, centered, facing the camera directly with a neutral confident expression. Use a straight camera angle, natural shoulder alignment, relaxed arms, and a crop from the top of the head to around the thighs/upper legs so the jersey is clearly visible. Do not use or reproduce fmale.png. Do not copy any public/reference image directly.

Generate a highly realistic DSLR-quality photograph with natural skin texture, realistic lighting, and realistic fabric folds.

Priority order:
1. Exact face and identity from Image 1.
2. Exact jersey reproduction from jog.png.
3. Front-facing female portrait pose and composition.
4. Background styling.

The final image should look like a real photograph of the same woman from Image 1 wearing the exact jersey from jog.png in a clean centered front-facing portrait.

IMPORTANT:
Generate a new final photograph. Do not return fmale.png, jog.png, or the captured photo unchanged. The output must combine Image 1 identity + Image 2 jersey + the described front-facing portrait pose.

BACKGROUND:
If the background is not mentioned, or if any reference image includes a background color other than green, replace it. Every single pixel outside the person must be exactly #00FF00. Use flat solid #00FF00 only. Do not use white, gray, black, lime, olive, yellow-green, gradients, shadows, vignettes, noise, or any background variation.

Negative Prompt:
Do not return fmale.png unchanged. Do not use fmale.png as a source image. Do not output any public/reference image directly. Do not copy a woman, face, hairstyle, body identity, clothing, jersey, colors, lighting, background, or pixels from fmale.png. Do not change the woman's identity from Image 1. Do not beautify, feminize further, or alter her appearance. Do not change the jersey details from jog.png. Do not use any background except exactly #00FF00. Do not add gradients, shadows, or noise to the background. Do not produce a cartoon, illustration, stylized result, collage, or side-by-side image. Avoid bad anatomy, blurry face, deformed hands, extra limbs, unrealistic skin, changed jersey logos, changed jersey text, changed jersey colors, or wrong pose.`;

    const compositionPrompt =
      request.composition === 'closePortrait'
        ? `
COMPOSITION OVERRIDE FOR THIS JERSEY - Create a close-up chest portrait like a professional jersey campaign image. Frame the person from the top of the head to around the lower chest/upper arms. The face should be large and centered, the shoulders and upper torso visible, and the jersey logo/text clearly readable across the chest. Keep the person upright, front-facing, and symmetrical. Do not output a full-body image. Do not crop off the top of the head, chin, collar, chest logo, or shoulders.`
        : '';

    const prompt =
      request.promptVariant === 'maleJ1ThreeReference'
        ? maleJ1ThreeReferencePrompt
        : request.promptVariant === 'femaleJ1ThreeReference'
          ? femaleJ1ThreeReferencePrompt
          : `Generate a realistic face swap using Image 1 as the user's face reference and Image 2 as the target image.

IDENTITY LOCK - Image 1 is the absolute source of truth for the user's face identity. Extract and transplant the following features with zero modification: eye shape, eye color, iris pattern, eyelid fold, eyebrow shape and thickness, nose bridge width, nose tip shape, nostril shape, lip thickness and shape, cupid's bow, philtrum, cheek structure, jawline geometry, chin shape, forehead height, hairline shape, hair color, hair texture, hair parting, hair volume, hair length, and all skin details including tone, undertone, pores, marks, moles, scars, and natural asymmetry. If the user wears glasses in Image 1, preserve the glasses on the swapped face. If the user is clean-shaven in Image 1, the output must also be clean-shaven - no stubble, no beard, no mustache, no sideburns added under any circumstance.

HAIR CONSISTENCY - The hair from Image 1 must remain the same in every output. Do not replace it with the target person's hair from Image 2. Do not make it neater, longer, shorter, thicker, thinner, curlier, straighter, darker, lighter, wet, glossy, or more styled. Preserve the same silhouette, hairline, volume, parting, forehead coverage, flyaways, and texture from Image 1.

HEAD FIT - Reconstruct the user's face identity and exact hairstyle from Image 1 onto the head position of the target person in Image 2. Do not paste the whole head from Image 1 as a cutout. Do not copy the original Image 1 head outline, neck, shoulders, background edge, or lighting as a single patch. Match the yaw, pitch, and roll of the head to the pose in Image 2. Scale the face proportionally so the eye-to-chin distance and temple-to-temple width match the target head size in Image 2. Do not stretch or compress facial features during this scaling. The final head must be anatomically attached to the target neck and shoulders from Image 2, with no floating-head or pasted-mask look.
${compositionPrompt}

BLENDING & LIGHTING - This is the most critical step. Analyze the lighting in Image 2 before placing the face. Identify: the primary light source direction (left, right, top, front), light color temperature (warm/cool/neutral), ambient light intensity, shadow softness, and specular highlights on the skin. Re-light the transplanted face from Image 1 to exactly match this lighting environment from Image 2. The forehead highlight, nose shadow, under-eye shadow, cheekbone highlight, chin shadow, and neck shadow must all align with the light source in Image 2. If Image 2 has warm studio lighting, the face must have warm tones. If Image 2 has cool outdoor lighting, the face must have cool tones. Match the shadow density - if shadows in Image 2 are soft and diffused, face shadows must also be soft and diffused. If shadows are hard and sharp, match that too. Blend skin tone at the jawline, temples, hairline, and ears with zero visible seam. The transplanted face must feel like it was photographed in the exact same lighting conditions as Image 2 - not edited in from a different photo.

BODY & CLOTHING - The body, clothing, jersey, pose, accessories, and composition from Image 2 are completely locked. Do not alter them in any way. Every jersey detail must remain pixel-perfect: colors, numbers, sponsor logos, badge, collar shape, sleeve design, stripes, patterns, typography, and fabric texture. Do not recolor, simplify, redraw, or reinterpret any part of the jersey under any circumstance.

BACKGROUND - Remove all background. Place the final person on a flat solid #00FF00 green background only. The green value must be exactly #00FF00 - not olive, not lime, not yellow-green, not any other shade. Do not add gradients, shadows, vignettes, or any variation to the background. Pure flat #00FF00 only.

OUTPUT QUALITY - Photorealistic, high-resolution, single portrait. Not a collage. Not side-by-side.

Negative Prompt:
Do not synthesize a new face. Do not approximate or average the user's identity. Do not beautify, smooth, slim, or idealize the face. Do not add facial hair not present in Image 1. Do not change hairstyle, hair length, hair color, hair texture, hairline, hair volume, hair parting, forehead coverage, or flyaways. Do not paste the whole head from Image 1. Do not copy the Image 1 head as a cutout layer. Do not include Image 1 background edges, lighting, neck patch, or shoulder patch. Do not alter the target body, clothing, pose, or accessories. Do not change jersey colors, numbers, logos, badges, collar, sleeves, stripes, patterns, or typography. Do not recolor or redesign the jersey. Do not use any background color other than exactly #00FF00. Do not add shadows, gradients, or noise to the background. Do not include any background except flat solid #00FF00. Do not use the original lighting from Image 1 on the swapped face. Do not leave mismatched color temperature between face and body. Do not produce flat-lit face on a dramatically lit body or vice versa. Do not leave visible brightness difference between the face and neck. Do not produce a pasted-on look, mismatched skin tone, wrong hairline, warped eyes, distorted nose, blurry face, bad neck anatomy, floating head, extra faces, or visible compositing seams.`;

    const contentParts = [
      { text: prompt },
      { inlineData: { mimeType: userImageBlob.mimeType, data: userImageBlob.data } },
      { inlineData: { mimeType: clothingImageBlob.mimeType, data: clothingImageBlob.data } }
    ];

    if (poseImageBlob) {
      contentParts.push({
        inlineData: { mimeType: poseImageBlob.mimeType, data: poseImageBlob.data }
      });
    }

    const result = await model.generateContent(contentParts);

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
