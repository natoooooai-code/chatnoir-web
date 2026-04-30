import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { apiKey, characterName, systemInstruction, messages } = await req.json();

    if (!apiKey || !characterName) {
      return NextResponse.json({ error: 'API key and characterName are required' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // 文脈（これまでの会話）を文字列化
    const contextText = Array.isArray(messages) 
      ? messages.map((m: any) => `${m.role === 'user' ? 'Player' : 'GM'}: ${m.parts?.[0]?.text || ''}`).join('\n')
      : '';

    // 1. 設定ファイル（systemInstruction）＋ 会話履歴（contextText）から、該当キャラクターの外見情報を抽出する
    const extractionPrompt = `
あなたはキャラクターデザインの専門家です。
以下の【シナリオ設定】および【ゲーム文脈】から、「${characterName}」というキャラクターの外見情報を抽出し、画像生成AIのための英語プロンプト（カンマ区切り）を作成してください。

【厳守事項】
1. 日本語、解説、マークダウン、キャラクターの固有名詞（ローマ字含む）は一切出力しないでください。
2. 情報が不足している場合は、名前の響きや役割から適当な外見を必ず推測・創作して補ってください。空欄は許されません。
3. 最初に「1girl」または「1boy」または「1man」などの性別と人数のベースタグを置いてください。
4. 次に「20s, short black hair, wearing a white shirt, serious expression」などの外見や年齢のタグを置いてください。
5. 必ず最後に「, bust-up portrait, upper body only, anime style portrait, solid light gray background, highly detailed」を付けて出力してください。

【出力形式の例】
1girl, 20s, long brown hair, wearing a police uniform, smiling, bust-up portrait, upper body only, anime style portrait, solid light gray background, highly detailed

【シナリオ設定】
${systemInstruction}

【ゲーム文脈】
${contextText || 'なし'}
`;

    const descriptionRes = await ai.models.generateContent({
      model: 'gemma-4-31b-it',
      contents: [{ role: 'user', parts: [{ text: extractionPrompt }] }],
      config: { temperature: 0.5 }
    });

    const imagePrompt = descriptionRes.text?.trim() || `1 person, bust-up portrait, anime style portrait, solid light gray background, highly detailed`;

    console.log(`[Avatar Gen] Extracted Prompt for ${characterName}:`, imagePrompt);

    return NextResponse.json({ prompt: imagePrompt });

  } catch (error: any) {
    console.error('Prompt Generation Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
