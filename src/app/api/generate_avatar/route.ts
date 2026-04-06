import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { apiKey, characterName, systemInstruction } = await req.json();

    if (!apiKey || !characterName) {
      return NextResponse.json({ error: 'API key and characterName are required' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // 1. 設定ファイル（systemInstruction）から、該当キャラクターの外見情報を抽出する
    const extractionPrompt = `
あなたはキャラクターデザインのアシスタントです。
以下の【シナリオ設定】の中から、「${characterName}」という名前のキャラクターの「外見（年齢、性別、髪型、服装、雰囲気など）」に関する情報を探し出し、画像生成AIのための英語のプロンプト（カンマ区切りの短い単語の羅列）を作成してください。

もし設定内に外見の記載がない場合は、名前の響きや役割から適当な外見を推測して作成してください。
必ず出力には年齢に関するワード（例: 25yo, 30s man）を含め、最後に ", bust-up portrait, upper body only, anime style portrait, solid light gray background, highly detailed" を付けてください。全身画像にならないように注意してください。
出力は英語のプロンプトの文字列のみとしてください。

【シナリオ設定】
${systemInstruction}
`;

    const descriptionRes = await ai.models.generateContent({
      model: 'gemma-4-31b-it',
      contents: [{ role: 'user', parts: [{ text: extractionPrompt }] }],
      config: { temperature: 0.5 }
    });

    const imagePrompt = descriptionRes.text?.trim() || `portrait of ${characterName}, anime style portrait, solid light gray background`;

    console.log(`[Avatar Gen] Extracted Prompt for ${characterName}:`, imagePrompt);

    return NextResponse.json({ prompt: imagePrompt });

  } catch (error: any) {
    console.error('Prompt Generation Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
