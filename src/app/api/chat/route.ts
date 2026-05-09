import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { getValidationPrompt } from './validatorPrompt';

type UnknownRecord = Record<string, unknown>;

interface ChatMessagePart {
  text?: string;
}

interface ChatMessage {
  role?: string;
  parts?: ChatMessagePart[];
}

interface ScenarioMeta {
  protagonistName?: string;
  protagonistFirstPerson?: string;
}

interface SupportPayload {
  reply?: string;
  action?: string;
  suggestions?: string[];
}

interface GmSceneBlock {
  type?: string;
  speaker_true_name?: string;
  is_name_known_to_player?: boolean;
  speaker_display_name?: string;
  text?: string;
}

interface GmPayload {
  thought_process?: string;
  scene_blocks: GmSceneBlock[];
  location?: string;
  time?: string;
}

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null;

const getString = (record: UnknownRecord, key: string): string | undefined => {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error['message'] === 'string') return error['message'];
  return 'Internal Server Error';
};

const isRetriableError = (error: unknown) => {
  const message = getErrorMessage(error);
  return message.includes('500')
    || message.includes('INTERNAL')
    || message.includes('503')
    || message.includes('429')
    || message.includes('UNAVAILABLE')
    || message.includes('TIMEOUT')
    || message.includes('timeout')
    || message.includes('fetch failed');
};

const normalizeMessages = (rawMessages: unknown): ChatMessage[] => {
  if (!Array.isArray(rawMessages)) return [];

  return rawMessages
    .filter((message): message is UnknownRecord => isRecord(message))
    .map((message) => ({
      role: getString(message, 'role'),
      parts: Array.isArray(message['parts'])
        ? message['parts']
            .filter((part): part is UnknownRecord => isRecord(part))
            .map((part) => ({ text: getString(part, 'text') }))
        : []
    }));
};

const normalizeScenarioMeta = (rawScenarioMeta: unknown): ScenarioMeta => {
  if (!isRecord(rawScenarioMeta)) return {};

  return {
    protagonistName: getString(rawScenarioMeta, 'protagonistName'),
    protagonistFirstPerson: getString(rawScenarioMeta, 'protagonistFirstPerson')
  };
};

const normalizeSupportPayload = (rawPayload: unknown): SupportPayload => {
  if (!isRecord(rawPayload)) return {};

  const rawSuggestions = rawPayload['suggestions'];
  return {
    reply: getString(rawPayload, 'reply'),
    action: getString(rawPayload, 'action'),
    suggestions: Array.isArray(rawSuggestions)
      ? rawSuggestions.filter((suggestion): suggestion is string => typeof suggestion === 'string')
      : undefined
  };
};

const normalizeGmSceneBlock = (rawBlock: unknown): GmSceneBlock | null => {
  if (!isRecord(rawBlock)) return null;

  return {
    type: getString(rawBlock, 'type'),
    speaker_true_name: getString(rawBlock, 'speaker_true_name'),
    is_name_known_to_player: typeof rawBlock['is_name_known_to_player'] === 'boolean' ? rawBlock['is_name_known_to_player'] : undefined,
    speaker_display_name: getString(rawBlock, 'speaker_display_name'),
    text: getString(rawBlock, 'text')
  };
};

