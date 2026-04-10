import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { apiKey, messages, systemInstruction, model, isReviewMode } = await req.json();

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
    // ※特殊JSONコマンド時や感想戦モードの時は回さない
    if (!isSystemCommand && !isReviewMode) {
      // チェック精度向上のため、セッティングとこれまでの履歴を文脈として渡す
      const historyContext = messages.map((m: any) => `${m.role === 'user' ? 'Player' : 'GM'}: ${m.parts?.[0]?.text || ''}`).join('\n');

      const validationPrompt = `
あなたはミステリーゲームの監査官です。
以下の【シナリオ設定】および【これまでの会話履歴】を把握した上で、最新の「GMの出力」が【ルールと禁止事項】に違反していないか厳格にチェックしてください。

【シナリオ設定】
${systemInstruction}

【これまでの会話履歴】
${historyContext}

【禁止事項】
1. 地の文で主人公（プレイヤー）の次の行き先や行動を示唆することを禁止します。（例：「廊下の奥が気になった」「図書室に何かありそうだ」）
2. 主人公の感情（「俺は～と思った」）や主人公のセリフ（「僕は〜と言った」）を出力することを禁止します。
3. 主人公（プレイヤー）の意思決定が必要な行動（物語の展開や人間関係に影響を与えるもの）を出力することを禁止します。（例：手紙を誰かに渡す、秘密を打ち明ける、ある場所へ移動する、NPCの提案に同意する、証拠を突きつける）
4. 設定ファイルに書かれた「事実」と「物理法則」に矛盾することを出力することを禁止します。
5. 主人公（プレイヤー）が事件と無関係な行動をとった場合に、地の文やNPCのセリフを通して、「事件を調べないのですか？」などと誘導することを禁止します。事件を調べないことにするのも、一つの選択だからです。
6. セリフの前に発言者の名前を付けないことを禁止します。
7. ただし、その時点で主人公が名前を知らない人物がセリフを言うとき、その人物のセリフの前に本名を付けることを禁止します。※代わりに、外見的特徴で記述する必要があります。（例：黒服の男「～～」）

上記の【禁止事項】に該当するものが1つでもあれば「NG」、ルールが守られており正常であれば「OK」と出力してください。
もしNGの場合は、どんな違反しているかを「[理由: ◯◯]」の形式で添えてください。

【チェック対象のテキスト（GMの最新出力）】
${responseText}
`;

      // 判定は超高速なFlashモデルに固定
      const validatorResponse = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: [{ role: 'user', parts: [{ text: validationPrompt }] }],
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

        const retryInstruction = systemInstruction + `\n\n【システムからの超重要警告】あなたの直前の出力は、以下の禁止事項に違反する致命的エラーを起こしました：\n「${reason}」\n今回は絶対に！この違反を繰り返さずに書き直してください！！！`;

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
