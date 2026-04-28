import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

// フォールバックチェーン（性能が高い順）
const FALLBACK_CHAIN = [
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
  'gemini-3.1-flash-lite-preview',
];

export async function POST(req: NextRequest) {
  try {
    const { apiKey, messages, systemInstruction, model, isReviewMode, fallbackEnabled } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }

    // 最後のメッセージが「裏側からの特殊JSONコマンド」かどうかを判定（バリデーションをスキップするため）
    const lastUserMessage = messages[messages.length - 1]?.parts?.[0]?.text || '';
    const isSystemCommand = lastUserMessage.startsWith('（システムコマンド：');

    const ai = new GoogleGenAI({ apiKey });
    const requestedModel = model || 'gemini-3.1-flash-lite-preview';

    // フォールバック時に試みるモデルのリストを生成
    const getModelsToTry = (selected: string, enableFallback: boolean): string[] => {
      if (!enableFallback) return [selected];
      const idx = FALLBACK_CHAIN.indexOf(selected);
      if (idx === -1) return [selected, ...FALLBACK_CHAIN];
      return [...FALLBACK_CHAIN.slice(idx), ...FALLBACK_CHAIN.slice(0, idx)];
    };
    const modelsToTry = getModelsToTry(requestedModel, !!fallbackEnabled);

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

    // フォールバック付きのモデル生成ラッパー
    const generateWithFallback = async (fn: (model: string) => Promise<any>): Promise<{ result: any, usedModel: string }> => {
      let lastError: any;
      for (const m of modelsToTry) {
        try {
          const result = await fetchWithRetry(() => fn(m));
          if (m !== requestedModel) {
            console.info(`✅ [フォールバック成功] ${requestedModel} → ${m}`);
          }
          return { result, usedModel: m };
        } catch (error: any) {
          const isRetriable = error.message?.includes('503') || error.message?.includes('429') || error.message?.includes('UNAVAILABLE');
          if (isRetriable && !!fallbackEnabled) {
            console.warn(`[Fallback] ${m} が利用不可。次のモデルを試みます...`);
            lastError = error;
            continue;
          }
          throw error;
        }
      }
      throw lastError;
    };

    // 【1回目】通常の文章生成
    let responseText = '';

    if (!isSystemCommand && !isReviewMode) {
      let isNG = false;
      let attempt = 0;
      const maxAttempts = 2; // NGだった場合は最大1回までリトライ
      let retryInstruction = systemInstruction || "あなたはミステリーのゲームマスターです。";

      // シーケンシャル・ブロックの出力スキーマ定義
      const responseSchema = {
        type: "object",
        properties: {
          "thought_process": {
            "type": "string",
            "description": "事前に状況を整理し、どこまで描写して止めるか思考する。非常に簡潔に、最大2文程度の極めて短文で行うこと。"
          },
          "scene_blocks": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "type": { "type": "string", "enum": ["narrative", "dialogue"] },
                "speaker_true_name": { "type": "string", "description": "dialogueの場合のみ。発言者の本当の名前を設定。※絶対に主人公（プレイヤー）のセリフを生成してはいけない。必ずNPCの名前になるはずである。" },
                "is_name_known_to_player": { "type": "boolean", "description": "dialogueの場合のみ。この時点で主人公（プレイヤー）がこの人物の本名をすでに知っているか（劇中で明かされたか）。" },
                "speaker_display_name": { "type": "string", "description": "dialogueの場合のみ。上記がtrueなら本名を、falseなら『黒服の男』などの外見的特徴を設定する。" },
                "text": { "type": "string", "description": "地の文、またはセリフの内容。※地の文には主人公の感情や、【私が話しかけると】【私の声に】等のようにプレイヤーが入力していない行動の事後捏造を含めないこと。" }
              },
              "required": ["type", "text"]
            },
            "description": "地の文(narrative)とセリフ(dialogue)を時系列順に並べたブロック配列"
          },
          "location": { "type": "string", "description": "現在のロケーション" },
          "time": { "type": "string", "description": "現在の（ゲーム内）時刻" }
        },
        "required": ["thought_process", "scene_blocks", "location", "time"]
      };

      let firstText = ''; // 1回目の出力を記録しておく

      while (attempt < maxAttempts) {
        attempt++;

        // 構造化JSON出力でモデルを呼び出し
        console.log(`\n⏳ [AI生成開始] Attempt: ${attempt}`);
        const t1 = Date.now();
        const { result: response } = await generateWithFallback((m) => ai.models.generateContent({
          model: m,
          contents: messages,
          config: {
            systemInstruction: retryInstruction,
            temperature: 0.7,
            responseMimeType: "application/json",
            responseSchema: responseSchema as any
          }
        }));
        console.log(`✅ [AI生成完了] 処理時間: ${Math.round((Date.now() - t1) / 1000)}秒`);

        let gmData;
        try {
          gmData = JSON.parse(response.text || '{}');
        } catch (e) {
          console.error("JSON parse error:", response.text);
          responseText = response.text || '';
          break; // パース失敗時はそのまま現状を画面に返す
        }

        let finalMarkdown = '';

        // JSONのブロック配列をマークダウンフォーマットに結合
        if (gmData.scene_blocks && Array.isArray(gmData.scene_blocks)) {
          finalMarkdown = gmData.scene_blocks.map((block: any) => {
            if (block.type === 'dialogue') {
              const speaker = block.speaker_display_name || block.speaker_name || block.speaker_true_name || '不明';
              const cleanText = block.text.replace(/^「+/, '').replace(/」+$/, '').replace(/。$/, '');
              return `**${speaker}**「${cleanText}」`;
            } else {
              return block.text;
            }
          }).join('\n\n');
        }

        // ステータスバー行の自動追加
        if (gmData.location && gmData.time) {
          finalMarkdown += `\n\n📍 [${gmData.location}] | 🕐 [${gmData.time}]`;
        }

        responseText = finalMarkdown;

        // 1回目の出力を保存（フォールバック用）
        if (attempt === 1) firstText = finalMarkdown;

        // --- スリム化された「乗っ取り特化」の事後検知（バリデーター） ---
        const validationPrompt = `あなたはTRPGの厳格なシステム判定器です。
以下の【前提知識】を理解した上で、【プレイヤーの直前の宣言】に対する【今回のGMの地の文】に違反がないかチェックしてください。

【前提知識】
1. このゲームは「一人称（私、僕、俺など）」視点のテキストアドベンチャーです。
2. 「プレイヤー ＝ 主人公 ＝ 一人称」です。それ以外の固有名称（名前）を持つ人物はすべてNPCです。
3. NPCが自発的に行動したり喋ったりすることは正常な動作です（違反ではありません）。

【判定基準】
NPCの行動ではなく、「一人称である主人公（プレイヤー）」の思考・感情（「私は～と思った」）・プレイヤーが直前の宣言で明示していない行動（「私は～へ向かった」）・あるいは主人公自身の発言（「私は～と言った」）を、GMが勝手に代行・描写してしまっていたら NG（理由とともに却下せよ）。

【NGにしない例（正常な描写）】
- NPCがプレイヤーの入力に反応して振り向く、驚く、返答するなど
- 「私の声に彼女が顔を上げた」（NPCの反応を描写しているだけ）
- プレイヤーの行動宣言の直接的な結果（「ドアを開ける」→「ドアが開いた」）

【NGにする例（主人公の乗っ取り）】
- プレイヤーが宣言していないのに「私は部屋を出た」と書く
- 「私は怒りを感じた」など主人公の感情を代行する
- プレイヤーが宣言していないセリフを主人公に言わせる（「私は『助けて』と叫んだ」）

プレイヤーが指定した範囲内の行動結果・周囲の情景・NPCの自発的な反応・NPCのセリフのみを描写して主人公にターンを返していれば OK。

【プレイヤーの直前の宣言】
${lastUserMessage}

【今回のGMの描写テキスト全体】
${finalMarkdown}

違反がある場合は「NG: [具体的な理由]」と出力し、問題なければ「OK」とだけ出力しなさい。`;

        console.log(`🔎 [バリデーター起動] 違反チェック中...`);
        const t2 = Date.now();
        const { result: validatorResponse } = await generateWithFallback((m) => ai.models.generateContent({
          model: m,
          contents: [{ role: 'user', parts: [{ text: validationPrompt }] }],
          config: { temperature: 0.1 }
        }));
        console.log(`✅ [バリデーター完了] 処理時間: ${Math.round((Date.now() - t2) / 1000)}秒`);

        const validatorText = validatorResponse.text || '';
        isNG = validatorText.includes('NG');

        if (isNG && attempt < maxAttempts) {
          // NGの理由を抽出（NG:, NG: [], などの全パターンに対応）
          let reason = validatorText.includes('NG:')
            ? validatorText.split('NG:')[1]
            : validatorText.replace('NG', '');

          // 前後の余白と不要な括弧を取り除く
          reason = reason.replace(/^[\[\s]+/, '').replace(/[\]\s]+$/, '');

          console.warn("🚨 GMの暴走（主人公の乗っ取り）を検知しました。");
          console.warn(`🛑 違反内容: ${reason || '詳細不明'}`);
          console.log("▼ 暴走と判定されたテキスト:\n", finalMarkdown);
          console.warn("自動修復（再生成）を実行します...");

          // リトライ時は重要警告を追加した上で再度システムを呼ぶ
          retryInstruction = systemInstruction + `\n\n【システムからの超重要警告】\nあなたの直前の出力は、以下の重大なルール違反を起こしました：\n「${reason}」\n主人公（プレイヤー）の思考・感情・行動を勝手に代行することは絶対禁止です！今回は必ず違反を繰り返さないように出力してください。`;
        } else {
          // 問題なし、または最大リトライ到達でループを抜ける
          // 最大リトライ到達かつまだNGの場合は1回目の出力を優先
          if (isNG && attempt >= maxAttempts && firstText) {
            console.warn("⚠️ 2回目もNGのため、1回目の出力を採用します。");
            responseText = firstText;
          }
          break;
        }
      }
    } else {
      // 特殊コマンドや感想戦の場合はプレーンなテキスト生成（従来通り）
      const { result: response } = await generateWithFallback((m) => ai.models.generateContent({
        model: m,
        contents: messages,
        config: {
          systemInstruction: systemInstruction || "あなたはミステリーのゲームマスターです。",
          temperature: 0.7,
        }
      }));
      responseText = response.text || '';
    }

    return NextResponse.json({ text: responseText || '' });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
