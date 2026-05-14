import { GoogleGenAI } from '@google/genai';
import { getValidationPrompt } from '@/lib/validatorPrompt';

type UnknownRecord = Record<string, unknown>;

export interface GeminiChatMessagePart {
  text?: string;
}

export interface GeminiChatMessage {
  role?: string;
  parts?: GeminiChatMessagePart[];
}

export interface GeminiScenarioMeta {
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

export interface GeminiChatRequest {
  apiKey: string;
  model?: string | null;
  messages: GeminiChatMessage[];
  systemInstruction?: string;
  isReviewMode?: boolean;
  fallbackEnabled?: boolean;
  scenarioMeta?: GeminiScenarioMeta;
  assistantMode?: 'support' | 'gm';
  abortSignal?: AbortSignal;
}

export interface GeminiChatResponse {
  text: string;
  hasSpeakerWarning?: boolean;
  action?: string;
  suggestions?: string[];
}

export interface GeminiAvatarPromptRequest {
  apiKey: string;
  characterName: string;
  systemInstruction?: string;
  messages?: GeminiChatMessage[];
  abortSignal?: AbortSignal;
}

export interface GeminiAvatarPromptResponse {
  prompt: string;
}

export interface ApiLikeResponse<T> {
  ok: boolean;
  json: () => Promise<any>;
}

const FALLBACK_CHAIN = [
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
  'gemini-3.1-flash-lite',
];

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null;

const getString = (record: UnknownRecord, key: string): string | undefined => {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return 'Internal Server Error';
};

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) return error.name === 'AbortError';
  return error instanceof Error && error.name === 'AbortError';
};

const createAbortError = () => new DOMException('The operation was aborted.', 'AbortError');

const withAbort = async <T>(promise: Promise<T>, abortSignal?: AbortSignal): Promise<T> => {
  if (!abortSignal) return promise;
  if (abortSignal.aborted) throw createAbortError();

  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(createAbortError());
    abortSignal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (value) => {
        abortSignal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        abortSignal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
};

const waitFor = async (ms: number, abortSignal?: AbortSignal): Promise<void> => {
  if (!abortSignal) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return;
  }
  if (abortSignal.aborted) throw createAbortError();

  await new Promise<void>((resolve, reject) => {
    const timerId = setTimeout(() => {
      abortSignal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timerId);
      reject(createAbortError());
    };

    abortSignal.addEventListener('abort', onAbort, { once: true });
  });
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, abortSignal?: AbortSignal): Promise<T> => {
  return await withAbort(
    new Promise<T>((resolve, reject) => {
      const timerId = setTimeout(() => reject(new Error('TIMEOUT: AI response took too long')), timeoutMs);
      promise.then(
        (value) => {
          clearTimeout(timerId);
          resolve(value);
        },
        (error) => {
          clearTimeout(timerId);
          reject(error);
        }
      );
    }),
    abortSignal,
  );
};

const normalizeModelName = (model: string | null | undefined): string => {
  if (model === 'gemini-3.1-flash-lite-preview') {
    return 'gemini-3.1-flash-lite';
  }
  return model || 'gemini-3.1-flash-lite';
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

const normalizeMessages = (rawMessages: unknown): GeminiChatMessage[] => {
  if (!Array.isArray(rawMessages)) return [];

  return rawMessages
    .filter((message): message is UnknownRecord => isRecord(message))
    .map((message) => ({
      role: getString(message, 'role'),
      parts: Array.isArray(message.parts)
        ? message.parts
            .filter((part): part is UnknownRecord => isRecord(part))
            .map((part) => ({ text: getString(part, 'text') }))
        : []
    }));
};

const normalizeScenarioMeta = (rawScenarioMeta: unknown): GeminiScenarioMeta => {
  if (!isRecord(rawScenarioMeta)) return {};

  return {
    protagonistName: getString(rawScenarioMeta, 'protagonistName'),
    protagonistFirstPerson: getString(rawScenarioMeta, 'protagonistFirstPerson')
  };
};

const normalizeSupportPayload = (rawPayload: unknown): SupportPayload => {
  if (!isRecord(rawPayload)) return {};

  const rawSuggestions = rawPayload.suggestions;
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
    is_name_known_to_player: typeof rawBlock.is_name_known_to_player === 'boolean' ? rawBlock.is_name_known_to_player : undefined,
    speaker_display_name: getString(rawBlock, 'speaker_display_name'),
    text: getString(rawBlock, 'text')
  };
};