const normalizeGmPayload = (rawPayload: unknown): GmPayload => {
  if (!isRecord(rawPayload)) {
    return { scene_blocks: [] };
  }

  const rawBlocks = rawPayload['scene_blocks'];
  return {
    thought_process: getString(rawPayload, 'thought_process'),
    scene_blocks: Array.isArray(rawBlocks)
      ? rawBlocks
          .map((block) => normalizeGmSceneBlock(block))
          .filter((block): block is GmSceneBlock => Boolean(block))
      : [],
    location: getString(rawPayload, 'location'),
    time: getString(rawPayload, 'time')
  };
};
// フォールバックチェーン（性能が高い順）
const FALLBACK_CHAIN = [
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
  'gemini-3.1-flash-lite-preview',
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as unknown;
    if (!isRecord(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const apiKey = getString(body, 'apiKey');
    const messages = normalizeMessages(body['messages']);
    const systemInstruction = getString(body, 'systemInstruction');
    const model = getString(body, 'model');
    const isReviewMode = body['isReviewMode'] === true;
    const fallbackEnabled = body['fallbackEnabled'] === true;
    const scenarioMeta = normalizeScenarioMeta(body['scenarioMeta']);
    const assistantMode = getString(body, 'assistantMode');

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
    const fetchWithRetry = async <T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> => {
      let lastError: unknown;
      for (let i = 0; i < maxRetries; i++) {
        try {
          // 60秒のタイムアウトを設定
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT: AI response took too long')), 60000)
          );
          return await Promise.race([fn(), timeoutPromise]);
        } catch (error: unknown) {
          lastError = error;
          // 429 (Rate Limit) / 500 (Internal) / 503 (Overloaded) / Timeout / fetch failed はリトライ対象
          if (isRetriableError(error) && i < maxRetries - 1) {
            const waitTime = Math.pow(2, i) * 1000 + Math.random() * 500;
            console.warn(`[Gemini API] 負荷過多または制限を検知 (${i + 1}/${maxRetries})。${waitTime}ms 後に再試行します...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          throw error;
        }
      }
      throw lastError instanceof Error ? lastError : new Error('Request failed');
    };

    // フォールバック付きのモデル生成ラッパー
    const generateWithFallback = async <T>(fn: (model: string) => Promise<T>, overrideModelsToTry?: string[]): Promise<{ result: T, usedModel: string }> => {
      let lastError: unknown;
      const models = overrideModelsToTry || modelsToTry;
      for (const m of models) {
        try {
          const result = await fetchWithRetry(() => fn(m));
          if (m !== requestedModel && (!overrideModelsToTry || overrideModelsToTry[0] !== m)) {
            console.info(`✅ [フォールバック成功] ${overrideModelsToTry ? overrideModelsToTry[0] : requestedModel} → ${m}`);
          }
          return { result, usedModel: m };
        } catch (error: unknown) {
          if (isRetriableError(error) && !!fallbackEnabled) {
            console.warn(`[Fallback] ${m} が利用不可。次のモデルを試みます...`);
            lastError = error;
            continue;
          }
          throw error;
        }
      }
      throw lastError instanceof Error ? lastError : new Error('Fallback failed');
    };

    // 【1回目】通常の文章生成
    let responseText = '';

    if (assistantMode === 'support') {
      const supportSchema = {
        type: 'object',
        properties: {
          reply: {
            type: 'string',
            description: 'プレイヤーへの助言本文。親しみはありつつ簡潔にまとめる。デバッグ用途では入力理由の説明を書く。'
          },
          action: {
            type: 'string',
            description: '実際に送る入力文。デバッグ用途などで必要なときに1件だけ返す。不要な場合は空文字でもよい。小説の続きを書くような地の文・行動描写のスタイルで書くこと（「〜する」という動詞だけの概要は不可）。セリフ（主人公の発言）のみ「」で囲む。行動・探索など非セリフは「」を絶対に付けない。必ず「現在の主人公の場所から直接できる行動」のみを提案すること。現在地に行くための移動が必要な行動（例：外にいるのに自室での行動）は絶対に含めないこと。'
          },
          suggestions: {
            type: 'array',
            description: '本編入力欄にそのまま入れて使える入力文を0件から3件。小説の続きを書くような地の文・行動描写のスタイルで書くこと（「〜する」という動詞だけの概要は不可）。セリフ（主人公の発言）のみ「」で囲む。行動・探索など非セリフは「」を絶対に付けない。必ず「現在の主人公の場所から直接できる行動」のみを提案すること。現在地に行くための移動が必要な行動（例：外にいるのに自室での行動）は絶対に含めないこと。',
            items: {
              type: 'string'
            }
          }
        },
        required: ['reply', 'action']
      };

      const { result: response } = await generateWithFallback((m) => ai.models.generateContent({
        model: m,
        contents: messages,
        config: {
          systemInstruction: systemInstruction || 'あなたはプレイヤー支援AIです。',
          temperature: 0.6,
          responseMimeType: 'application/json',
          responseSchema: supportSchema,
        }
      }));

      let supportPayload: SupportPayload = {};
      try {
        supportPayload = normalizeSupportPayload(JSON.parse(response.text || '{}') as unknown);
      } catch (error) {
        console.error('Support JSON parse error:', response.text, error);
      }

      return NextResponse.json({
        text: supportPayload.reply || response.text || '',
        action: supportPayload.action || '',
        suggestions: Array.isArray(supportPayload.suggestions) ? supportPayload.suggestions.slice(0, 3) : []
      });
    }

    if (assistantMode === 'gm') {
      const { result: response } = await generateWithFallback((m) => ai.models.generateContent({
        model: m,
        contents: messages,
        config: {
          systemInstruction: systemInstruction || 'あなたはミステリーのゲームマスターです。プレイヤーからのメタな質問に簡潔に答えてください。',
          temperature: 0.4,
        }
      }));

      return NextResponse.json({ text: response.text || '' });
    }

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
                "is_name_known_to_player": { "type": "boolean", "description": "dialogueの場合のみ。この時点で主人公（プレイヤー）がこの人物の本名をすでに知っているか。劇中で明かされた場合だけでなく、家族・同居人など主人公が開始時点から当然知っている人物なら true にしてよい。" },
                "speaker_display_name": { "type": "string", "description": "dialogueの場合のみ。上記がtrueなら本名を設定する。falseなら主人公がその時点で知っている呼称・続柄・役職・通称を優先し、それも無い場合のみ『黒服の男』などの外見的特徴を設定する。" },
                "text": { "type": "string", "description": "地の文、またはセリフの内容。※プレイヤーの宣言内容を繰り返したり、要約して書き始めたりしないこと。即座に「その行動の結果」や「周囲の反応」から描写を開始せよ。また、地の文には主人公の感情や、プレイヤーが入力していない行動の事後捏造を含めないこと。" }
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
            responseSchema
          }
        }));
        console.log(`✅ [AI生成完了] 処理時間: ${Math.round((Date.now() - t1) / 1000)}秒`);

        let gmData: GmPayload;
        try {
          gmData = normalizeGmPayload(JSON.parse(response.text || '{}') as unknown);
        } catch {
          console.error("JSON parse error:", response.text);
          responseText = response.text || '';
          break; // パース失敗時はそのまま現状を画面に返す
        }

        let finalMarkdown = '';

        // --- プリチェック（キーワード検索による高速判定） ---
        const firstPersonList = [
          '俺', 'おれ', 'オレ',
          '私', 'わたし', 'ワタシ', 'わたくし', 'あたくし',
          '僕', 'ぼく', 'ボク',
          'あたし', 'アタシ',
          '自分', '己', 'うち'
        ];
        const protagonistKeywords = [
          ...(scenarioMeta.protagonistName ? [scenarioMeta.protagonistName, scenarioMeta.protagonistName.replace(/\s+/g, '')] : []),
          ...(scenarioMeta.protagonistFirstPerson ? [scenarioMeta.protagonistFirstPerson] : []),
          ...firstPersonList
        ];

        let needsAiValidation = false;
        let matchedKeyword = '';
        let matchedText = '';
        const blocks = gmData.scene_blocks;

        for (const block of blocks) {
          if (block.type === 'narrative') {
            const blockText = block.text || '';
            // キーワードが「主語（は・が・も）」として使われているか、または単体で存在するかを正規表現でチェック
            const found = protagonistKeywords.find(k => {
              // キーワードの直後に「は」「が」「も」が来るか、句読点や文末が来るパターン
              const regex = new RegExp(`${k}(?:は|が|も|[、。！？」\\s]|$)`);
              return regex.test(blockText);
            });
            if (found) {
              needsAiValidation = true;
              matchedKeyword = found;
              matchedText = blockText;
              break;
            }
          } else if (block.type === 'dialogue') {
            const speaker = (block.speaker_true_name || block.speaker_display_name || '').replace(/\s+/g, '');
            const pName = (scenarioMeta.protagonistName || '').replace(/\s+/g, '');
            if (pName && (speaker.includes(pName) || speaker === pName)) {
              needsAiValidation = true;
              matchedKeyword = `発話者名: ${speaker}`;
              matchedText = `「${block.text}」`;
              break;
            }
          }
        }

        if (needsAiValidation) {
          console.log(`🔎 [バリデーター起動] キーワード「${matchedKeyword}」を検知。対象: ${matchedText}`);
          const validationPrompt = getValidationPrompt(lastUserMessage, JSON.stringify(gmData.scene_blocks), scenarioMeta);
          const t2 = Date.now();
          const { result: validatorResponse } = await generateWithFallback((m) => ai.models.generateContent({
            model: m,
            contents: [{ role: 'user', parts: [{ text: validationPrompt }] }],
            config: { temperature: 0.1 }
          }), modelsToTry);
          console.log(`✅ [バリデーター完了] 処理時間: ${Math.round((Date.now() - t2) / 1000)}秒`);

          const validatorText = validatorResponse.text || '';
          isNG = validatorText.includes('NG');

          if (isNG && attempt < maxAttempts) {
            let reason = validatorText.includes('NG:') ? validatorText.split('NG:')[1] : validatorText.replace('NG', '');
            reason = reason.replace(/^[\[\s]+/, '').replace(/[\]\s]+$/, '');
            console.warn(`🚨 暴走検知: ${reason}`);
            retryInstruction = systemInstruction + `\n\n【重要：前回の出力が却下された理由】\n${reason}\n\n上記を改善し、主人公を操作せず再描写してください。`;
            continue;
          }
        } else {
          console.log(`✨ [バリデーター省略] 安全と判断されました。`);
          isNG = false;
        }

        // JSONのブロック配列をマークダウンフォーマットに結合
        if (gmData.scene_blocks && Array.isArray(gmData.scene_blocks)) {
          finalMarkdown = gmData.scene_blocks.map((block) => {
            if (block.type === 'dialogue') {
              let speaker = block.speaker_display_name || block.speaker_true_name || '';
              let dialogueText = block.text || '';

              // テキスト内に「名前「セリフ」」形式が含まれる場合、名前とセリフを分離
              if (!speaker) {
                const nameMatch = dialogueText.match(/^([^「」\s]{1,20})[\s]*「/);
                if (nameMatch) {
                  speaker = nameMatch[1];
                  dialogueText = dialogueText.slice(nameMatch[0].length - 1); // 「を残す
                }
              }
              if (!speaker) speaker = '不明';

              // セリフ本文のクリーンアップ（括弧・句読点の残骸を除去）
              dialogueText = dialogueText
                .replace(/^[\s「]+/, '')       // 先頭の空白・「を除去
                .replace(/[」，、。\s]+$/, '')  // 末尾の」，、。・空白を除去
                .replace(/。$/, '');            // 最後の句点を除去

              return `**${speaker}**「${dialogueText}」`;
            } else {
              return block.text;
            }
          }).join('\n\n');
        }

        // ステータスバー行の自動追加
        if (gmData.location && gmData.time) {
          const formattedTime = (gmData.time || '').replace(/:/g, '：');
          finalMarkdown += `\n\n📍 [${gmData.location}] 🕐 [${formattedTime}]`;
        }

        responseText = finalMarkdown;

        // 1回目の出力を保存（フォールバック用）
        if (attempt === 1) firstText = finalMarkdown;

        // バリデーションを通過した、または最大リトライ到達
        if (isNG && attempt >= maxAttempts && firstText) {
          console.warn("⚠️ 2回目もNGのため、1回目の出力を採用します。");
          responseText = firstText;
        }
        break;
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
  } catch (error: unknown) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
