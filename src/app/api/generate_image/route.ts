import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { apiKey, characterName, systemInstruction, messages } = await req.json();

    if (!apiKey || !characterName) {
      return NextResponse.json({ error: 'API key and characterName are required' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // 会話の文脈を文字列化
    const contextText = Array.isArray(messages)
      ? messages.map((m: any) => `${m.role === 'user' ? 'Player' : 'GM'}: ${m.parts?.[0]?.text || ''}`).join('\n')
      : '';

    // Step 1: キャラクター情報から画像生成プロンプトを生成（日本語）
    const extractionPrompt = `
以下の【シナリオ設定】と【ゲーム文脈】を読み、「${characterName}」の外見を描写した画像生成プロンプトを日本語で1〜3文で書いてください。

含めること:
- 成人のキャラクター（adult）、年齢感・性別・雰囲気
- 髪型・髪色・表情
- 服装
- バストアップ、正面向き
- アニメ調イラスト、シンプルな明るいグレーの背景、高精細

例: 20代前半の成人女性。黒髪ショートで、冷静な表情。白いシャツにネイビージャケットを着ている。バストアップ、正面向き。アニメ調イラスト、シンプルな明るいグレーの背景、高精細。

情報が少ない場合は名前・役割から外見を創作して補うこと。出力はプロンプトのみ（説明不要）。

【シナリオ設定】
${systemInstruction}

【ゲーム文脈】
${contextText || 'なし'}
`;

    const promptRes = await ai.models.generateContent({
      model: 'gemma-4-31b-it',
      contents: [{ role: 'user', parts: [{ text: extractionPrompt }] }],
      config: { temperature: 0.5 }
    });

    const imagePrompt = promptRes.text?.trim()
      || `20代の成人キャラクター、バストアップ、正面向き、アニメ調イラスト、シンプルな明るいグレーの背景、高精細。`;

    console.log(`[Image Gen] Prompt for ${characterName}:`, imagePrompt);

    // Step 2: Gemini Flash Image（Nano Banana無印）で画像を生成
    const imageRes = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-05-20',
      contents: [{ role: 'user', parts: [{ text: imagePrompt }] }],
      config: {
        responseModalities: ['IMAGE', 'TEXT'],
        temperature: 1,
      }
    });

    // 画像パーツを取得
    const parts = imageRes.candidates?.[0]?.content?.parts;
    const imagePart = parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));

    if (!imagePart?.inlineData) {
      return NextResponse.json({ error: 'No image generated. The model may not have produced an image.' }, { status: 500 });
    }

    const base64Image = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;

    return NextResponse.json({ image: base64Image, prompt: imagePrompt });

  } catch (error: any) {
    console.error('Image Generation Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
