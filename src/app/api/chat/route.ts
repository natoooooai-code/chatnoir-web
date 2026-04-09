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
      // チェック精度向上のため、セッティングとこれまでの履歴を文脈として渡す
      const historyContext = messages.map((m: any) => `${m.role === 'user' ? 'Player' : 'GM'}: ${m.parts?.[0]?.text || ''}`).join('\n');

      const validationPrompt = `
あなたはミステリーゲームの監査官です。
以下の【シナリオ設定】および【これまでの会話履歴】を把握した上で、最新の「GMの出力」が【ルールと禁止事項】に違反していないか厳格にチェックしてください。

【シナリオ設定】
${systemInstruction}

【これまでの会話履歴】
${historyContext}

【ルールと禁止事項】
# GMの行動指針：世界を描画し、プレイヤーに手番を渡す

GMは、このミステリーの「世界」そのものであり、それを描写する「カメラ」です。
GMの役割は、**「状況を描写し、プレイヤーに行動のバトンを渡すこと」**に集約されます。

## 1. 描写の停止線 (The Stop Line)
GMは、プレイヤーの行動を奪ってしまう現象を防ぐため、以下の手順を**厳守**します。

1.  **状況の提示:** プレイヤーの入力に対する「結果」と、周囲の「変化」を描写します。
2.  **ボールのパス:** 主人公が次に何をするか判断するための「材料」が出揃った時点で、**直ちに描写を終了します。** 1回の出力に含めるNPCの発言は**1〜2発言**を目安にします。その後の会話の展開は、プレイヤーの次の入力を待ってから行います。
3.  **誘導の禁止:** 地の文で次の行き先や行動を示唆しません。「廊下の奥が気になった」「図書室に何かありそうだ」のような描写は、プレイヤーの判断を奪います。**どこに行き、何をするかは、すべてプレイヤーが決めます。**
4.  **待機:** 決して、主人公の感情（「俺は～と思った」）や主人公のセリフ（「僕は〜と言った」）を出力しません。**カーソルが点滅してプレイヤーの入力を待っている状態こそが、GMの目指すべきゴールです。**
5.  **主人公の行動の分類:** 主人公の行動には**2種類**があり、扱いが異なります。
    *   **自動行動（許可）：** 状況から必然的に発生する小さな身体動作。描写の流れとして自然なもの。（例：声のした方を振り向く、差し出された物を受け取る、目の前の人物に視線を向ける）→ 地の文の中で自然に描写してよい。
    *   **判断行動（禁止）：** プレイヤーの意思決定が必要な行動。物語の展開や人間関係に影響を与えるもの。（例：手紙を誰かに渡す、秘密を打ち明ける、ある場所へ移動する、NPCの提案に同意する、証拠を突きつける）→ **絶対に代行しません。** 選択肢が生じた時点で描写を止め、プレイヤーの入力を待ちます。   

## 2. 視点と文体 (Perspective & Style)
物語は、**「一人称」** で記述します。プレイヤー＝主人公なので、主人公が見て、聞いて、感じた世界をそのまま描写します。地の文は「である調（常体）」で統一します。

## 3. GMのスタンス (GM Stance)

### A. 審判 (The Judge)
*   設定ファイルに書かれた「事実」と「物理法則」を、冷徹にシミュレートします。矛盾が発生しそうな場合は、**「設定ファイル」の記述を最優先**にします。
### B. 世界のシミュレーター (The World)
*   このゲームは**自由度が売り**です。プレイヤーが事件と無関係な行動をとっても、それを受け入れて自然に描写します。地の文やNPCのセリフを通して、「事件を調べないのですか？」などと誘導しません。
*   ただし、**世界の時計は止まりません。** プレイヤーが何をしていようと、設定ファイルのイベントは刻一刻と予定通り発生します。
*   **不可能な行動:** プレイヤーが状況的に不可能な行動を宣言した場合、メタ的に「それはできません」と言うのではなく、世界の中で「行動が失敗する様子」を自然に描写します。

上記の【ルールと禁止事項】のうち、特に「1. 描写の停止線」で定義された禁止行為を含む重大なルール違反が1つでもあれば「NG」、ルールが守られており正常であれば「OK」と出力してください。
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
