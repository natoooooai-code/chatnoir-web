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
            "description": "事前に状況を整理し、どこまで描写して止めるか、主人公の行動を代行していないか思考する。" 
          },
          "scene_blocks": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "type": { "type": "string", "enum": ["narrative", "dialogue"] },
                "speaker_true_name": { "type": "string", "description": "dialogueの場合のみ。発言者の本当の名前を設定。" },
                "is_name_known_to_player": { "type": "boolean", "description": "dialogueの場合のみ。この時点で主人公（プレイヤー）がこの人物の本名をすでに知っているか（劇中で明かされたか）。" },
                "speaker_display_name": { "type": "string", "description": "dialogueの場合のみ。上記がtrueなら本名を、falseなら『黒服の男』などの外見的特徴を設定する。" },
                "text": { "type": "string", "description": "地の文、またはセリフの内容。地の文には主人公の心情・感情を含めないこと。※セリフの場合はカギ括弧「」を含めずに中身だけを記述すること。" }
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

      while (attempt < maxAttempts) {
        attempt++;

        // 構造化JSON出力でモデルを呼び出し
        let response = await fetchWithRetry(() => ai.models.generateContent({
          model: requestedModel,
          contents: messages,
          config: {
            systemInstruction: retryInstruction,
            temperature: 0.7,
            responseMimeType: "application/json",
            responseSchema: responseSchema as any
          }
        }));

        let gmData;
        try {
          gmData = JSON.parse(response.text || '{}');
        } catch (e) {
          console.error("JSON parse error:", response.text);
          responseText = response.text || '';
          break; // パース失敗時はそのまま現状を画面に返す
        }

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

        // --- スリム化された「乗っ取り特化」の事後検知（バリデーター） ---
        const validationPrompt = `あなたはTRPGの厳格なシステム判定器です。
以下の【前提知識】を理解した上で、【プレイヤーの直前の宣言】に対する【今回のGMの地の文】に違反がないかチェックしてください。

【前提知識】
1. このゲームは「一人称（私、僕、俺など）」視点のテキストアドベンチャーです。
2. 「プレイヤー ＝ 主人公 ＝ 一人称」です。それ以外の固有名称（名前）を持つ人物はすべてNPCです。
3. NPCが自発的に行動したり喋ったりすることは正常な動作です（違反ではありません）。

【判定基準】
NPCの行動ではなく、「一人称である主人公（プレイヤー）」の思考・感情（「私は～と思った」）・行動（「私は～へ向かった」）・あるいは主人公の【発言】を、GMが勝手に代行・描写してしまっていたら NG。
プレイヤーの指定の範囲内での行動結果や、周囲の情景・NPCの反応・セリフのみを描写していれば OK。

【プレイヤーの直前の宣言】
${lastUserMessage}

【今回のGMの描写テキスト全体】
${finalMarkdown}

違反がある場合は「NG: [具体的な理由]」と出力し、問題なければ「OK」とだけ出力しなさい。`;

        const validatorResponse = await fetchWithRetry(() => ai.models.generateContent({
          model: 'gemini-3.1-flash-lite-preview',
          contents: [{ role: 'user', parts: [{ text: validationPrompt }] }],
          config: { temperature: 0.1 }
        }));

        const validatorText = validatorResponse.text || '';
        isNG = validatorText.includes('NG');

        if (isNG && attempt < maxAttempts) {
          const reasonMatch = validatorText.match(/NG:?\s*\[?(.+?)\]?/);
          const reason = reasonMatch ? reasonMatch[1] : validatorText.replace('NG', '').trim();
          
          console.warn("🚨 GMの暴走（主人公の乗っ取り）を検知しました。");
          console.warn(`🛑 違反内容: ${reason || '詳細不明'}`);
          console.log("▼ 暴走と判定されたテキスト:\n", finalMarkdown);
          console.warn("自動修復（再生成）を実行します...");

          // リトライ時は重要警告を追加した上で再度システムを呼ぶ
          retryInstruction = systemInstruction + `\n\n【システムからの超重要警告】\nあなたの直前の出力は、以下の重大なルール違反を起こしました：\n「${reason}」\n主人公（プレイヤー）の思考・感情・行動を勝手に代行することは絶対禁止です！今回は必ず違反を繰り返さないように出力してください。`;
        } else {
          // 問題なし、または最大リトライ到達でループを抜ける
          break;
        }
      }
    } else {
      // 特殊コマンドや感想戦の場合はプレーンなテキスト生成（従来通り）
      let response = await fetchWithRetry(() => ai.models.generateContent({
        model: requestedModel,
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
