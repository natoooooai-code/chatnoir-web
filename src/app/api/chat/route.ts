import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { apiKey, messages, systemInstruction, model } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }

    // 最後のメッセージが「裏側からの特殊JSONコマンド」かどうかを判定（バリデーションをスキップするため）
    const lastUserMessage = messages[messages.length - 1]?.parts?.[0]?.text || '';
    const isSystemCommand = lastUserMessage.startsWith('（システムコマンド：');

    const ai = new GoogleGenAI({ apiKey });
    const requestedModel = model || 'gemini-3.1-flash-lite-preview';

    // 【1回目】通常の文章生成
    let response = await ai.models.generateContent({
      model: requestedModel,
      contents: messages,
      config: {
        systemInstruction: systemInstruction || "あなたはミステリーのゲームマスターです。必ず「📍 [現在地] | 🕐 [日時]」で返答を締めてください。",
        temperature: 0.7,
      }
    });
    
    let responseText = response.text;

    // --- GMの暴走（ハルシネーション）検知＆自己修復ループ ---
    // ※ただのJSON抽出コマンドの時は回さない
    if (!isSystemCommand) {
      const validatorPrompt = `あなたはTRPGのゲームマスター出力を監査するチェッカーです。
以下のテキストは、ミステリーゲームのGMの出力です。

【絶対に許されない禁止事項（ハルシネーション）】
1. プレイヤー（主人公）の感情や思考を勝手に描写している。
2. プレイヤー（主人公）の行動やセリフを作勝手に作り出して完結させている（例：「私は〜と言った」「私は〜へ向かった」など）。

上記の【禁止事項】を1つでも破っている場合は「NG」、破っておらず正常（状況描写やNPCのセリフのみで停止している）であれば「OK」とだけ出力してください。余計な理由などは一切不要です。

監査対象テキスト：
${responseText}`;

      // 判定は超高速なFlashモデルに固定
      const validatorResponse = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: [{ role: 'user', parts: [{ text: validatorPrompt }] }],
        config: { temperature: 0.1 } // ブレをなくすため非常に低く設定
      });

      const isNG = (validatorResponse.text || '').includes('NG');

      // NGと判定されたら、システムプロンプトを激怒モードにして再出力（リトライ）
      if (isNG) {
        console.warn("🚨 GMの暴走（主人公の乗っ取り）を検知しました。自動修復（再生成）を実行します...");
        
        const retryInstruction = systemInstruction + "\n\n【システムからの超重要警告】あなたの直前の出力は、主人公の行動や感情を勝手に描写する致命的エラーを起こしました！今回は絶対に！主人公の行動を勝手に書かず、NPCの反応や状況の描写のみで出力を停止してください！！！";
        
        response = await ai.models.generateContent({
          model: requestedModel,
          contents: messages,
          config: {
            systemInstruction: retryInstruction,
            temperature: 0.4, // リトライ時は暴走を抑えるために温度を少し下げる
          }
        });
        
        responseText = response.text || '';
        console.log("✅ 修復後テキスト:", responseText);
      }
    }

    return NextResponse.json({ text: responseText || '' });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