const normalizeGmPayload = (rawPayload: unknown): GmPayload => {
  if (!isRecord(rawPayload)) {
    return { scene_blocks: [] };
  }

  const rawBlocks = rawPayload.scene_blocks;
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

const fetchWithRetry = async <T>(fn: () => Promise<T>, abortSignal?: AbortSignal, maxRetries = 3): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await withTimeout(fn(), 60000, abortSignal);
    } catch (error: unknown) {
      lastError = error;
      if (isAbortError(error)) throw error;
      if (isRetriableError(error) && attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`[Gemini API] 負荷過多または制限を検知 (${attempt + 1}/${maxRetries})。${waitTime}ms 後に再試行します...`);
        await waitFor(waitTime, abortSignal);
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed');
};

const createChatGenerator = (ai: GoogleGenAI, requestedModel: string, fallbackEnabled: boolean, abortSignal?: AbortSignal) => {
  const getModelsToTry = (selected: string, enableFallback: boolean): string[] => {
    if (!enableFallback) return [selected];
    const index = FALLBACK_CHAIN.indexOf(selected);
    if (index === -1) return [selected, ...FALLBACK_CHAIN];
    return [...FALLBACK_CHAIN.slice(index), ...FALLBACK_CHAIN.slice(0, index)];
  };

  const modelsToTry = getModelsToTry(requestedModel, fallbackEnabled);

  const generateWithFallback = async <T>(
    fn: (model: string) => Promise<T>,
    overrideModelsToTry?: string[],
  ): Promise<{ result: T; usedModel: string }> => {
    let lastError: unknown;
    const models = overrideModelsToTry || modelsToTry;

    for (const model of models) {
      try {
        const result = await fetchWithRetry(() => fn(model), abortSignal);
        if (model !== requestedModel && (!overrideModelsToTry || overrideModelsToTry[0] !== model)) {
          console.info(`✅ [フォールバック成功] ${overrideModelsToTry ? overrideModelsToTry[0] : requestedModel} → ${model}`);
        }
        return { result, usedModel: model };
      } catch (error: unknown) {
        if (isAbortError(error)) throw error;
        if (isRetriableError(error) && fallbackEnabled) {
          console.warn(`[Fallback] ${model} が利用不可。次のモデルを試みます...`);
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Fallback failed');
  };

  return { generateWithFallback, modelsToTry };
};

const generateChatResponse = async (request: GeminiChatRequest): Promise<GeminiChatResponse> => {
  const messages = normalizeMessages(request.messages);
  const scenarioMeta = normalizeScenarioMeta(request.scenarioMeta);

  if (!request.apiKey) {
    throw new Error('API key is required');
  }

  const lastUserMessage = messages[messages.length - 1]?.parts?.[0]?.text || '';
  const isSystemCommand = lastUserMessage.startsWith('（システムコマンド：');
  const ai = new GoogleGenAI({ apiKey: request.apiKey });
  const requestedModel = normalizeModelName(request.model);
  const { generateWithFallback, modelsToTry } = createChatGenerator(ai, requestedModel, request.fallbackEnabled === true, request.abortSignal);

  if (request.assistantMode === 'support') {
    const supportSchema = {
      type: 'object',
      properties: {
        reply: {
          type: 'string',
          description: 'プレイヤーへの助言本文。親しみはありつつ簡潔にまとめる。デバッグ用途では入力理由の説明を書く。'
        },
        action: {
          type: 'string',
          description: '実際に送る入力文。デバッグ用途などで必要なときに1件だけ返す。不要な場合は空文字でもよい。小説本文としてそのまま差し込める1〜2文の完成文にすること。小説の続きを書くようなスタイルで書き、「〜する」だけの概要文は不可。助言口調や解説口調は禁止。セリフ（主人公の発言）のみ「」で囲む。行動・探索など非セリフは「」を絶対に付けない。必ず「現在の主人公の場所から直接できる行動」のみを提案すること。現在地に行くための移動が必要な行動（例：外にいるのに自室での行動）は絶対に含めないこと。'
        },
        suggestions: {
          type: 'array',
          description: '本編入力欄にそのまま入れて使える入力文を0件から3件。各候補は小説本文としてそのまま差し込める1〜2文の完成文にすること。小説の続きを書くようなスタイルで書き、「〜する」だけの概要文は不可。助言口調や解説口調は禁止。セリフ（主人公の発言）のみ「」で囲む。行動・探索など非セリフは「」を絶対に付けない。必ず「現在の主人公の場所から直接できる行動」のみを提案すること。現在地に行くための移動が必要な行動（例：外にいるのに自室での行動）は絶対に含めないこと。',
          items: {
            type: 'string'
          }
        }
      },
      required: ['reply', 'action']
    };

    const { result: response } = await generateWithFallback((model) => withAbort(ai.models.generateContent({
      model,
      contents: messages,
      config: {
        systemInstruction: request.systemInstruction || 'あなたはプレイヤー支援AIです。',
        temperature: 0.6,
        responseMimeType: 'application/json',
        responseSchema: supportSchema,
      }
    }), request.abortSignal));

    let supportPayload: SupportPayload = {};
    try {
      let rawText = (response.text || '').trim();
      const fenceMatch = rawText.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
      if (fenceMatch) {
        rawText = fenceMatch[1].trim();
      } else {
        rawText = rawText.replace(/\n?```\s*$/, '').trim();
      }
      if (!rawText.startsWith('{')) {
        const jsonStart = rawText.indexOf('{');
        const jsonEnd = rawText.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) rawText = rawText.slice(jsonStart, jsonEnd + 1);
      }
      supportPayload = normalizeSupportPayload(JSON.parse(rawText) as unknown);
    } catch (error) {
      console.error('Support JSON parse error:', response.text, error);
    }

    return {
      text: supportPayload.reply || '',
      action: supportPayload.action || '',
      suggestions: Array.isArray(supportPayload.suggestions) ? supportPayload.suggestions.slice(0, 3) : []
    };
  }

  if (request.assistantMode === 'gm') {
    const { result: response } = await generateWithFallback((model) => withAbort(ai.models.generateContent({
      model,
      contents: messages,
      config: {
        systemInstruction: request.systemInstruction || 'あなたはミステリーのゲームマスターです。プレイヤーからのメタな質問に簡潔に答えてください。',
        temperature: 0.4,
      }
    }), request.abortSignal));

    return { text: response.text || '' };
  }

  if (!isSystemCommand && !request.isReviewMode) {
    let responseText = '';
    let hasUnknownSpeaker = false;
    let isNG = false;
    let attempt = 0;
    const maxAttempts = 2;
    let retryInstruction = request.systemInstruction || 'あなたはミステリーのゲームマスターです。';

    const responseSchema = {
      type: 'object',
      properties: {
        thought_process: {
          type: 'string',
          description: '事前に状況を整理し、どこまで描写して止めるか思考する。非常に簡潔に、最大2文程度の極めて短文で行うこと。'
        },
        scene_blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['narrative', 'dialogue'] },
              speaker_true_name: { type: 'string', description: 'dialogueの場合のみ。発言者の本当の名前を設定。※絶対に主人公（プレイヤー）のセリフを生成してはいけない。必ずNPCの名前になるはずである。' },
              is_name_known_to_player: { type: 'boolean', description: 'dialogueの場合のみ。この時点で主人公（プレイヤー）がこの人物の本名をすでに知っているか。劇中で明かされた場合だけでなく、家族・同居人など主人公が開始時点から当然知っている人物なら true にしてよい。' },
              speaker_display_name: { type: 'string', description: 'dialogueの場合のみ。上記がtrueなら本名を設定する。falseなら主人公がその時点で知っている呼称・続柄・役職・通称を優先し、それも無い場合のみ「黒服の男」などの外見的特徴を設定する。' },
              text: { type: 'string', description: '地の文、またはセリフの内容。※プレイヤーの宣言内容を繰り返したり、要約して書き始めたりしないこと。即座に「その行動の結果」や「周囲の反応」から描写を開始せよ。また、地の文には主人公の感情や、プレイヤーが入力していない行動の事後捏造を含めないこと。' }
            },
            required: ['type', 'text']
          },
          description: '地の文(narrative)とセリフ(dialogue)を時系列順に並べたブロック配列'
        },
        location: { type: 'string', description: '現在のロケーション' },
        time: { type: 'string', description: '現在の（ゲーム内）時刻' }
      },
      required: ['thought_process', 'scene_blocks', 'location', 'time']
    };

    let firstText = '';

    while (attempt < maxAttempts) {
      attempt++;

      console.log(`\n⏳ [AI生成開始] Attempt: ${attempt}`);
      const startedAt = Date.now();
      const { result: response } = await generateWithFallback((model) => withAbort(ai.models.generateContent({
        model,
        contents: messages,
        config: {
          systemInstruction: retryInstruction,
          temperature: 0.7,
          responseMimeType: 'application/json',
          responseSchema,
        }
      }), request.abortSignal));
      console.log(`✅ [AI生成完了] 処理時間: ${Math.round((Date.now() - startedAt) / 1000)}秒`);

      let gmData: GmPayload;
      try {
        gmData = normalizeGmPayload(JSON.parse(response.text || '{}') as unknown);
      } catch {
        console.error('JSON parse error:', response.text);
        responseText = response.text || '';
        break;
      }

      let finalMarkdown = '';
      const firstPersonList = ['俺', 'おれ', 'オレ', '私', 'わたし', 'ワタシ', 'わたくし', 'あたくし', '僕', 'ぼく', 'ボク', 'あたし', 'アタシ'];
      const protagonistSpeakerAliases = ['主人公', 'あなた', 'プレイヤー', '自分'];
      const protagonistKeywords = [
        ...(scenarioMeta.protagonistName ? [scenarioMeta.protagonistName, scenarioMeta.protagonistName.replace(/\s+/g, '')] : []),
        ...(scenarioMeta.protagonistFirstPerson ? [scenarioMeta.protagonistFirstPerson] : []),
        ...firstPersonList
      ];

      let needsAiValidation = false;
      let matchedKeyword = '';
      let matchedText = '';

      for (const block of gmData.scene_blocks) {
        if (block.type === 'narrative') {
          const blockText = block.text || '';
          const found = protagonistKeywords.find((keyword) => {
            const regex = new RegExp(`${keyword}(?:は|が|も|[、。！？？」\\s]|$)`);
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
          const protagonistName = (scenarioMeta.protagonistName || '').replace(/\s+/g, '');
          const isSuspiciousDialogue = !speaker
            || protagonistSpeakerAliases.includes(speaker)
            || (protagonistName ? speaker.includes(protagonistName) || speaker === protagonistName : false);

          if (isSuspiciousDialogue) {
            needsAiValidation = true;
            matchedKeyword = !speaker ? '発話者不明のセリフ' : `発話者名: ${speaker}`;
            matchedText = `「${block.text}」`;
            break;
          }
        }
      }

      if (needsAiValidation) {
        console.log(`🔎 [バリデーター起動] キーワード「${matchedKeyword}」を検知。対象: ${matchedText}`);
        const validationPrompt = getValidationPrompt(lastUserMessage, JSON.stringify(gmData.scene_blocks), scenarioMeta);
        const startedAtValidator = Date.now();
        const { result: validatorResponse } = await generateWithFallback((model) => withAbort(ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: validationPrompt }] }],
          config: { temperature: 0.1 }
        }), request.abortSignal), modelsToTry);
        console.log(`✅ [バリデーター完了] 処理時間: ${Math.round((Date.now() - startedAtValidator) / 1000)}秒`);

        const validatorText = validatorResponse.text || '';
        isNG = validatorText.includes('NG');

        if (isNG && attempt < maxAttempts) {
          let reason = validatorText.includes('NG:') ? validatorText.split('NG:')[1] : validatorText.replace('NG', '');
          reason = reason.replace(/^[\[\s]+/, '').replace(/[\]\s]+$/, '');
          console.warn(`🚨 暴走検知: ${reason}`);
          retryInstruction = `${request.systemInstruction || 'あなたはミステリーのゲームマスターです。'}\n\n【重要：前回の出力が却下された理由】\n${reason}\n\n上記を改善し、主人公を操作せず再描写してください。`;
          continue;
        }
      } else {
        console.log('✨ [バリデーター省略] 安全と判断されました。');
        isNG = false;
      }

      if (gmData.scene_blocks && Array.isArray(gmData.scene_blocks)) {
        finalMarkdown = gmData.scene_blocks.map((block) => {
          if (block.type === 'dialogue') {
            let speaker = block.speaker_display_name || block.speaker_true_name || '';
            let dialogueText = block.text || '';

            if (!speaker) {
              const nameMatch = dialogueText.match(/^([^「」\s]{1,20})[\s]*「/);
              if (nameMatch) {
                speaker = nameMatch[1];
                dialogueText = dialogueText.slice(nameMatch[0].length - 1);
              }
            }
            if (!speaker) {
              speaker = '不明';
              hasUnknownSpeaker = true;
            }

            dialogueText = dialogueText
              .replace(/^[\s「]+/, '')
              .replace(/[」，、。\s]+$/, '')
              .replace(/。$/, '');

            return `**${speaker}**「${dialogueText}」`;
          }
          return block.text;
        }).join('\n\n');
      }

      if (gmData.location && gmData.time) {
        const formattedTime = (gmData.time || '').replace(/:/g, '：');
        finalMarkdown += `\n\n📍 [${gmData.location}] 🕐 [${formattedTime}]`;
      }

      responseText = finalMarkdown;
      if (attempt === 1) firstText = finalMarkdown;
      if (isNG && attempt >= maxAttempts && firstText) {
        console.warn('⚠️ 2回目もNGのため、1回目の出力を採用します。');
        responseText = firstText;
      }
      break;
    }

    return { text: responseText || '', ...(hasUnknownSpeaker ? { hasSpeakerWarning: true } : {}) };
  }

  const { result: response } = await generateWithFallback((model) => withAbort(ai.models.generateContent({
    model,
    contents: messages,
    config: {
      systemInstruction: request.systemInstruction || 'あなたはミステリーのゲームマスターです。',
      temperature: 0.7,
    }
  }), request.abortSignal));

  return { text: response.text || '' };
};

const generateAvatarPrompt = async (request: GeminiAvatarPromptRequest): Promise<GeminiAvatarPromptResponse> => {
  if (!request.apiKey || !request.characterName) {
    throw new Error('API key and characterName are required');
  }

  const ai = new GoogleGenAI({ apiKey: request.apiKey });
  const contextText = Array.isArray(request.messages)
    ? request.messages.map((message) => `${message.role === 'user' ? 'Player' : 'GM'}: ${message.parts?.[0]?.text || ''}`).join('\n')
    : '';

  const extractionPrompt = `
以下の【シナリオ設定】と【ゲーム文脈】を読み、「${request.characterName}」の外見を描写した画像生成プロンプトを日本語で1〜3文で書いてください。

含めること:
- 年齢感・性別・雰囲気（シナリオの設定通りでよい）
- 髪型・髪色・表情
- 服装
- バストアップ、正面向き
- アニメ調イラスト、シンプルな明るいグレーの背景、高精細

例: 20代後半の女性。茶色のロングヘアで、明るく元気な笑顔。セーラー服を着ている。バストアップ、正面向き。アニメ調イラスト、シンプルな明るいグレーの背景、高精細。

情報が少ない場合は名前・役割から外見を創作して補うこと。出力はプロンプトのみ（説明不要）。未成年のキャラクターの場合、年齢に関する情報はプロンプトに含めないでください。

【シナリオ設定】
${request.systemInstruction}

【ゲーム文脈】
${contextText || 'なし'}
`;

  const response = await withAbort(ai.models.generateContent({
    model: 'gemma-4-31b-it',
    contents: [{ role: 'user', parts: [{ text: extractionPrompt }] }],
    config: { temperature: 0.5 }
  }), request.abortSignal);

  return {
    prompt: response.text?.trim() || '人物のバストアップ、正面向き。アニメ調イラスト、シンプルな明るいグレーの背景、高精細。'
  };
};

const toApiLikeResponse = async <T>(action: () => Promise<T>): Promise<ApiLikeResponse<T>> => {
  try {
    const data = await action();
    return {
      ok: true,
      json: async () => data,
    };
  } catch (error: unknown) {
    if (isAbortError(error)) throw error;
    const errorMessage = getErrorMessage(error);
    return {
      ok: false,
      json: async () => ({ error: errorMessage }),
    };
  }
};

export const requestChatApi = async (request: GeminiChatRequest): Promise<ApiLikeResponse<GeminiChatResponse>> => {
  return await toApiLikeResponse(() => generateChatResponse(request));
};

export const requestAvatarPromptApi = async (request: GeminiAvatarPromptRequest): Promise<ApiLikeResponse<GeminiAvatarPromptResponse>> => {
  return await toApiLikeResponse(() => generateAvatarPrompt(request));
};

export const logClientViolation = (payload: { text: string; type?: string; command?: string }) => {
  console.log('\n--- [AI 暴走/解析エラー検知] ---');
  if (payload.type === 'JSON_ERROR') {
    console.warn(`🚨 【手帳命令: ${payload.command}】 JSON解析に失敗しました。`);
  } else {
    console.warn('🚨 通常の文章生成でルール違反（暴走）を検知しました。');
  }
  console.log('▼ 受信テキスト:\n', payload.text);
  console.log('-------------------------------\n');
};