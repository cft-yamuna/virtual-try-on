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

const GEMINI_MODEL = 'gemini-3-pro-image';
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
          { inlineData: { mimeType: userImageBlob.mimeType, data: userImageBlob.data } },
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
    const prompt = `Generate and return one edited image only. Do not return text unless image generation is impossible.

Generate a realistic face swap using exactly two reference images.

Image 1: The captured photo of the user. This is the only identity source.
Image 2: The selected jersey reference image. This is the target body, pose, framing, jersey, and composition source.

TASK - Keep the full target image structure from Image 2, but replace the target person's face, hair, visible head identity, and full visible neck down to the jersey collar with the user from Image 1. The final result must look like the user from Image 1 is naturally wearing the exact jersey in Image 2.

ABSOLUTE JERSEY LOCK - The jersey in Image 2 is the most important fixed element. Preserve it exactly as shown. Do not change, redraw, clean up, simplify, invent, remove, or reinterpret any jersey detail. Keep the exact colors, shade, contrast, patterns, sponsor text, logos, badges, numbers, stars, collar shape, sleeve shape, seams, stitching, fabric texture, wrinkles, folds, shadows, fit, body placement, and typography from Image 2. The face swap must happen around the locked jersey and body, not by regenerating or redesigning the jersey. If there is any conflict between preserving the jersey and improving the face swap, prioritize the jersey staying identical.

PROPORTION LOCK - The body-to-head ratio, head size, face size, neck width, shoulder width, and overall anatomy from Image 2 are mandatory. The swapped face and hair must fit inside the original head silhouette and skull size from Image 2. Do not enlarge the face to preserve detail. Do not make the head wider, taller, closer to camera, or larger than the original target head in Image 2. Keep the chin-to-neck connection, jaw width, temple width, forehead height, and hair volume proportional to the target body. The final image must have a natural human head size for the visible torso and shoulders, with no oversized face, bobblehead effect, swollen head, stretched head, or shrunken body.

HEAD AND NECK ACCURACY LOCK - Keep the user's real head and visible neck identity from Image 1 accurate and recognizable. Preserve the actual face shape, skull shape, forehead, hairline, hairstyle, hair density, hair texture, beard/mustache shape if present, eyebrow shape, eye spacing, nose shape, lips, cheeks, jaw, chin, ears if visible, neck skin tone, neck width, throat structure, jaw-to-neck transition, and natural asymmetry. Do not turn the user into the target person from Image 2. Do not make the face or neck generic, younger, older, slimmer, wider, smoother, more symmetrical, more attractive, or more stylized. The head and neck must remain the same person from Image 1, only relit and scaled to fit Image 2.

FACIAL STRUCTURE LOCK - The user's facial structure from Image 1 must remain unchanged. Keep the exact face shape, bone structure, jawline, chin, cheeks, cheekbones, forehead, temples, eye sockets, eye spacing, nose bridge, nose width, nostrils, mouth width, lip shape, facial proportions, neck tone, throat shape, skin marks, asymmetry, and expression. Do not reshape, refine, beautify, slim, widen, age, de-age, smooth, stylize, average, or reinterpret any part of the user's face or visible neck. Only adjust scale, angle, lighting, and color enough to fit naturally into Image 2.

IDENTITY LOCK - Image 1 is the absolute source of truth for the user's face and neck identity. Extract and transplant the following features with zero modification: eye shape, eye color, iris pattern, eyelid fold, eyebrow shape and thickness, nose bridge width, nose tip shape, nostril shape, lip thickness and shape, cupid's bow, philtrum, cheek structure, jawline geometry, chin shape, forehead height, hairline shape, hair color, hair texture, hair parting, hair volume, hair length, neck skin tone, neck undertone, throat shadows, jaw-to-neck transition, and all skin details including tone, undertone, pores, marks, moles, scars, and natural asymmetry. If the user wears glasses in Image 1, preserve the glasses on the swapped face. If the user is clean-shaven in Image 1, the output must also be clean-shaven - no stubble, no beard, no mustache, no sideburns added under any circumstance.

HAIR CONSISTENCY - The hair from Image 1 must remain the same in every output. Do not replace it with the target person's hair from Image 2. Do not make it neater, longer, shorter, thicker, thinner, curlier, straighter, darker, lighter, wet, glossy, or more styled. Preserve the same silhouette, hairline, volume, parting, forehead coverage, flyaways, and texture from Image 1.

HEAD AND NECK FIT - Reconstruct the user's face identity, exact hairstyle, and visible neck from Image 1 onto the head and neck position of the target person in Image 2. Swap the skin region continuously from the top of the hair/head through the full face, jaw, chin, throat, and visible neck down to the jersey collar opening. Do not leave the original target neck visible below the swapped face. Do not paste the whole head from Image 1 as a cutout. Do not copy the original Image 1 shoulders, background edge, or lighting as a single patch. Match the yaw, pitch, and roll of the head to the pose in Image 2. Scale the face and neck proportionally so the eye-to-chin distance, temple-to-temple width, forehead-to-chin height, hair outer boundary, jawline, neck width, and collar contact fit the target body in Image 2. Do not stretch or compress facial features during this scaling. If exact hair shape conflicts with realistic head proportions, prioritize natural target-body proportions while preserving the user's hairline, color, texture, and parting. The final head and neck must be anatomically attached to the target shoulders and jersey collar from Image 2, with no floating-head, pasted-mask, mismatched-neck, or two-tone-skin look.

SCENE MATCH / LIGHTING LOCK - This is the most critical step. The swapped face, head, and neck must look like they were photographed in the same original shoot as Image 2. Analyze Image 2's lighting direction, light height, light softness, shadow density, black levels, contrast, saturation, color temperature, camera sharpness, grain/noise, compression, depth of field, and overall poster color grade before editing. Re-light and color-grade the user's face, hair, beard, jaw, throat, and full visible neck from Image 1 to match Image 2 exactly. Match the forehead highlights, nose shadows, under-eye shadows, cheek shadows, beard shadows, hair highlights, chin shadow, jaw shadow, throat shadow, and neck shadow to Image 2. The head and neck must have the same exposure, contrast, edge softness, skin texture visibility, and sharpness as the body and jersey. Blend skin tone at the jawline, temples, hairline, ears, beard edge, throat, sides of neck, base of neck, and collar opening with zero visible seam. The final image must look like one real photo, not a face pasted onto a different neck from another person, different camera, different flash, different day, or different color grade.

DSLR LIGHTING STYLE - Make the final output look like a professional DSLR portrait captured in a studio: crisp optical detail, natural depth, realistic lens rendering, polished highlights, controlled rim light, soft frontal fill, subtle shine on skin and fabric, and a clean cinematic glow. Add a slightly stronger premium studio-light shine: catchlights in the eyes, gentle forehead and cheek highlights, soft hair highlights, realistic jersey fabric sheen, and a subtle background light bloom that matches Image 2. The image should feel freshly captured on a DSLR camera with a high-quality portrait lens, balanced exposure, rich contrast, clear subject separation, and polished event-photo lighting. Add light shine and glow only as natural photographic lighting that matches Image 2. Do not add artificial stickers, neon effects, fantasy glow, lens flares covering the face, or any graphic overlay. The face must remain structurally unchanged and recognizable while gaining realistic DSLR-quality light and clarity.

BODY & CLOTHING - The body, clothing, jersey, pose, accessories, and composition from Image 2 are completely locked. Do not alter them in any way. Every jersey detail must remain pixel-perfect: colors, numbers, sponsor logos, badge, collar shape, sleeve design, stripes, patterns, typography, fabric texture, folds, wrinkles, shadows, fit, and placement. Do not recolor, simplify, redraw, clean, sharpen, blur, crop, warp, or reinterpret any part of the jersey under any circumstance. Only the user's face, hair, full visible neck, and necessary head/neck-to-collar blending may change.

BACKGROUND / POSTER LOCK - Do not create a green screen. Preserve the original background, poster layout, black areas, smoke, lighting, shadows, header graphics, footer graphics, crop, canvas size, and composition from Image 2 exactly as much as possible. Do not remove the background, replace it with a solid color, make it transparent, or generate any flat green background. The only intended change is the user's face, hair, and necessary head/neck blending.

OUTPUT QUALITY - Photorealistic, high-resolution, single portrait. Not a collage. Not side-by-side.

NO EXTRA MARKS OR TEXT - Preserve the full Image 2 frame exactly. Do not add any new mark, sparkle icon, star-shaped icon, four-point shine icon, model/provider/app branding, watermark, signature, stamp, badge, label, attribution text, generated-by text, slogan, caption, compliment text, service mark, QR code, barcode, or extra graphic anywhere in the output. Do not add text like "it looks good on you", "looks good on you", or any similar phrase. The only logos, stars, icons, or text allowed are the ones already present in Image 2 on the jersey or poster layout.

Negative Prompt:
Do not synthesize a new face. Do not approximate or average the user's identity. Do not change the user's facial structure, face shape, bone structure, jawline, chin, cheeks, cheekbones, forehead, temples, eye spacing, eye shape, nose shape, nose width, nostrils, mouth width, lip shape, facial proportions, neck tone, throat shape, natural asymmetry, skin marks, or expression. Do not beautify, smooth, slim, widen, sharpen, soften, age, de-age, idealize, stylize, cartoon, retouch, or reinterpret the face or visible neck. Do not add facial hair not present in Image 1. Do not change hairstyle, hair length, hair color, hair texture, hairline, hair volume, hair parting, forehead coverage, or flyaways. Do not paste the whole head from Image 1. Do not copy the Image 1 shoulders, background, or clothing as a cutout layer. Do not leave the original target neck visible under the swapped face. Do not create a different-color neck, dark neck under light face, light neck under dark face, two-tone skin, neck seam, chin seam, jaw seam, collar seam, or mismatched face-to-neck transition. Do not enlarge the user's face or head. Do not make the face bigger than the target face in Image 2. Do not create an oversized head, bobblehead look, swollen forehead, wide jaw, tiny neck, tiny shoulders, or mismatched head-to-body proportions. Do not make the head look copied from a different image. Do not leave the face or neck brighter, darker, warmer, cooler, sharper, blurrier, smoother, noisier, flatter, or more contrasty than the body and jersey. Do not create a hard face edge, halo, mask outline, mismatched beard edge, mismatched hair edge, mismatched neck color, or pasted-on look. Do not include Image 1 background edges, lighting, shoulder patch, or clothing patch. Do not alter the target body, clothing, pose, or accessories except for replacing the visible neck skin down to the jersey collar. Do not change jersey colors, numbers, logos, badges, collar, sleeves, stripes, patterns, sponsor text, fabric texture, folds, wrinkles, fit, placement, shadows, or typography. Do not recolor, redesign, regenerate, clean up, sharpen, blur, crop, warp, simplify, or reinterpret the jersey. Do not replace the jersey with a similar jersey. Do not use a green screen. Do not create a flat green, transparent, cutout, removed, white, gray, or newly generated background. Do not alter the Image 2 poster layout, black background, smoke, header graphics, footer graphics, crop, or canvas size. Do not add a new sparkle icon, star-shaped icon, four-point shine icon, model/provider/app branding, watermark, signature, stamp, attribution, generated-by label, service mark, QR code, barcode, slogan, caption, compliment text, "it looks good on you", "looks good on you", or any new branding/text/graphic mark that is not already present in Image 2. Do not add fake neon glow, fantasy light, harsh lens flare, overexposed shine, plastic skin, waxy skin, beauty-filter smoothing, blown highlights, graphic light streaks, or artificial lighting overlays. Do not use the original lighting from Image 1 on the swapped face or neck. Do not leave mismatched color temperature between face, neck, and body. Do not produce flat-lit face on a dramatically lit body or vice versa. Do not leave visible brightness difference between the face and neck. Do not produce a pasted-on look, mismatched skin tone, wrong hairline, warped eyes, distorted nose, blurry face, bad neck anatomy, floating head, extra faces, or visible compositing seams.`;

    const response = await generateImageWithPrompt(ai, prompt, userImageBlob, clothingImageBlob);
    console.log('Response text:', response.text);

    let generatedImage = response.image;

    if (!generatedImage) {
      const retryPrompt = `Return one edited image only.

Use Image 2 as the target jersey/body/poster. Replace the target person's face, hair, head, and full visible neck down to the jersey collar with the same user's identity from Image 1.

Keep the user's face structure unchanged: same face shape, jaw, chin, cheeks, nose, lips, eyes, glasses if present, hair, skin tone, marks, asymmetry, and expression. The neck must match the user's face and blend naturally to the jersey collar. Do not leave the original target neck visible. Do not create two-tone skin or a face/neck seam.

Preserve Image 2's jersey, pose, background, crop, logos, sponsor text, fabric, collar, sleeves, colors, shadows, and poster layout exactly. Add realistic DSLR studio lighting with natural shine, eye catchlights, fabric sheen, and clean glow. No new sparkle icon, star-shaped icon, four-point shine icon, model/provider/app branding, watermark, signature, text label, slogan, caption, compliment text, "it looks good on you", "looks good on you", QR code, barcode, fake neon glow, harsh lens flare, plastic skin, or beauty-filter smoothing.`;

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
