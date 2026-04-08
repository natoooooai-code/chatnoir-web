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

    // 指数バックオフ付きのリトライ関数
    const fetchWithRetry = async (fn: () => Promise<any>, maxRetries = 3) => {
      let lastError: any;
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await fn();
        } catch (error: any) {
          lastError = error;
          // 429 (Rate Limit) or 503 (Overloaded) はリトライ対象
          const isRetriable = error.message?.includes('503') || error.message?.includes('429') || error.message?.includes('UNAVAILABLE');
          if (isRetriable && i < maxRetries - 1) {
            const waitTime = Math.pow(2, i) * 1000 + Math.random() * 500;
            console.warn(`[Gemini API] 負荷過多または制限を検知 (${i + 1}/${maxRetries})。${waitTime}ms 後に再試行します...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          throw error;
        }
      }
      throw lastError;
    };

    // 【1回目】通常の文章生成
    let response = await fetchWithRetry(() => ai.models.generateContent({
      model: requestedModel,
      contents: messages,
      config: {
        systemInstruction: systemInstruction || "あなたはミステリーのゲームマスターです。必ず「📍 [現在地] | 🕐 [日時]」で返答を締めてください。",
        temperature: 0.7,
      }
    }));

    let responseText = response.text;

    // --- GMの暴走（ハルシネーション）検知＆自己修復ループ ---
    // ※ただのJSON抽出コマンドの時は回さない
    if (!isSystemCommand) {
      const validatorPrompt = `あなたはTRPGのゲームマスター出力を監査するチェッカーです。
以下のテキストは、ミステリーゲームのGMの出力です。

【絶対に許されない禁止事項（ハルシネーション）】
1. 主人公の気持ちや推理を描写している。
2. 主人公のセリフを勝手に記述している（例：「私は〜と言った」など）。
3. 主人公の行動をプレイヤーの代わりに勝手に描写してしまっている（例：手紙を誰かに渡す、秘密を打ち明ける、ある場所へ移動する、NPCの提案に同意する、証拠を突きつける）。※ただし、状況から必然的に発生する小さな身体動作や、描写の流れとして自然なもの（例：声のした方を振り向く、差し出された物を受け取る、目の前の人物に視線を向ける）は、地の文の中で自然に描写してよい。
4. プレイヤーに次の行動を問いかけるシステム的な地の文が最後に書かれている。（例：さて、次は何をしようか？）
5. NPCが発言するとき、その時点でNPCが知り得ない情報を語ってしまう。※どのNPCがどの情報を知っているのかを認識すること。

上記の【禁止事項】を1つでも破っている場合は「NG」、破っておらず正常（状況描写やNPCのセリフのみで停止している）であれば「OK」と出力してください。
もしNGの場合は、どの禁止事項に該当したかを簡潔に1行で添えてください。
余計な挨拶や解説は不要です。

監査対象テキスト：
${responseText}`;

      // 判定は超高速なFlashモデルに固定
      const validatorResponse = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: [{ role: 'user', parts: [{ text: validatorPrompt }] }],
        config: { temperature: 0.1 } // ブレをなくすため非常に低く設定
      });

      const validatorText = validatorResponse.text || '';
      const isNG = validatorText.includes('NG');

      // NGと判定されたら、システムプロンプトを激怒モードにして再出力（リトライ）
      if (isNG) {
        const reasonMatch = validatorText.match(/\[理由:?\s*(.+?)\]/);
        const reason = reasonMatch ? reasonMatch[1] : validatorText.replace('NG', '').trim();

        console.warn("🚨 GMの暴走（主人公の乗っ取り）を検知しました。");
        console.warn(`🛑 違反内容: ${reason || '詳細不明'}`);
        console.log("▼ 暴走テキスト:\n", responseText);
        console.warn("自動修復（再生成）を実行します...");

        const retryInstruction = systemInstruction + `\n\n【システムからの超重要警告】あなたの直前の出力は、以下の禁止事項に違反する致命的エラーを起こしました：\n「${reason}」\n今回は絶対に！この違反を繰り返さず、主人公の行動や感情を勝手に書かず、NPCの反応や状況の描写のみで出力を停止してください！！！`;

        response = await fetchWithRetry(() => ai.models.generateContent({
          model: requestedModel,
          contents: messages,
          config: {
            systemInstruction: retryInstruction,
            temperature: 0.4, // リトライ時は暴走を抑えるために温度を少し下げる
          }
        }));

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
