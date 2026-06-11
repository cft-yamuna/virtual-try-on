import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from './supabase'; // Make sure this path is correct

export interface TryOnRequest {
  userImage: string;
  clothingImage: string;
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
    const prompt = `Generate a realistic face swap using exactly two reference images.

Image 1: The captured photo of the user. This is the only identity source.
Image 2: The selected jersey reference image. This is the target body, pose, framing, jersey, and composition source.

TASK - Keep the full target image structure from Image 2, but replace the target person's face, hair, and visible head identity with the user from Image 1. The final result must look like the user from Image 1 is naturally wearing the exact jersey in Image 2.

ABSOLUTE JERSEY LOCK - The jersey in Image 2 is the most important fixed element. Preserve it exactly as shown. Do not change, redraw, clean up, simplify, invent, remove, or reinterpret any jersey detail. Keep the exact colors, shade, contrast, patterns, sponsor text, logos, badges, numbers, stars, collar shape, sleeve shape, seams, stitching, fabric texture, wrinkles, folds, shadows, fit, body placement, and typography from Image 2. The face swap must happen around the locked jersey and body, not by regenerating or redesigning the jersey. If there is any conflict between preserving the jersey and improving the face swap, prioritize the jersey staying identical.

PROPORTION LOCK - The body-to-head ratio, head size, face size, neck width, shoulder width, and overall anatomy from Image 2 are mandatory. The swapped face and hair must fit inside the original head silhouette and skull size from Image 2. Do not enlarge the face to preserve detail. Do not make the head wider, taller, closer to camera, or larger than the original target head in Image 2. Keep the chin-to-neck connection, jaw width, temple width, forehead height, and hair volume proportional to the target body. The final image must have a natural human head size for the visible torso and shoulders, with no oversized face, bobblehead effect, swollen head, stretched head, or shrunken body.

HEAD ACCURACY LOCK - Keep the user's real head identity from Image 1 accurate and recognizable. Preserve the actual face shape, skull shape, forehead, hairline, hairstyle, hair density, hair texture, beard/mustache shape if present, eyebrow shape, eye spacing, nose shape, lips, cheeks, jaw, chin, ears if visible, and natural asymmetry. Do not turn the user into the target person from Image 2. Do not make the face generic, younger, older, slimmer, wider, smoother, more symmetrical, more attractive, or more stylized. The head must remain the same person from Image 1, only relit and scaled to fit Image 2.

IDENTITY LOCK - Image 1 is the absolute source of truth for the user's face identity. Extract and transplant the following features with zero modification: eye shape, eye color, iris pattern, eyelid fold, eyebrow shape and thickness, nose bridge width, nose tip shape, nostril shape, lip thickness and shape, cupid's bow, philtrum, cheek structure, jawline geometry, chin shape, forehead height, hairline shape, hair color, hair texture, hair parting, hair volume, hair length, and all skin details including tone, undertone, pores, marks, moles, scars, and natural asymmetry. If the user wears glasses in Image 1, preserve the glasses on the swapped face. If the user is clean-shaven in Image 1, the output must also be clean-shaven - no stubble, no beard, no mustache, no sideburns added under any circumstance.

HAIR CONSISTENCY - The hair from Image 1 must remain the same in every output. Do not replace it with the target person's hair from Image 2. Do not make it neater, longer, shorter, thicker, thinner, curlier, straighter, darker, lighter, wet, glossy, or more styled. Preserve the same silhouette, hairline, volume, parting, forehead coverage, flyaways, and texture from Image 1.

HEAD FIT - Reconstruct the user's face identity and exact hairstyle from Image 1 onto the head position of the target person in Image 2. Do not paste the whole head from Image 1 as a cutout. Do not copy the original Image 1 head outline, neck, shoulders, background edge, or lighting as a single patch. Match the yaw, pitch, and roll of the head to the pose in Image 2. Scale the face proportionally so the eye-to-chin distance, temple-to-temple width, forehead-to-chin height, and hair outer boundary fit the target head size in Image 2. Do not stretch or compress facial features during this scaling. If exact hair shape conflicts with realistic head proportions, prioritize natural target-body proportions while preserving the user's hairline, color, texture, and parting. The final head must be anatomically attached to the target neck and shoulders from Image 2, with no floating-head or pasted-mask look.

SCENE MATCH / LIGHTING LOCK - This is the most critical step. The swapped face and head must look like they were photographed in the same original shoot as Image 2. Analyze Image 2's lighting direction, light height, light softness, shadow density, black levels, contrast, saturation, color temperature, camera sharpness, grain/noise, compression, depth of field, and overall poster color grade before editing. Re-light and color-grade the user's face, hair, beard, and neck from Image 1 to match Image 2 exactly. Match the forehead highlights, nose shadows, under-eye shadows, cheek shadows, beard shadows, hair highlights, chin shadow, and neck shadow to Image 2. The head must have the same exposure, contrast, edge softness, skin texture visibility, and sharpness as the body and jersey. Blend skin tone at the jawline, temples, hairline, ears, beard edge, and neck with zero visible seam. The final image must look like one real photo, not a face pasted from a different camera, different flash, different day, or different color grade.

BODY & CLOTHING - The body, clothing, jersey, pose, accessories, and composition from Image 2 are completely locked. Do not alter them in any way. Every jersey detail must remain pixel-perfect: colors, numbers, sponsor logos, badge, collar shape, sleeve design, stripes, patterns, typography, fabric texture, folds, wrinkles, shadows, fit, and placement. Do not recolor, simplify, redraw, clean, sharpen, blur, crop, warp, or reinterpret any part of the jersey under any circumstance. Only the user's face, hair, and necessary head/neck blending may change.

BACKGROUND / POSTER LOCK - Do not create a green screen. Preserve the original background, poster layout, black areas, smoke, lighting, shadows, header graphics, footer graphics, crop, canvas size, and composition from Image 2 exactly as much as possible. Do not remove the background, replace it with a solid color, make it transparent, or generate any flat green background. The only intended change is the user's face, hair, and necessary head/neck blending.

OUTPUT QUALITY - Photorealistic, high-resolution, single portrait. Not a collage. Not side-by-side.

Negative Prompt:
Do not synthesize a new face. Do not approximate or average the user's identity. Do not beautify, smooth, slim, or idealize the face. Do not add facial hair not present in Image 1. Do not change hairstyle, hair length, hair color, hair texture, hairline, hair volume, hair parting, forehead coverage, or flyaways. Do not paste the whole head from Image 1. Do not copy the Image 1 head as a cutout layer. Do not enlarge the user's face or head. Do not make the face bigger than the target face in Image 2. Do not create an oversized head, bobblehead look, swollen forehead, wide jaw, tiny neck, tiny shoulders, or mismatched head-to-body proportions. Do not make the head look copied from a different image. Do not leave the face brighter, darker, warmer, cooler, sharper, blurrier, smoother, noisier, flatter, or more contrasty than the body and jersey. Do not create a hard face edge, halo, mask outline, mismatched beard edge, mismatched hair edge, mismatched neck color, or pasted-on look. Do not include Image 1 background edges, lighting, neck patch, or shoulder patch. Do not alter the target body, clothing, pose, or accessories. Do not change jersey colors, numbers, logos, badges, collar, sleeves, stripes, patterns, sponsor text, fabric texture, folds, wrinkles, fit, placement, shadows, or typography. Do not recolor, redesign, regenerate, clean up, sharpen, blur, crop, warp, simplify, or reinterpret the jersey. Do not replace the jersey with a similar jersey. Do not use a green screen. Do not create a flat green, transparent, cutout, removed, white, gray, or newly generated background. Do not alter the Image 2 poster layout, black background, smoke, header graphics, footer graphics, crop, or canvas size. Do not use the original lighting from Image 1 on the swapped face. Do not leave mismatched color temperature between face and body. Do not produce flat-lit face on a dramatically lit body or vice versa. Do not leave visible brightness difference between the face and neck. Do not produce a pasted-on look, mismatched skin tone, wrong hairline, warped eyes, distorted nose, blurry face, bad neck anatomy, floating head, extra faces, or visible compositing seams.`;

    const contentParts = [
      { text: prompt },
      { inlineData: { mimeType: userImageBlob.mimeType, data: userImageBlob.data } },
      { inlineData: { mimeType: clothingImageBlob.mimeType, data: clothingImageBlob.data } }
    ];

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
