import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

interface ChatMessage {
  role?: string;
  parts?: Array<{ text?: string }>;
}

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Internal Server Error';

export async function POST(req: NextRequest) {
  try {
    const { apiKey, characterName, systemInstruction, messages } = await req.json();

    if (!apiKey || !characterName) {
      return NextResponse.json({ error: 'API key and characterName are required' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // 文脈（これまでの会話）を文字列化
    const contextText = Array.isArray(messages) 
      ? (messages as ChatMessage[]).map((message) => `${message.role === 'user' ? 'Player' : 'GM'}: ${message.parts?.[0]?.text || ''}`).join('\n')
      : '';

    // 1. 設定ファイル（systemInstruction）＋ 会話履歴（contextText）から、該当キャラクターの外見情報を抽出する
    const extractionPrompt = `
以下の【シナリオ設定】と【ゲーム文脈】を読み、「${characterName}」の外見を描写した画像生成プロンプトを日本語で1〜3文で書いてください。

含めること:
- 年齢感・性別・雰囲気（シナリオの設定通りでよい）
- 髪型・髪色・表情
- 服装
- バストアップ、正面向き
- アニメ調イラスト、シンプルな明るいグレーの背景、高精細

例: 20代後半の女性。茶色のロングヘアで、明るく元気な笑顔。セーラー服を着ている。バストアップ、正面向き。アニメ調イラスト、シンプルな明るいグレーの背景、高精細。

情報が少ない場合は名前・役割から外見を創作して補うこと。出力はプロンプトのみ（説明不要）。未成年のキャラクターの場合、年齢に関する情報はプロンプトに含めないでください。

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

    const imagePrompt = descriptionRes.text?.trim() || `人物のバストアップ、正面向き。アニメ調イラスト、シンプルな明るいグレーの背景、高精細。`;

    console.log(`[Avatar Gen] Extracted Prompt for ${characterName}:`, imagePrompt);

    return NextResponse.json({ prompt: imagePrompt });

  } catch (error: unknown) {
    console.error('Prompt Generation Error:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
