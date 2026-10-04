type PromptStyle = 'detailed' | 'short' | 'tags';

type VisualContext = {
  width: number;
  height: number;
  palette: string[];
  lighting: string;
  contrast: string;
  saturation: string;
  visualFocus: string;
};

const MAX_IMAGE_DATA_LENGTH = 12 * 1024 * 1024;

function buildFallbackPrompt(style: PromptStyle, context: VisualContext) {
  const orientation = context.width > context.height
    ? 'wide landscape framing'
    : context.height > context.width
      ? 'vertical portrait framing'
      : 'balanced square framing';
  const palette = context.palette.length ? context.palette.join(', ') : 'a coherent natural color palette';
  const imageTraits = `${orientation}, ${context.lighting} lighting, ${context.contrast} contrast, ${context.saturation} color saturation, dominant colors ${palette}, ${context.visualFocus}`;

  if (style === 'short') {
    return `Faithfully recreate the main visible subject and scene from the reference image, preserving its framing and visual character. ${imageTraits}.`;
  }
  if (style === 'tags') {
    return ['reference-faithful', 'main subject preserved', orientation, context.lighting, `${context.contrast} contrast`, `${context.saturation} colors`, ...context.palette, context.visualFocus, 'art direction', 'high detail'].join(', ');
  }
  return `Create a faithful visual recreation of the uploaded reference image. Preserve the main visible subject, its defining details, the scene arrangement, and the original point of view. Use ${orientation}; keep the visual emphasis ${context.visualFocus}. Shape the scene with ${context.lighting} lighting and ${context.contrast} contrast, with ${context.saturation} color saturation. Use a restrained palette led by ${palette}. Match the reference image's artistic medium and visual style, with deliberate depth, clean edges, realistic material detail, and a polished editorial finish. Do not add text, logos, or unrelated objects.`;
}

function isPromptStyle(value: unknown): value is PromptStyle {
  return value === 'detailed' || value === 'short' || value === 'tags';
}

function readVisualContext(value: unknown): VisualContext | null {
  if (!value || typeof value !== 'object') return null;
  const context = value as Record<string, unknown>;
  if (typeof context.width !== 'number' || typeof context.height !== 'number') return null;
  const palette = Array.isArray(context.palette)
    ? context.palette.filter((color): color is string => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)).slice(0, 5)
    : [];
  const readLabel = (key: string, allowed: string[]) => typeof context[key] === 'string' && allowed.includes(context[key] as string) ? context[key] as string : allowed[0];

  return {
    width: Math.max(1, Math.round(context.width)),
    height: Math.max(1, Math.round(context.height)),
    palette,
    lighting: readLabel('lighting', ['balanced']),
    contrast: readLabel('contrast', ['moderate']),
    saturation: readLabel('saturation', ['natural']),
    visualFocus: readLabel('visualFocus', ['a clear, balanced distribution of visual detail']),
  };
}

async function requestGemini(imageData: string, style: PromptStyle) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const instructions: Record<PromptStyle, string> = {
    detailed: 'Examine the image carefully and write one detailed image-generation prompt that can recreate it. Precisely describe the visible subject and distinguishing details, setting, foreground/background relationships, composition, framing and viewpoint, lighting direction and quality, color palette, materials, medium, and artistic style. Do not claim details that cannot be seen. Return only the prompt, with no introduction or explanation.',
    short: 'Examine the image and write one short, direct image-generation prompt. Name the main visible subject, setting, composition, lighting, and strongest artistic style cues. Be concise and do not invent unseen details. Return only the prompt.',
    tags: 'Examine the image and return useful comma-separated artistic prompt tags covering the visible subject, setting, composition, lighting, color palette, medium, and style. Use concise tags only, with no sentence, heading, or explanation.',
  };
  const [, mimeType, base64Data] = imageData.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i) ?? [];
  if (!mimeType || !base64Data) throw new Error('Invalid image data URL for Gemini.');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: 'You are an expert visual analyst and image-prompt writer. Describe only what is visible in the supplied image. Return the requested result without markdown fences.' }],
      },
      contents: [{
        role: 'user',
        parts: [
          { text: instructions[style] },
          { inline_data: { mime_type: mimeType.toLowerCase(), data: base64Data } },
        ],
      }],
      generationConfig: { temperature: 0.35, maxOutputTokens: 500 },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini returned ${response.status}: ${errorBody.slice(0, 300)}`);
  }

  const payload = await response.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const prompt = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('\n')
    .trim() ?? '';
  return prompt || null;
}

export async function POST(request: Request) {
  let payload: { imageData?: unknown; style?: unknown; visualContext?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Corps de requête JSON invalide.' }, { status: 400 });
  }

  const { imageData, style, visualContext: contextValue } = payload;
  if (typeof imageData !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/i.test(imageData)) {
    return Response.json({ error: 'Une image encodée en base64 est requise.' }, { status: 400 });
  }
  if (imageData.length > MAX_IMAGE_DATA_LENGTH) {
    return Response.json({ error: 'Image trop volumineuse après préparation.' }, { status: 413 });
  }
  if (!isPromptStyle(style)) {
    return Response.json({ error: 'Style de prompt non pris en charge.' }, { status: 400 });
  }
  const context = readVisualContext(contextValue);
  if (!context) {
    return Response.json({ error: 'Les dimensions et caractéristiques visuelles sont requises.' }, { status: 400 });
  }

  try {
    const prompt = await requestGemini(imageData, style);
    if (prompt) return Response.json({ prompt, source: 'vision' });
  } catch (error) {
    console.error('Gemini vision unavailable; using visual prompt fallback:', error);
  }

  return Response.json({ prompt: buildFallbackPrompt(style, context), source: 'fallback' });
}
