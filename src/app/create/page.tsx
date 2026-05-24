'use client';
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { useRouter } from 'next/navigation';
import {
  createGeminiFilePart,
  requestChatApi,
  uploadGeminiFile,
  type GeminiChatMessagePart,
} from '@/lib/geminiClient';
import {
  buildMarkdownDownloadName,
  extractScenarioTitle,
  classifyAttachmentKind,
  extractHookPreview,
  formatFileSize,
  parseScenarioBuildPackage,
  parseFinalScenarioPackage,
  replacePromptPlaceholders,
  resolvePublicAssetPath,
  sanitizeFileName,
  storePendingGeneratedScenario,
  summarizeAttachments,
  type GenerationArtifact,
  type GenerationPhaseId,
  type GenerationPhaseStatus,
  type GeneratorIdeaAttachmentKind,
  type PendingGeneratedScenarioPayload,
} from '@/lib/scenarioGeneration';
import styles from './page.module.css';

type ApiKeyStorageMode = 'session' | 'local';
type ExecutionMode = 'auto' | 'step';

type GeneratorIdeaAttachment = {
  id: string;
  file: File;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: GeneratorIdeaAttachmentKind;
};

type PromptTemplates = Record<GenerationPhaseId, string>;
type PhaseOutputRecord = Partial<Record<GenerationPhaseId, string>>;
type PhaseStatusRecord = Record<GenerationPhaseId, GenerationPhaseStatus>;
type PhasePromptRecord = Partial<Record<GenerationPhaseId, string>>;
type ArtifactRecord = Partial<Record<GenerationPhaseId, GenerationArtifact>>;
type PhaseVisibilityRecord = Record<GenerationPhaseId, boolean>;
type ParsedFinalScenario = ReturnType<typeof parseFinalScenarioPackage>;

type AppConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
};

type ScenarioCreateDraft = {
  selectedModel: string;
  executionMode: ExecutionMode;
  generatorIdeaText: string;
  coverImage: string;
  revisionRequest: string;
  phaseStatuses: PhaseStatusRecord;
  phaseOutputs: PhaseOutputRecord;
  phasePrompts: PhasePromptRecord;
  artifacts: ArtifactRecord;
  hookPreview: string;
  hookApproved: boolean;
  hookApprovalTranscript: string;
  generationError: string;
  failedPhase: GenerationPhaseId | null;
  pendingPhase: GenerationPhaseId | null;
  scenarioTitleHint: string;
  scenarioFileStem: string;
  finalScenario: ParsedFinalScenario | null;
  openPhaseSections: PhaseVisibilityRecord;
  openOutputPhases: PhaseVisibilityRecord;
};

type PhaseCardDefinition = {
  id: GenerationPhaseId;
  label: string;
};

type PhaseBundleOutputDefinition = {
  heading: string;
  requestLabel: string;
  promptInstruction: string;
};

const API_KEY_STORAGE_KEY = 'chatnoir_apiKey';
const API_KEY_STORAGE_MODE_KEY = 'chatnoir_apiKeyStorageMode';
const CREATE_DRAFT_STORAGE_KEY = 'chatnoir_scenarioCreateDraft_v1';
const PHASE_ORDER: GenerationPhaseId[] = ['phase1', 'phase2', 'phase3a', 'phase3b', 'phase4'];
const MODEL_OPTIONS = [
  { value: 'gemma-4-31b-it', label: 'Gemma 4 31B（推奨）' },
  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite（軽量・安定）' },
] as const;
const PROMPT_PATHS: Record<GenerationPhaseId, string> = {
  phase1: 'scenario-generation-prompts/01_concept_design_app.md',
  phase2: 'scenario-generation-prompts/02_scenario_build_app.md',
  phase3a: 'scenario-generation-prompts/03a_entertainment_review_app.md',
  phase3b: 'scenario-generation-prompts/03b_logic_review_app.md',
  phase4: 'scenario-generation-prompts/04_scenario_revision_app.md',
};
const PHASE_DEFINITIONS: PhaseCardDefinition[] = [
  { id: 'phase1', label: 'ステップ1 アイデアを入力 / プロローグ（仮）' },
  { id: 'phase2', label: 'ステップ2 シナリオ構築' },
  { id: 'phase3a', label: 'ステップ3a エンタメチェック' },
  { id: 'phase3b', label: 'ステップ3b ロジックチェック' },
  { id: 'phase4', label: 'ステップ4 最終修正' },
];
const GENERATION_SYSTEM_INSTRUCTION = 'あなたはシナリオ生成専用アシスタントです。これはゲーム本編進行ではありません。scene_blocks 形式の JSON、位置や時刻のステータス行、📍 や 🕐 の記号付き行、ゲームマスターとしての進行文は禁止です。与えられたプロンプトの出力フォーマットに厳密に従い、通常の Markdown / JSON コードブロックだけを返してください。';
const PHASE_OUTPUT_WRAPPERS: Record<GenerationPhaseId, string> = {
  phase1: '【アプリ側の出力要求】これはコンセプト設計ステップです。ゲーム本編の応答や現在地・時刻の表示は不要です。通常の Markdown のみを返してください。',
  phase2: '【アプリ側の出力要求】これはシナリオ構築ステップです。追加の出力指示に厳密に従い、今回要求されたファイルだけを返してください。',
  phase3a: '【アプリ側の出力要求】エンタメチェック結果のみを Markdown で返してください。ゲーム本編の描写やステータス行は禁止です。',
  phase3b: '【アプリ側の出力要求】ロジックチェック結果のみを Markdown で返してください。ゲーム本編の描写やステータス行は禁止です。',
  phase4: '【アプリ側の出力要求】これは最終修正ステップです。追加の出力指示に厳密に従い、今回要求されたファイルだけを返してください。',
};

const PHASE2_BUNDLE_OUTPUTS: PhaseBundleOutputDefinition[] = [
  {
    heading: '設定ファイル',
    requestLabel: '設定ファイル',
    promptInstruction: [
      '【今回の出力対象】設定ファイルのみを出力してください。',
      'プロローグ、マップ、見出し、補足説明、コードブロックは禁止です。',
      '設定ファイルの Markdown 本文だけを返してください。',
    ].join('\n'),
  },
  {
    heading: 'プロローグファイル',
    requestLabel: 'プロローグファイル',
    promptInstruction: [
      '【今回の出力対象】プロローグファイルのみを出力してください。',
      '設定ファイル、マップ、見出し、補足説明は禁止です。',
      '主人公一人称のプロローグ本文だけを返し、最後は --- で締めてください。',
    ].join('\n'),
  },
  {
    heading: 'マップファイル',
    requestLabel: 'マップファイル',
    promptInstruction: [
      '【今回の出力対象】マップファイルのみを出力してください。',
      '```json:initial_map``` のコードブロックのみを返してください。',
      '見出し、説明文、補足、前置き、後置きは禁止です。',
    ].join('\n'),
  },
];

const PHASE4_BUNDLE_OUTPUTS: PhaseBundleOutputDefinition[] = [
  {
    heading: '修正済み設定ファイル',
    requestLabel: '修正済み設定ファイル',
    promptInstruction: [
      '【今回の出力対象】修正済み設定ファイルのみを出力してください。',
      'プロローグ、ブリーフィング、マップ、メタデータ、見出し、補足説明は禁止です。',
      '設定ファイルの Markdown 本文だけを返してください。',
    ].join('\n'),
  },
  {
    heading: 'プロローグファイル',
    requestLabel: 'プロローグファイル',
    promptInstruction: [
      '【今回の出力対象】プロローグファイルのみを出力してください。',
      '設定ファイル、ブリーフィング、マップ、メタデータ、見出し、補足説明は禁止です。',
      '主人公一人称のプロローグ本文だけを返し、最後は --- で締めてください。',
    ].join('\n'),
  },
  {
    heading: 'ブリーフィングファイル',
    requestLabel: 'ブリーフィングファイル',
    promptInstruction: [
      '【今回の出力対象】ブリーフィングファイルのみを出力してください。',
      '設定ファイル、プロローグ、マップ、メタデータ、見出し、補足説明は禁止です。',
      'ブリーフィングの Markdown 本文だけを返してください。',
    ].join('\n'),
  },
  {
    heading: 'マップファイル',
    requestLabel: 'マップファイル',
    promptInstruction: [
      '【今回の出力対象】マップファイルのみを出力してください。',
      '```json:initial_map``` のコードブロックのみを返してください。',
      '見出し、説明文、補足、前置き、後置きは禁止です。',
    ].join('\n'),
  },
  {
    heading: 'シナリオ修正用メタデータ',
    requestLabel: 'シナリオ修正用メタデータ',
    promptInstruction: [
      '【今回の出力対象】シナリオ修正用メタデータのみを出力してください。',
      '```json``` のコードブロックのみを返してください。',
      '見出し、説明文、補足、前置き、後置きは禁止です。',
    ].join('\n'),
  },
];

const createInitialStatuses = (): PhaseStatusRecord => ({
  phase1: 'idle',
  phase2: 'idle',
  phase3a: 'idle',
  phase3b: 'idle',
  phase4: 'idle',
});

const createInitialPhaseVisibility = (defaultOpen: boolean): PhaseVisibilityRecord => ({
  phase1: defaultOpen,
  phase2: defaultOpen,
  phase3a: defaultOpen,
  phase3b: defaultOpen,
  phase4: defaultOpen,
});

const isObjectRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const normalizePhaseId = (value: unknown): GenerationPhaseId | null => {
  return typeof value === 'string' && PHASE_ORDER.includes(value as GenerationPhaseId)
    ? value as GenerationPhaseId
    : null;
};

const normalizePhaseTextRecord = (value: unknown): PhaseOutputRecord => {
  if (!isObjectRecord(value)) return {};

  const next: PhaseOutputRecord = {};
  PHASE_ORDER.forEach((phaseId) => {
    const phaseValue = value[phaseId];
    if (typeof phaseValue === 'string') {
      next[phaseId] = phaseValue;
    }
  });
  return next;
};

const normalizeArtifactRecord = (value: unknown): ArtifactRecord => {
  if (!isObjectRecord(value)) return {};

  const next: ArtifactRecord = {};
  PHASE_ORDER.forEach((phaseId) => {
    const phaseValue = value[phaseId];
    if (!isObjectRecord(phaseValue)) return;
    if (typeof phaseValue.fileName !== 'string' || typeof phaseValue.label !== 'string' || typeof phaseValue.markdown !== 'string') return;
    next[phaseId] = {
      phaseId,
      fileName: phaseValue.fileName,
      label: phaseValue.label,
      markdown: phaseValue.markdown,
    };
  });
  return next;
};

const normalizePhaseVisibility = (value: unknown, defaultOpen: boolean): PhaseVisibilityRecord => {
  const fallback = createInitialPhaseVisibility(defaultOpen);
  if (!isObjectRecord(value)) return fallback;

  return {
    phase1: typeof value.phase1 === 'boolean' ? value.phase1 : fallback.phase1,
    phase2: typeof value.phase2 === 'boolean' ? value.phase2 : fallback.phase2,
    phase3a: typeof value.phase3a === 'boolean' ? value.phase3a : fallback.phase3a,
    phase3b: typeof value.phase3b === 'boolean' ? value.phase3b : fallback.phase3b,
    phase4: typeof value.phase4 === 'boolean' ? value.phase4 : fallback.phase4,
  };
};

const normalizePhaseStatuses = (value: unknown): { statuses: PhaseStatusRecord; hadRunning: boolean } => {
  const next = createInitialStatuses();
  let hadRunning = false;

  if (!isObjectRecord(value)) {
    return { statuses: next, hadRunning };
  }

  PHASE_ORDER.forEach((phaseId) => {
    const status = value[phaseId];
    if (status === 'running') {
      next[phaseId] = 'idle';
      hadRunning = true;
      return;
    }
    if (status === 'idle' || status === 'waiting' || status === 'done' || status === 'error') {
      next[phaseId] = status;
    }
  });

  return { statuses: next, hadRunning };
};

const readStoredCreateDraft = (): ScenarioCreateDraft | null => {
  try {
    const raw = localStorage.getItem(CREATE_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isObjectRecord(parsed) ? parsed as ScenarioCreateDraft : null;
  } catch {
    return null;
  }
};

const persistCreateDraft = (draft: ScenarioCreateDraft) => {
  try {
    localStorage.setItem(CREATE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // ignore
  }
};

const clearStoredCreateDraft = () => {
  try {
    localStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
};

const isAbortError = (error: unknown) => {
  if (error instanceof DOMException) return error.name === 'AbortError';
  return error instanceof Error && error.name === 'AbortError';
};

const createAbortError = () => new DOMException('The operation was aborted.', 'AbortError');

const createArtifactLabel = (phaseId: GenerationPhaseId): string => {
  switch (phaseId) {
    case 'phase1':
      return 'ステップ1 コンセプト';
    case 'phase2':
      return 'ステップ2 シナリオ構築';
    case 'phase3a':
      return 'ステップ3a エンタメチェック';
    case 'phase3b':
      return 'ステップ3b ロジックチェック';
    case 'phase4':
      return 'ステップ4 最終修正';
  }
};

const readStoredApiKey = (): { apiKey: string; mode: ApiKeyStorageMode } => {
  try {
    const sessionApiKey = sessionStorage.getItem(API_KEY_STORAGE_KEY);
    if (sessionApiKey) return { apiKey: sessionApiKey, mode: 'session' };

    const localApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (localApiKey) return { apiKey: localApiKey, mode: 'local' };

    const savedMode = localStorage.getItem(API_KEY_STORAGE_MODE_KEY);
    if (savedMode === 'local' || savedMode === 'session') {
      return { apiKey: '', mode: savedMode };
    }
  } catch {
    // ignore
  }

  return { apiKey: '', mode: 'session' };
};

const persistApiKey = (apiKey: string, mode: ApiKeyStorageMode) => {
  try {
    localStorage.setItem(API_KEY_STORAGE_MODE_KEY, mode);

    if (mode === 'local') {
      if (apiKey.trim()) {
        localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
      } else {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
      }
      sessionStorage.removeItem(API_KEY_STORAGE_KEY);
      return;
    }

    if (apiKey.trim()) {
      sessionStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
    } else {
      sessionStorage.removeItem(API_KEY_STORAGE_KEY);
    }
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    // ignore
  }
};

const downloadTextFile = (fileName: string, text: string, mimeType = 'text/markdown;charset=utf-8') => {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const toAsciiFileStem = (title: string) => {
  const normalized = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (normalized) {
    return normalized;
  }

  let hash = 0;
  for (const char of title) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `scenario-${hash.toString(36)}`;
};

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl);
  return await response.blob();
};

const STEM_SYSTEM_INSTRUCTION = 'You convert scenario titles into lowercase ASCII file slugs. Return only the slug. Use romaji for Japanese titles. Allowed characters are a-z, 0-9, and hyphen.';

const FileUploadTrigger = ({
  accept,
  onChange,
  buttonLabel,
  inputName,
  multiple = false,
}: {
  accept: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  buttonLabel: string;
  inputName: string;
  multiple?: boolean;
}) => {
  return (
    <label className={styles.uploadButton}>
      <span className={styles.uploadTitle}>{buttonLabel}</span>
      <input className={styles.hiddenInput} type="file" accept={accept} name={inputName} multiple={multiple} onChange={onChange} />
    </label>
  );
};

const statusLabelMap: Record<GenerationPhaseStatus, string> = {
  idle: '未実行',
  waiting: '待機中',
  running: '実行中',
  done: '完了',
  error: '失敗',
};

const statusClassMap: Record<GenerationPhaseStatus, string> = {
  idle: styles.statusIdle,
  waiting: styles.statusWaiting,
  running: styles.statusRunning,
  done: styles.statusDone,
  error: styles.statusError,
};

export default function ScenarioCreatePage() {
  const router = useRouter();
  const uploadedMediaCacheRef = useRef<{ key: string; parts: GeminiChatMessagePart[] }>({ key: '', parts: [] });
  const activePhaseRef = useRef<GenerationPhaseId>('phase1');
  const stemCacheRef = useRef<Record<string, string>>({});
  const generationAbortControllerRef = useRef<AbortController | null>(null);
  const hasRestoredDraftRef = useRef(false);
  const [apiKey, setApiKey] = useState('');
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [apiKeyStorageMode, setApiKeyStorageMode] = useState<ApiKeyStorageMode>('session');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('auto');
  const [selectedModel, setSelectedModel] = useState('gemma-4-31b-it');
  const fallbackEnabled = false;
  const generationRequestMaxRetries = 3;
  const [generatorIdeaText, setGeneratorIdeaText] = useState('');
  const [attachments, setAttachments] = useState<GeneratorIdeaAttachment[]>([]);
  const [coverImage, setCoverImage] = useState('');
  const [revisionRequest, setRevisionRequest] = useState('');
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplates | null>(null);
  const [isPromptLoading, setIsPromptLoading] = useState(true);
  const [phaseStatuses, setPhaseStatuses] = useState<PhaseStatusRecord>(createInitialStatuses);
  const [phaseOutputs, setPhaseOutputs] = useState<PhaseOutputRecord>({});
  const [phasePrompts, setPhasePrompts] = useState<PhasePromptRecord>({});
  const [artifacts, setArtifacts] = useState<ArtifactRecord>({});
  const [hookPreview, setHookPreview] = useState('');
  const [hookApproved, setHookApproved] = useState(false);
  const [hookApprovalTranscript, setHookApprovalTranscript] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [failedPhase, setFailedPhase] = useState<GenerationPhaseId | null>(null);
  const [pendingPhase, setPendingPhase] = useState<GenerationPhaseId | null>(null);
  const [currentOperation, setCurrentOperation] = useState('');
  const [openPhaseSections, setOpenPhaseSections] = useState<PhaseVisibilityRecord>(() => createInitialPhaseVisibility(true));
  const [openOutputPhases, setOpenOutputPhases] = useState<PhaseVisibilityRecord>(() => createInitialPhaseVisibility(false));
  const [scenarioTitleHint, setScenarioTitleHint] = useState('');
  const [scenarioFileStem, setScenarioFileStem] = useState('scenario');
  const [finalScenario, setFinalScenario] = useState<ParsedFinalScenario | null>(null);

  const [appConfirm, setAppConfirm] = useState<AppConfirmState | null>(null);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);

  const showAppConfirm = (
    message: string,
    options: Partial<Omit<AppConfirmState, 'message'>> = {},
  ) => {
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current?.(false);
      confirmResolverRef.current = resolve;
      setAppConfirm({
        title: options.title ?? '確認',
        message,
        confirmLabel: options.confirmLabel ?? 'OK',
        cancelLabel: options.cancelLabel ?? 'キャンセル',
        danger: options.danger ?? false,
      });
    });
  };

  const closeAppConfirm = (result: boolean) => {
    const resolve = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setAppConfirm(null);
    resolve?.(result);
  };

  const mediaSummary = useMemo(
    () => summarizeAttachments(attachments.map(({ id, name, mimeType, sizeBytes, kind }) => ({ id, name, mimeType, sizeBytes, kind }))),
    [attachments],
  );

  const completedCount = useMemo(
    () => PHASE_ORDER.filter((phaseId) => phaseStatuses[phaseId] === 'done').length,
    [phaseStatuses],
  );

  const phase2Package = useMemo(
    () => phaseOutputs.phase2 ? parseScenarioBuildPackage(phaseOutputs.phase2) : null,
    [phaseOutputs.phase2],
  );

  const canStartPhase1 = Boolean(apiKey.trim() && promptTemplates && (generatorIdeaText.trim() || attachments.length > 0));

  useEffect(() => {
    const stored = readStoredApiKey();
    setApiKey(stored.apiKey);
    setApiKeyStorageMode(stored.mode);
  }, []);

  useEffect(() => {
    const draft = readStoredCreateDraft();
    if (!draft) {
      hasRestoredDraftRef.current = true;
      return;
    }

    const { statuses, hadRunning } = normalizePhaseStatuses(draft.phaseStatuses);
    setSelectedModel(typeof draft.selectedModel === 'string' ? draft.selectedModel : 'gemma-4-31b-it');
    setExecutionMode(draft.executionMode === 'step' ? 'step' : 'auto');
    setGeneratorIdeaText(typeof draft.generatorIdeaText === 'string' ? draft.generatorIdeaText : '');
    setCoverImage(typeof draft.coverImage === 'string' ? draft.coverImage : '');
    setRevisionRequest(typeof draft.revisionRequest === 'string' ? draft.revisionRequest : '');
    setPhaseStatuses(statuses);
    setPhaseOutputs(normalizePhaseTextRecord(draft.phaseOutputs));
    setPhasePrompts(normalizePhaseTextRecord(draft.phasePrompts));
    setArtifacts(normalizeArtifactRecord(draft.artifacts));
    setHookPreview(typeof draft.hookPreview === 'string' ? draft.hookPreview : '');
    setHookApproved(Boolean(draft.hookApproved));
    setHookApprovalTranscript(typeof draft.hookApprovalTranscript === 'string' ? draft.hookApprovalTranscript : '');
    setGenerationError(hadRunning ? '前回の生成はリロードにより停止しました。必要なら再実行してください。' : typeof draft.generationError === 'string' ? draft.generationError : '');
    setFailedPhase(normalizePhaseId(draft.failedPhase));
    setPendingPhase(normalizePhaseId(draft.pendingPhase));
    setScenarioTitleHint(typeof draft.scenarioTitleHint === 'string' ? draft.scenarioTitleHint : '');
    setScenarioFileStem(typeof draft.scenarioFileStem === 'string' ? draft.scenarioFileStem : 'scenario');
    setFinalScenario(isObjectRecord(draft.finalScenario) ? draft.finalScenario as ParsedFinalScenario : null);
    setOpenPhaseSections(normalizePhaseVisibility(draft.openPhaseSections, true));
    setOpenOutputPhases(normalizePhaseVisibility(draft.openOutputPhases, false));

    hasRestoredDraftRef.current = true;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPromptTemplates = async () => {
      setIsPromptLoading(true);
      try {
        const entries = await Promise.all(
          PHASE_ORDER.map(async (phaseId) => {
            const response = await fetch(resolvePublicAssetPath(PROMPT_PATHS[phaseId]));
            if (!response.ok) {
              throw new Error(`${PROMPT_PATHS[phaseId]} の読み込みに失敗しました。`);
            }
            return [phaseId, await response.text()] as const;
          }),
        );

        if (!cancelled) {
          setPromptTemplates(Object.fromEntries(entries) as PromptTemplates);
        }
      } catch (error) {
        if (!cancelled) {
          setGenerationError(error instanceof Error ? error.message : 'プロンプトの読み込みに失敗しました。');
        }
      } finally {
        if (!cancelled) {
          setIsPromptLoading(false);
        }
      }
    };

    loadPromptTemplates();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    uploadedMediaCacheRef.current = { key: '', parts: [] };
  }, [attachments]);

  useEffect(() => {
    if (!hasRestoredDraftRef.current) return;

    persistCreateDraft({
      selectedModel,
      executionMode,
      generatorIdeaText,
      coverImage,
      revisionRequest,
      phaseStatuses,
      phaseOutputs,
      phasePrompts,
      artifacts,
      hookPreview,
      hookApproved,
      hookApprovalTranscript,
      generationError,
      failedPhase,
      pendingPhase,
      scenarioTitleHint,
      scenarioFileStem,
      finalScenario,
      openPhaseSections,
      openOutputPhases,
    });
  }, [
    artifacts,
    coverImage,
    executionMode,
    failedPhase,
    finalScenario,
    generationError,
    generatorIdeaText,
    hookApprovalTranscript,
    hookApproved,
    hookPreview,
    openOutputPhases,
    openPhaseSections,
    pendingPhase,
    phaseOutputs,
    phasePrompts,
    phaseStatuses,
    revisionRequest,
    scenarioFileStem,
    scenarioTitleHint,
    selectedModel,
  ]);

  const updateStatus = (phaseId: GenerationPhaseId, status: GenerationPhaseStatus) => {
    setPhaseStatuses((prev) => ({ ...prev, [phaseId]: status }));
    if (status === 'running') {
      setOpenPhaseSections((prev) => ({ ...prev, [phaseId]: true }));
    }
  };

  const togglePhaseSection = (phaseId: GenerationPhaseId) => {
    setOpenPhaseSections((prev) => ({ ...prev, [phaseId]: !prev[phaseId] }));
  };

  const toggleOutputPhase = (phaseId: GenerationPhaseId) => {
    setOpenPhaseSections((prev) => ({ ...prev, [phaseId]: true }));
    setOpenOutputPhases((prev) => ({ ...prev, [phaseId]: !prev[phaseId] }));
  };

  const updatePhaseOutputText = (phaseId: GenerationPhaseId, nextMarkdown: string) => {
    setPhaseOutputs((prev) => ({ ...prev, [phaseId]: nextMarkdown }));
    setArtifacts((prev) => {
      const artifact = prev[phaseId];
      if (!artifact) return prev;
      return {
        ...prev,
        [phaseId]: {
          ...artifact,
          markdown: nextMarkdown,
        },
      };
    });

    if (phaseId === 'phase1') {
      setHookPreview(extractHookPreview(nextMarkdown));
      return;
    }

    if (phaseId === 'phase2') {
      const parsed = parseScenarioBuildPackage(nextMarkdown);
      if (parsed.title) setScenarioTitleHint(parsed.title);
      return;
    }

    if (phaseId === 'phase4') {
      const parsedFinal = parseFinalScenarioPackage(nextMarkdown);
      setFinalScenario(parsedFinal);
      if (parsedFinal.title) setScenarioTitleHint(parsedFinal.title);
    }
  };

  const throwIfGenerationAborted = () => {
    if (generationAbortControllerRef.current?.signal.aborted) {
      throw createAbortError();
    }
  };

  const resetDraftState = () => {
    uploadedMediaCacheRef.current = { key: '', parts: [] };
    activePhaseRef.current = 'phase1';
    stemCacheRef.current = {};
    setSelectedModel('gemma-4-31b-it');
    setExecutionMode('auto');
    setGeneratorIdeaText('');
    setAttachments([]);
    setCoverImage('');
    setRevisionRequest('');
    setPhaseStatuses(createInitialStatuses());
    setPhaseOutputs({});
    setPhasePrompts({});
    setArtifacts({});
    setHookPreview('');
    setHookApproved(false);
    setHookApprovalTranscript('');
    setGenerationError('');
    setFailedPhase(null);
    setPendingPhase(null);
    setCurrentOperation('');
    setOpenPhaseSections(createInitialPhaseVisibility(true));
    setOpenOutputPhases(createInitialPhaseVisibility(false));
    setScenarioTitleHint('');
    setScenarioFileStem('scenario');
    setFinalScenario(null);
  };

  const handleResetDraft = async () => {
    if (!(await showAppConfirm('リセットします。よろしいですか？', { title: 'リセット', danger: true, confirmLabel: 'リセット' }))) return;
    clearStoredCreateDraft();
    resetDraftState();
  };

  const handleStopGeneration = () => {
    generationAbortControllerRef.current?.abort();
    setCurrentOperation('停止中...');
  };

  const clearFromPhase = (phaseId: GenerationPhaseId) => {
    const phaseIndex = PHASE_ORDER.indexOf(phaseId);
    const targetPhases = PHASE_ORDER.slice(phaseIndex);

    setPhaseOutputs((prev) => {
      const next = { ...prev };
      targetPhases.forEach((targetPhaseId) => {
        delete next[targetPhaseId];
      });
      return next;
    });

    setPhasePrompts((prev) => {
      const next = { ...prev };
      targetPhases.forEach((targetPhaseId) => {
        delete next[targetPhaseId];
      });
      return next;
    });

    setArtifacts((prev) => {
      const next = { ...prev };
      targetPhases.forEach((targetPhaseId) => {
        delete next[targetPhaseId];
      });
      return next;
    });

    setPhaseStatuses((prev) => {
      const next = { ...prev };
      targetPhases.forEach((targetPhaseId) => {
        next[targetPhaseId] = 'idle';
      });
      return next;
    });

    if (phaseIndex <= 0) {
      setHookPreview('');
      setHookApproved(false);
      setHookApprovalTranscript('');
      setScenarioTitleHint('');
      setScenarioFileStem('scenario');
    }

    if (phaseIndex <= 4) {
      setFinalScenario(null);
    }

    setOpenOutputPhases((prev) => {
      const next = { ...prev };
      targetPhases.forEach((targetPhaseId) => {
        next[targetPhaseId] = false;
      });
      return next;
    });

    setPendingPhase(null);
    setGenerationError('');
    setFailedPhase(null);
  };

  const markNextPhaseWaiting = (phaseId: GenerationPhaseId | null) => {
    setPendingPhase(phaseId);
    if (!phaseId) return;
    updateStatus(phaseId, 'waiting');
  };

  const buildRequestTranscript = () => {
    const lines = [
      'User:',
      generatorIdeaText.trim() || 'アイデア本文: （未入力）',
      '',
      'Media Summary:',
      mediaSummary,
    ];
    return lines.join('\n');
  };

  const ensureUploadedMediaParts = async (): Promise<GeminiChatMessagePart[]> => {
    throwIfGenerationAborted();

    if (attachments.length === 0) {
      return [];
    }

    const cacheKey = attachments.map((attachment) => attachment.id).join('|');
    if (uploadedMediaCacheRef.current.key === cacheKey) {
      return uploadedMediaCacheRef.current.parts;
    }

    const parts: GeminiChatMessagePart[] = [];
    for (const attachment of attachments) {
      throwIfGenerationAborted();
      setCurrentOperation(`添付アップロード: ${attachment.name}`);
      const uploadedFile = await uploadGeminiFile({
        apiKey,
        file: attachment.file,
        mimeType: attachment.mimeType,
        displayName: attachment.name,
        abortSignal: generationAbortControllerRef.current?.signal,
      });
      parts.push(createGeminiFilePart(uploadedFile));
    }

    uploadedMediaCacheRef.current = { key: cacheKey, parts };
    return parts;
  };

  const resolveTitleStem = async (title: string) => {
    const normalizedTitle = title.trim() || 'scenario';
    const cached = stemCacheRef.current[normalizedTitle];
    if (cached) {
      setScenarioFileStem(cached);
      return cached;
    }

    const fallbackStem = toAsciiFileStem(sanitizeFileName(normalizedTitle));
    const hasJapanese = /[\u3040-\u30ff\u3400-\u9fff]/.test(normalizedTitle);

    if (!hasJapanese) {
      stemCacheRef.current[normalizedTitle] = fallbackStem;
      setScenarioFileStem(fallbackStem);
      return fallbackStem;
    }

    try {
      const response = await requestChatApi({
        apiKey,
        model: selectedModel,
        fallbackEnabled,
        maxRetries: generationRequestMaxRetries,
        isReviewMode: true,
        systemInstruction: STEM_SYSTEM_INSTRUCTION,
        messages: [{ role: 'user', parts: [{ text: `Title: ${normalizedTitle}\nReturn only one lowercase ASCII slug.` }] }],
      });
      const payload = await response.json();
      const resolvedStem = toAsciiFileStem(String(payload.text || '').trim().replace(/^['"`]+|['"`]+$/g, ''));
      const finalStem = resolvedStem.startsWith('scenario-') ? fallbackStem : resolvedStem;
      stemCacheRef.current[normalizedTitle] = finalStem;
      setScenarioFileStem(finalStem);
      return finalStem;
    } catch {
      stemCacheRef.current[normalizedTitle] = fallbackStem;
      setScenarioFileStem(fallbackStem);
      return fallbackStem;
    }
  };

  const requestPhaseMarkdown = async (
    phaseId: GenerationPhaseId,
    promptText: string,
    operationLabel: string,
    extraParts: GeminiChatMessagePart[] = [],
  ) => {
    activePhaseRef.current = phaseId;
    setCurrentOperation(operationLabel);
    throwIfGenerationAborted();

    const response = await requestChatApi({
      apiKey,
      model: selectedModel,
      fallbackEnabled,
      maxRetries: generationRequestMaxRetries,
      isReviewMode: true,
      systemInstruction: GENERATION_SYSTEM_INSTRUCTION,
      abortSignal: generationAbortControllerRef.current?.signal,
      messages: [{ role: 'user', parts: [{ text: promptText }, ...extraParts] }],
    });
    const payload = await response.json();
    throwIfGenerationAborted();

    if (!response.ok || payload.error || !payload.text?.trim()) {
      throw new Error(payload.error || `${operationLabel} の出力取得に失敗しました。`);
    }

    return payload.text.trim();
  };

  const finalizePhaseOutput = async (phaseId: GenerationPhaseId, promptText: string, markdown: string) => {
    setPhasePrompts((prev) => ({ ...prev, [phaseId]: promptText }));
    setPhaseOutputs((prev) => ({ ...prev, [phaseId]: markdown }));

    const resolvedTitle = extractScenarioTitle(markdown) || scenarioTitleHint || finalScenario?.title || 'scenario';
    const title = await resolveTitleStem(resolvedTitle);
    const artifact: GenerationArtifact = {
      phaseId,
      label: createArtifactLabel(phaseId),
      fileName: buildMarkdownDownloadName(phaseId === 'phase1' ? '01_concept' : phaseId === 'phase2' ? '02_scenario_build' : phaseId === 'phase3a' ? '03a_entertainment_review' : phaseId === 'phase3b' ? '03b_logic_review' : '04_scenario_revision', title),
      markdown,
    };

    setArtifacts((prev) => ({ ...prev, [phaseId]: artifact }));
    updateStatus(phaseId, 'done');
    return markdown;
  };

  const runBundlePhaseRequest = async (
    phaseId: Extract<GenerationPhaseId, 'phase2' | 'phase4'>,
    basePrompt: string,
    outputs: PhaseBundleOutputDefinition[],
  ) => {
    activePhaseRef.current = phaseId;
    updateStatus(phaseId, 'running');

    const prompts = outputs.map((output) => `${basePrompt}\n\n${output.promptInstruction}`);
    const combinedPrompt = prompts
      .map((prompt, index) => `### 出力${index + 1}用プロンプト：${outputs[index].heading}\n\n${prompt}`)
      .join('\n\n');

    setPhasePrompts((prev) => ({ ...prev, [phaseId]: combinedPrompt }));

    const chunks: string[] = [];
    for (const [index, output] of outputs.entries()) {
      const markdown = await requestPhaseMarkdown(phaseId, prompts[index], `${createArtifactLabel(phaseId)}: ${output.requestLabel}`);
      chunks.push(`### 出力${index + 1}：${output.heading}\n\n${markdown}`);
    }

    return await finalizePhaseOutput(phaseId, combinedPrompt, chunks.join('\n\n'));
  };

  const runModelRequest = async (phaseId: GenerationPhaseId, promptText: string, extraParts: GeminiChatMessagePart[] = []) => {
    activePhaseRef.current = phaseId;
    updateStatus(phaseId, 'running');
    setPhasePrompts((prev) => ({ ...prev, [phaseId]: promptText }));

    const markdown = await requestPhaseMarkdown(phaseId, promptText, createArtifactLabel(phaseId), extraParts);
    return await finalizePhaseOutput(phaseId, promptText, markdown);
  };

  const buildPromptReplacements = (_phaseId: GenerationPhaseId, overrides: Partial<Record<string, string>> = {}) => {
    const base: Record<string, string> = {
      USER_IDEA_TEXT: generatorIdeaText.trim() || '（未入力）',
      USER_MEDIA_SUMMARY: mediaSummary,
      USER_REQUEST_TRANSCRIPT: buildRequestTranscript(),
      PHASE1_PROMPT_TEXT: phasePrompts.phase1 || '',
      PHASE1_OUTPUT: phaseOutputs.phase1 || '',
      HOOK_APPROVAL_TRANSCRIPT: hookApprovalTranscript || '承認待ち',
      PHASE2_PROMPT_TEXT: phasePrompts.phase2 || '',
      PHASE2_OUTPUT: phaseOutputs.phase2 || '',
      PHASE3A_PROMPT_TEXT: phasePrompts.phase3a || '',
      PHASE3A_OUTPUT: phaseOutputs.phase3a || '',
      PHASE3B_PROMPT_TEXT: phasePrompts.phase3b || '',
      PHASE3B_OUTPUT: phaseOutputs.phase3b || '',
      USER_REVISION_REQUESTS: revisionRequest.trim() || '（追加修正要望なし）',
    };

    return Object.fromEntries(
      Object.entries({ ...base, ...overrides }).map(([key, value]) => [key, value ?? ''])
    ) as Record<string, string>;
  };

  const runPhase1 = async () => {
    if (!promptTemplates) throw new Error('プロンプトをまだ読み込めていません。');
    activePhaseRef.current = 'phase1';
    clearFromPhase('phase1');

    const promptText = `${PHASE_OUTPUT_WRAPPERS.phase1}\n\n${replacePromptPlaceholders(promptTemplates.phase1, buildPromptReplacements('phase1'))}`;
    const uploadedParts = await ensureUploadedMediaParts();
    const markdown = await runModelRequest('phase1', promptText, uploadedParts);
    setScenarioTitleHint(extractScenarioTitle(markdown));
    setHookPreview(extractHookPreview(markdown));
    updateStatus('phase2', 'waiting');
  };

  const executePhase2 = async (approvalTranscriptOverride?: string) => {
    if (!promptTemplates) throw new Error('プロンプトをまだ読み込めていません。');

    const phase2Prompt = `${PHASE_OUTPUT_WRAPPERS.phase2}\n\n${replacePromptPlaceholders(
      promptTemplates.phase2,
      buildPromptReplacements('phase2', {
        HOOK_APPROVAL_TRANSCRIPT: approvalTranscriptOverride || hookApprovalTranscript || 'User: Hook を承認。ステップ2 へ進行。',
      }),
    )}`;
    const phase2Output = await runBundlePhaseRequest('phase2', phase2Prompt, PHASE2_BUNDLE_OUTPUTS);
    const parsed = parseScenarioBuildPackage(phase2Output);
    if (parsed.title) setScenarioTitleHint(parsed.title);

    return { phase2Prompt, phase2Output, parsed };
  };

  const executePhase3a = async (phase2Prompt: string, phase2Output: string) => {
    if (!promptTemplates) throw new Error('プロンプトをまだ読み込めていません。');
    const phase3aPrompt = `${PHASE_OUTPUT_WRAPPERS.phase3a}\n\n${replacePromptPlaceholders(
      promptTemplates.phase3a,
      buildPromptReplacements('phase3a', { PHASE2_OUTPUT: phase2Output, PHASE2_PROMPT_TEXT: phase2Prompt }),
    )}`;
    const phase3aOutput = await runModelRequest('phase3a', phase3aPrompt);
    return { phase3aPrompt, phase3aOutput };
  };

  const executePhase3b = async (phase2Prompt: string, phase2Output: string) => {
    if (!promptTemplates) throw new Error('プロンプトをまだ読み込めていません。');
    const phase3bPrompt = `${PHASE_OUTPUT_WRAPPERS.phase3b}\n\n${replacePromptPlaceholders(
      promptTemplates.phase3b,
      buildPromptReplacements('phase3b', { PHASE2_OUTPUT: phase2Output, PHASE2_PROMPT_TEXT: phase2Prompt }),
    )}`;
    const phase3bOutput = await runModelRequest('phase3b', phase3bPrompt);
    return { phase3bPrompt, phase3bOutput };
  };

  const executePhase4 = async (context: {
    phase2Prompt: string;
    phase2Output: string;
    phase3aPrompt: string;
    phase3aOutput: string;
    phase3bPrompt: string;
    phase3bOutput: string;
  }) => {
    if (!promptTemplates) throw new Error('プロンプトをまだ読み込めていません。');
    const phase4Prompt = `${PHASE_OUTPUT_WRAPPERS.phase4}\n\n${replacePromptPlaceholders(
      promptTemplates.phase4,
      buildPromptReplacements('phase4', {
        PHASE2_OUTPUT: context.phase2Output,
        PHASE2_PROMPT_TEXT: context.phase2Prompt,
        PHASE3A_OUTPUT: context.phase3aOutput,
        PHASE3A_PROMPT_TEXT: context.phase3aPrompt,
        PHASE3B_OUTPUT: context.phase3bOutput,
        PHASE3B_PROMPT_TEXT: context.phase3bPrompt,
      }),
    )}`;
    const phase4Output = await runBundlePhaseRequest('phase4', phase4Prompt, PHASE4_BUNDLE_OUTPUTS);
    const parsedFinal = parseFinalScenarioPackage(phase4Output);
    setFinalScenario(parsedFinal);
    if (parsedFinal.title) setScenarioTitleHint(parsedFinal.title);
    return { phase4Prompt, phase4Output, parsedFinal };
  };

  const runPhase2ToPhase4Auto = async (approvalTranscriptOverride?: string) => {
    clearFromPhase('phase2');
    const { phase2Prompt, phase2Output } = await executePhase2(approvalTranscriptOverride);
    const { phase3aPrompt, phase3aOutput } = await executePhase3a(phase2Prompt, phase2Output);
    const { phase3bPrompt, phase3bOutput } = await executePhase3b(phase2Prompt, phase2Output);
    await executePhase4({ phase2Prompt, phase2Output, phase3aPrompt, phase3aOutput, phase3bPrompt, phase3bOutput });
    setPendingPhase(null);
  };

  const rerunFromFailedPhase = async (phaseId: Exclude<GenerationPhaseId, 'phase1'>) => {
    if (phaseId === 'phase2') {
      clearFromPhase('phase2');
      const { phase2Prompt, phase2Output } = await executePhase2();
      if (executionMode === 'step') {
        markNextPhaseWaiting('phase3a');
        return;
      }

      const { phase3aPrompt, phase3aOutput } = await executePhase3a(phase2Prompt, phase2Output);
      const { phase3bPrompt, phase3bOutput } = await executePhase3b(phase2Prompt, phase2Output);
      await executePhase4({ phase2Prompt, phase2Output, phase3aPrompt, phase3aOutput, phase3bPrompt, phase3bOutput });
      setPendingPhase(null);
      return;
    }

    if (!phasePrompts.phase2 || !phaseOutputs.phase2) {
      throw new Error('ステップ2 の結果が見つからないため、ステップ2 から再実行してください。');
    }

    if (phaseId === 'phase3a') {
      const phase2Prompt = phasePrompts.phase2;
      const phase2Output = phaseOutputs.phase2;
      clearFromPhase('phase3a');
      const { phase3aPrompt, phase3aOutput } = await executePhase3a(phase2Prompt, phase2Output);
      if (executionMode === 'step') {
        markNextPhaseWaiting('phase3b');
        return;
      }

      const { phase3bPrompt, phase3bOutput } = await executePhase3b(phase2Prompt, phase2Output);
      await executePhase4({ phase2Prompt, phase2Output, phase3aPrompt, phase3aOutput, phase3bPrompt, phase3bOutput });
      setPendingPhase(null);
      return;
    }

    if (phaseId === 'phase3b') {
      if (!phasePrompts.phase3a || !phaseOutputs.phase3a) {
        throw new Error('ステップ3a の結果が見つからないため、ステップ3a から再実行してください。');
      }

      const phase2Prompt = phasePrompts.phase2;
      const phase2Output = phaseOutputs.phase2;
      const phase3aPrompt = phasePrompts.phase3a;
      const phase3aOutput = phaseOutputs.phase3a;
      clearFromPhase('phase3b');
      const { phase3bPrompt, phase3bOutput } = await executePhase3b(phase2Prompt, phase2Output);
      if (executionMode === 'step') {
        markNextPhaseWaiting('phase4');
        return;
      }

      await executePhase4({ phase2Prompt, phase2Output, phase3aPrompt, phase3aOutput, phase3bPrompt, phase3bOutput });
      setPendingPhase(null);
      return;
    }

    if (!phasePrompts.phase3a || !phaseOutputs.phase3a || !phasePrompts.phase3b || !phaseOutputs.phase3b) {
      throw new Error('ステップ4 に必要なレビュー出力が不足しています。');
    }

    const phase2Prompt = phasePrompts.phase2;
    const phase2Output = phaseOutputs.phase2;
    const phase3aPrompt = phasePrompts.phase3a;
    const phase3aOutput = phaseOutputs.phase3a;
    const phase3bPrompt = phasePrompts.phase3b;
    const phase3bOutput = phaseOutputs.phase3b;
    clearFromPhase('phase4');
    await executePhase4({ phase2Prompt, phase2Output, phase3aPrompt, phase3aOutput, phase3bPrompt, phase3bOutput });
    setPendingPhase(null);
  };

  const runPhase4FromCurrentState = async () => {
    if (!phasePrompts.phase2 || !phaseOutputs.phase2 || !phasePrompts.phase3a || !phaseOutputs.phase3a || !phasePrompts.phase3b || !phaseOutputs.phase3b) {
      throw new Error('ステップ4 に必要なレビュー出力が不足しています。');
    }

    markNextPhaseWaiting('phase4');
    await executePhase4({
      phase2Prompt: phasePrompts.phase2,
      phase2Output: phaseOutputs.phase2,
      phase3aPrompt: phasePrompts.phase3a,
      phase3aOutput: phaseOutputs.phase3a,
      phase3bPrompt: phasePrompts.phase3b,
      phase3bOutput: phaseOutputs.phase3b,
    });
    setPendingPhase(null);
  };

  const runNextPendingPhase = async () => {
    if (!pendingPhase) return;

    if (!phasePrompts.phase2 || !phaseOutputs.phase2) {
      throw new Error('ステップ2 の結果が見つかりません。');
    }

    if (pendingPhase === 'phase3a') {
      const { phase3aOutput } = await executePhase3a(phasePrompts.phase2, phaseOutputs.phase2);
      if (executionMode === 'step') {
        markNextPhaseWaiting('phase3b');
        return;
      }
      const { phase3bPrompt, phase3bOutput } = await executePhase3b(phasePrompts.phase2, phaseOutputs.phase2);
      await executePhase4({
        phase2Prompt: phasePrompts.phase2,
        phase2Output: phaseOutputs.phase2,
        phase3aPrompt: phasePrompts.phase3a || '',
        phase3aOutput,
        phase3bPrompt,
        phase3bOutput,
      });
      setPendingPhase(null);
      return;
    }

    if (pendingPhase === 'phase3b') {
      const { phase3bOutput } = await executePhase3b(phasePrompts.phase2, phaseOutputs.phase2);
      if (executionMode === 'step') {
        markNextPhaseWaiting('phase4');
        return;
      }
      if (!phasePrompts.phase3a || !phaseOutputs.phase3a) {
        throw new Error('ステップ3a の結果が見つかりません。');
      }
      await executePhase4({
        phase2Prompt: phasePrompts.phase2,
        phase2Output: phaseOutputs.phase2,
        phase3aPrompt: phasePrompts.phase3a,
        phase3aOutput: phaseOutputs.phase3a,
        phase3bPrompt: phasePrompts.phase3b || '',
        phase3bOutput,
      });
      setPendingPhase(null);
      return;
    }

    if (pendingPhase === 'phase4') {
      if (!phasePrompts.phase3a || !phaseOutputs.phase3a || !phasePrompts.phase3b || !phaseOutputs.phase3b) {
        throw new Error('ステップ4 に必要なレビュー出力が不足しています。');
      }
      await executePhase4({
        phase2Prompt: phasePrompts.phase2,
        phase2Output: phaseOutputs.phase2,
        phase3aPrompt: phasePrompts.phase3a,
        phase3aOutput: phaseOutputs.phase3a,
        phase3bPrompt: phasePrompts.phase3b,
        phase3bOutput: phaseOutputs.phase3b,
      });
      setPendingPhase(null);
    }
  };

  const withGenerationGuard = async (action: () => Promise<void>) => {
    const controller = new AbortController();
    generationAbortControllerRef.current = controller;
    setIsGenerating(true);
    setGenerationError('');
    setFailedPhase(null);

    try {
      persistApiKey(apiKey, apiKeyStorageMode);
      await action();
      setCurrentOperation('');
    } catch (error) {
      if (isAbortError(error)) {
        const currentPhase = activePhaseRef.current || 'phase1';
        setGenerationError('生成を停止しました。必要なら再実行してください。');
        setFailedPhase(currentPhase);
        setOpenPhaseSections((prev) => ({ ...prev, [currentPhase]: true }));
        updateStatus(currentPhase, 'idle');
        setCurrentOperation('');
        return;
      }

      const message = error instanceof Error ? error.message : 'シナリオ生成に失敗しました。';
      setGenerationError(`${message}\n時間をおくか、モデルを変更して再試行してください。`);
      const currentPhase = activePhaseRef.current || failedPhase || 'phase1';
      setFailedPhase(currentPhase);
      setOpenPhaseSections((prev) => ({ ...prev, [currentPhase]: true }));
      updateStatus(currentPhase, 'error');
      setCurrentOperation('');
    } finally {
      if (generationAbortControllerRef.current === controller) {
        generationAbortControllerRef.current = null;
      }
      setIsGenerating(false);
    }
  };

  const handleStartGeneration = () => {
    if (!canStartPhase1) {
      setGenerationError('API キーと生成アイデアを確認してください。');
      return;
    }

    void withGenerationGuard(runPhase1);
  };

  const handleApproveHook = () => {
    const approvalTranscript = 'User: プロローグ（仮）を承認。ステップ2 へ進行。';

    setHookApproved(true);
    setHookApprovalTranscript(approvalTranscript);
    if (executionMode === 'step') {
      void withGenerationGuard(async () => {
        clearFromPhase('phase2');
        await executePhase2(approvalTranscript);
        markNextPhaseWaiting('phase3a');
      });
      return;
    }

    void withGenerationGuard(() => runPhase2ToPhase4Auto(approvalTranscript));
  };

  const handleRetryFromFailedPhase = () => {
    if (!failedPhase) return;

    if (failedPhase === 'phase1') {
      void withGenerationGuard(runPhase1);
      return;
    }

    void withGenerationGuard(() => rerunFromFailedPhase(failedPhase));
  };

  const appendFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const nextItems: GeneratorIdeaAttachment[] = [];
    for (const [index, file] of Array.from(files).entries()) {
      const kind = classifyAttachmentKind(file.type);
      if (!kind) continue;
      nextItems.push({
        id: `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
        file,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        kind,
      });
    }

    if (nextItems.length > 0) {
      setAttachments((prev) => [...prev, ...nextItems]);
    }
  };

  const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    appendFiles(event.target.files);
    event.target.value = '';
  };

  const handleCoverChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCoverImage(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handlePlayGeneratedScenario = () => {
    if (!finalScenario) return;

    const payload: PendingGeneratedScenarioPayload = {
      scenarioTitle: finalScenario.title,
      saveName: finalScenario.title,
      scenarioText: finalScenario.scenarioText,
      briefingText: finalScenario.briefingText,
      prologueText: finalScenario.prologueText,
      mapFileText: finalScenario.mapFileText,
      coverImage,
      scenarioMeta: {
        title: finalScenario.title,
        protagonistName: finalScenario.scenarioMeta.protagonistName,
        protagonistFirstPerson: finalScenario.scenarioMeta.protagonistFirstPerson,
      },
    };

    storePendingGeneratedScenario(payload);
    router.push('/');
  };

  const handleDownloadZip = async () => {
    if (!finalScenario) return;

    const zip = new JSZip();
    const title = scenarioFileStem;
    const root = zip.folder(title);
    if (!root) return;

    finalFiles.filter((file) => file.text.trim()).forEach((file) => {
      root.file(file.fileName, file.text);
    });

    if (coverImage) {
      const coverBlob = await dataUrlToBlob(coverImage);
      const extension = coverBlob.type.split('/')[1] || 'png';
      root.file(`${title}_カバー.${extension}`, coverBlob);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const progressPercent = Math.round((completedCount / PHASE_ORDER.length) * 100);
  const isPhase1Generating = isGenerating && activePhaseRef.current === 'phase1';
  const runningPhaseId = PHASE_ORDER.find((phaseId) => phaseStatuses[phaseId] === 'running') || null;

  const titledPhase2Files = phase2Package
    ? [
        { title: '設定ファイル', fileName: `${scenarioFileStem}_setting.md`, text: phase2Package.scenarioText, mimeType: 'text/markdown;charset=utf-8' },
        { title: 'プロローグ', fileName: `${scenarioFileStem}_prologue.md`, text: phase2Package.prologueText, mimeType: 'text/markdown;charset=utf-8' },
        { title: '初期マップ', fileName: `${scenarioFileStem}_initial-map.json`, text: phase2Package.mapJsonText, mimeType: 'application/json;charset=utf-8' },
      ]
    : [];

  const finalFiles = finalScenario
    ? [
        { title: '設定ファイル', fileName: `${scenarioFileStem}_setting.md`, text: finalScenario.scenarioText, mimeType: 'text/markdown;charset=utf-8' },
        { title: 'プロローグ', fileName: `${scenarioFileStem}_prologue.md`, text: finalScenario.prologueText, mimeType: 'text/markdown;charset=utf-8' },
        { title: 'ブリーフィング', fileName: `${scenarioFileStem}_briefing.md`, text: finalScenario.briefingText, mimeType: 'text/markdown;charset=utf-8' },
        { title: '初期マップ', fileName: `${scenarioFileStem}_initial-map.json`, text: finalScenario.mapJsonText, mimeType: 'application/json;charset=utf-8' },
        { title: 'メタデータ', fileName: `${scenarioFileStem}_metadata.json`, text: finalScenario.metadataJsonText, mimeType: 'application/json;charset=utf-8' },
      ]
    : [];

  const syncScenarioFileStem = useEffectEvent((title: string) => {
    void resolveTitleStem(title);
  });

  useEffect(() => {
    const latestTitle = finalScenario?.title || phase2Package?.title || scenarioTitleHint;
    if (!latestTitle) return;
    syncScenarioFileStem(latestTitle);
  }, [finalScenario?.title, phase2Package?.title, scenarioTitleHint]);

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>物語を作る</h1>
              <span className={styles.betaBadge}>BETA</span>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.dangerButton} onClick={handleResetDraft} disabled={isGenerating}>
              リセット
            </button>
            <button type="button" className={styles.ghostButton} onClick={() => router.push('/')}>
              トップへ戻る
            </button>
          </div>
        </header>

        <div className={styles.grid}>
          <main className={styles.mainColumn}>
            {executionMode === 'step' && phaseOutputs.phase3b ? (
              <section className={styles.card}>
                <div className={styles.cardBody}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <h2 className={styles.sectionTitle}>ステップ4 調整</h2>
                    </div>
                  </div>
                  <label className={styles.fullField}>
                    <span className={styles.label}>レビュー後の追加修正要望</span>
                    <textarea id="revision-request" name="revisionRequest" className={styles.textarea} value={revisionRequest} onChange={(event) => setRevisionRequest(event.target.value)} placeholder="例: ヒロインの動機をもう少し切実に。中盤の会話イベントを増やし、終盤の反転は感情寄りにしたい。" />
                  </label>
                    {finalScenario ? (
                      <div className={styles.actionsRow} style={{ marginTop: 16, justifyContent: 'flex-end' }}>
                        <button type="button" className={styles.secondaryButton} onClick={() => void withGenerationGuard(runPhase4FromCurrentState)} disabled={isGenerating}>
                          ステップ4 を再実行
                        </button>
                      </div>
                    ) : null}
                </div>
              </section>
            ) : null}

            {finalScenario ? (
              <section className={styles.finalCard}>
                <div className={styles.finalBody}>
                  <div className={styles.finalHero}>
                    <div>
                      <div className={styles.badgeRow}>
                        <span className={styles.badge}>完成</span>
                      </div>
                      <h2 className={styles.sectionTitle} style={{ marginTop: 12 }}>{finalScenario.title}</h2>
                      <div className={styles.finalStats}>
                        <div className={styles.statCard}>
                          <div className={styles.statLabel}>主人公名</div>
                          <div className={styles.statValue}>{finalScenario.scenarioMeta.protagonistName || '未抽出'}</div>
                        </div>
                        <div className={styles.statCard}>
                          <div className={styles.statLabel}>一人称</div>
                          <div className={styles.statValue}>{finalScenario.scenarioMeta.protagonistFirstPerson || '未抽出'}</div>
                        </div>
                      </div>
                    </div>
                    {coverImage ? <img src={coverImage} alt="Generated cover" className={styles.coverPreview} /> : null}
                  </div>

                  <div className={styles.finalFiles}>
                    {finalFiles.filter((file) => file.text.trim()).map((file) => (
                      <div key={file.fileName} className={styles.finalFileItem}>
                        <div className={styles.finalFileMeta}>
                          <div className={styles.finalFileTitle}>{file.title}</div>
                          <div className={styles.finalFileSub}>{file.fileName}</div>
                        </div>
                        <button type="button" className={styles.smallButton} onClick={() => downloadTextFile(file.fileName, file.text, file.mimeType)}>
                          ダウンロード
                        </button>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <span className={styles.label}>カバー画像</span>
                    <div style={{ marginTop: 8 }}>
                      <FileUploadTrigger accept="image/*" inputName="coverImage" buttonLabel="カバー画像をアップロード（任意）" onChange={handleCoverChange} />
                    </div>
                  </div>

                  <div className={styles.actionsRow} style={{ marginTop: 18 }}>
                    <button type="button" className={styles.primaryButton} onClick={handlePlayGeneratedScenario}>
                      このシナリオで遊ぶ
                    </button>
                    <button type="button" className={styles.secondaryButton} onClick={() => void handleDownloadZip()}>
                      すべてのファイルをZIPで一括ダウンロード
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
          </main>

          <aside className={styles.sideColumn}>
            <section className={styles.darkCard}>
              <div className={styles.darkBody}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2 className={styles.sectionTitle}>プレイ設定</h2>
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span className={styles.label}>Google AI Studio API キー</span>
                    <div className={styles.secretField}>
                      <input id="generator-api-key" name="apiKey" className={styles.input} type={isApiKeyVisible ? 'text' : 'password'} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="AIza..." autoComplete="off" />
                      <button type="button" className={styles.smallButton} onClick={() => setIsApiKeyVisible((prev) => !prev)}>
                        {isApiKeyVisible ? '隠す' : '表示'}
                      </button>
                    </div>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>APIキーの保存方法</span>
                    <select id="api-key-storage-mode" name="apiKeyStorageMode" className={styles.select} value={apiKeyStorageMode} onChange={(event) => setApiKeyStorageMode(event.target.value as ApiKeyStorageMode)}>
                      <option value="session">一時保存: ブラウザを閉じると消える</option>
                      <option value="local">この端末に保存: 次回も自動入力する</option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>AIモデル</span>
                    <select id="generator-model" name="selectedModel" className={styles.select} value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
                      {MODEL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.fullField}>
                    <span className={styles.label}>進め方</span>
                    <div className={styles.modeSwitcher}>
                      <button type="button" className={`${styles.modeButton} ${executionMode === 'auto' ? styles.modeButtonActive : ''}`} onClick={() => setExecutionMode('auto')}>
                        一気に最後まで
                      </button>
                      <button type="button" className={`${styles.modeButton} ${executionMode === 'step' ? styles.modeButtonActive : ''}`} onClick={() => setExecutionMode('step')}>
                        各ステップで止める
                      </button>
                    </div>
                  </div>
                </div>

                <div className={styles.progressLine}>
                  <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
                </div>
                {isGenerating && currentOperation ? <div className={styles.helperText} style={{ marginTop: 10 }}>{currentOperation}</div> : null}
              </div>
            </section>

            <section className={styles.phaseCard}>
              <div className={styles.phaseBody}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2 className={styles.sectionTitle}>作成ステップ</h2>
                  </div>
                </div>

                <div className={styles.phaseBlock}>
                  <button type="button" className={styles.phaseToggle} onClick={() => togglePhaseSection('phase1')}>
                    <div className={styles.phaseToggleMeta}>
                      <div className={styles.downloadTitle}>{PHASE_DEFINITIONS[0].label}</div>
                      <span className={`${styles.statusBadge} ${statusClassMap[phaseStatuses.phase1]}`}>{statusLabelMap[phaseStatuses.phase1]}</span>
                    </div>
                    <span className={styles.phaseToggleIcon}>{openPhaseSections.phase1 ? '▲' : '▼'}</span>
                  </button>

                  {openPhaseSections.phase1 ? (
                    <div className={styles.phaseContent}>
                      <div>
                        <span className={styles.label}>アイデアを入力</span>
                        <textarea
                          id="generator-idea"
                          name="generatorIdeaText"
                          className={styles.textarea}
                          value={generatorIdeaText}
                          onChange={(event) => setGeneratorIdeaText(event.target.value)}
                          placeholder="例: 海辺の町が舞台。ひと夏の終わりの寂しさと、保健室の先生のやさしい違和感を軸にしたい。画像の少女がヒロイン。"
                        />
                      </div>

                      <div className={styles.uploadGrid}>
                        <FileUploadTrigger accept="image/*" multiple inputName="ideaImages" buttonLabel="画像を追加" onChange={handleAttachmentChange} />
                        <FileUploadTrigger accept="audio/*" multiple inputName="ideaAudio" buttonLabel="音声を追加" onChange={handleAttachmentChange} />
                        <FileUploadTrigger accept="video/*" multiple inputName="ideaVideo" buttonLabel="動画を追加" onChange={handleAttachmentChange} />
                      </div>

                      {attachments.length > 0 ? (
                        <div className={styles.attachmentList}>
                          {attachments.map((attachment) => (
                            <div key={attachment.id} className={styles.attachmentItem}>
                              <div className={styles.attachmentMeta}>
                                <div className={styles.attachmentName}>{attachment.name}</div>
                                <div className={styles.attachmentSub}>{attachment.mimeType} / {formatFileSize(attachment.sizeBytes)}</div>
                                <div className={styles.badgeRow}>
                                  <span className={styles.badge}>{attachment.kind.toUpperCase()}</span>
                                </div>
                              </div>
                              <button type="button" className={styles.smallButton} onClick={() => setAttachments((prev) => prev.filter((item) => item.id !== attachment.id))}>
                                削除
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className={`${styles.actionsRow} ${styles.centeredActions}`}>
                        <button type="button" className={styles.primaryButton} onClick={handleStartGeneration} disabled={!canStartPhase1 || isGenerating || isPromptLoading || Boolean(hookPreview)}>
                          {hookPreview ? 'ステップ1 生成済み' : isPhase1Generating ? '生成中...' : 'プロローグ（仮）を生成'}
                        </button>
                        {isPhase1Generating ? (
                          <button type="button" className={styles.dangerButton} onClick={handleStopGeneration}>
                            停止
                          </button>
                        ) : null}
                        {failedPhase === 'phase1' ? (
                          <button type="button" className={styles.secondaryButton} onClick={handleRetryFromFailedPhase} disabled={isGenerating}>
                            失敗地点から必要分を再実行
                          </button>
                        ) : null}
                      </div>

                      {hookPreview ? (
                        <div className={styles.inlinePhaseOutput}>
                          <div className={styles.outputPanelHeader}>
                            <strong>プロローグ（仮）</strong>
                          </div>
                          <pre className={styles.outputPreviewWide}>{hookPreview}</pre>
                          <div className={styles.outputControlsRight}>
                            {artifacts.phase1 ? (
                              <button type="button" className={styles.smallButton} onClick={() => downloadTextFile(artifacts.phase1!.fileName, artifacts.phase1!.markdown)}>
                                Markdown を保存
                              </button>
                            ) : null}
                            <button type="button" className={styles.smallButton} onClick={() => toggleOutputPhase('phase1')}>
                              {openOutputPhases.phase1 ? 'コンセプト設計の全文を非表示' : 'コンセプト設計の全文を表示'}
                            </button>
                          </div>
                          {openOutputPhases.phase1 && phaseOutputs.phase1 ? (
                            executionMode === 'step' ? (
                              <textarea
                                id="phase1-output-editor"
                                name="phase1Output"
                                className={styles.outputEditor}
                                style={{ marginTop: 14 }}
                                value={phaseOutputs.phase1}
                                onChange={(event) => updatePhaseOutputText('phase1', event.target.value)}
                              />
                            ) : (
                              <pre className={styles.outputPreviewWide} style={{ marginTop: 14 }}>{phaseOutputs.phase1}</pre>
                            )
                          ) : null}
                          <div className={styles.actionsRow} style={{ marginTop: 16 }}>
                            <button type="button" className={styles.secondaryButton} onClick={() => void withGenerationGuard(runPhase1)} disabled={isGenerating}>
                              ステップ1 を再生成
                            </button>
                            <button type="button" className={styles.primaryButton} onClick={handleApproveHook} disabled={isGenerating || hookApproved}>
                              {hookApproved ? '承認済み' : 'この内容で続行'}
                            </button>
                            {isPhase1Generating ? (
                              <button type="button" className={styles.dangerButton} onClick={handleStopGeneration}>
                                停止
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className={styles.phaseList}>
                  {PHASE_DEFINITIONS.filter((phase) => phase.id !== 'phase1').map((phase) => (
                    <div key={phase.id} className={styles.phaseBlock}>
                      <button type="button" className={styles.phaseToggle} onClick={() => togglePhaseSection(phase.id)}>
                        <div className={styles.phaseToggleMeta}>
                          <div className={styles.downloadTitle}>{phase.label}</div>
                          <span className={`${styles.statusBadge} ${statusClassMap[phaseStatuses[phase.id]]}`}>{statusLabelMap[phaseStatuses[phase.id]]}</span>
                        </div>
                        <span className={styles.phaseToggleIcon}>{openPhaseSections[phase.id] ? '▲' : '▼'}</span>
                      </button>

                      {openPhaseSections[phase.id] ? (
                        <div className={styles.phaseContent}>
                          {phaseOutputs[phase.id] ? (
                            <div className={styles.inlineActions}>
                              <button type="button" className={styles.smallButton} onClick={() => toggleOutputPhase(phase.id)}>
                                {openOutputPhases[phase.id] ? '出力を非表示' : '出力を表示'}
                              </button>
                            </div>
                          ) : null}

                          {pendingPhase === phase.id || runningPhaseId === phase.id || failedPhase === phase.id ? (
                            <div className={`${styles.actionsRow} ${styles.centeredActions}`}>
                              {pendingPhase === phase.id ? (
                                <button
                                  type="button"
                                  className={styles.primaryButton}
                                  onClick={() => void withGenerationGuard(phase.id === 'phase4' ? runPhase4FromCurrentState : runNextPendingPhase)}
                                  disabled={isGenerating}
                                >
                                  {runningPhaseId === phase.id ? '実行中' : '実行'}
                                </button>
                              ) : null}
                              {runningPhaseId === phase.id ? (
                                <button type="button" className={styles.dangerButton} onClick={handleStopGeneration}>
                                  停止
                                </button>
                              ) : null}
                              {failedPhase === phase.id ? (
                                <button type="button" className={styles.secondaryButton} onClick={handleRetryFromFailedPhase} disabled={isGenerating}>
                                  失敗地点から必要分を再実行
                                </button>
                              ) : null}
                            </div>
                          ) : null}

                          {openOutputPhases[phase.id] ? (
                            <div className={styles.outputPanel}>
                              <div className={styles.outputPanelHeader}>
                                <strong>{PHASE_DEFINITIONS.find((item) => item.id === phase.id)?.label}</strong>
                                <div className={styles.inlineActions}>
                                  {phase.id === 'phase3a' || phase.id === 'phase3b' ? (
                                    artifacts[phase.id] ? (
                                      <button type="button" className={styles.smallButton} onClick={() => downloadTextFile(artifacts[phase.id]!.fileName, artifacts[phase.id]!.markdown)}>
                                        Markdown を保存
                                      </button>
                                    ) : null
                                  ) : null}
                                  {phase.id === 'phase2' ? titledPhase2Files.filter((file) => file.text.trim()).map((file) => (
                                    <button key={file.fileName} type="button" className={styles.smallButton} onClick={() => downloadTextFile(file.fileName, file.text, file.mimeType)}>
                                      {file.title}
                                    </button>
                                  )) : null}
                                  {phase.id === 'phase4' ? finalFiles.filter((file) => file.text.trim()).map((file) => (
                                    <button key={file.fileName} type="button" className={styles.smallButton} onClick={() => downloadTextFile(file.fileName, file.text, file.mimeType)}>
                                      {file.title}
                                    </button>
                                  )) : null}
                                </div>
                              </div>
                              {executionMode === 'step' ? (
                                <textarea
                                  id={`${phase.id}-output-editor`}
                                  name={`${phase.id}Output`}
                                  className={styles.outputEditor}
                                  value={phaseOutputs[phase.id] || ''}
                                  onChange={(event) => updatePhaseOutputText(phase.id, event.target.value)}
                                />
                              ) : (
                                <pre className={styles.outputPreviewWide}>{phaseOutputs[phase.id]}</pre>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                {generationError ? <p className={styles.errorText} style={{ marginTop: 18 }}>{generationError}</p> : null}
              </div>
            </section>
          </aside>
        </div>
      </div>

      {appConfirm && (
        <div onClick={() => closeAppConfirm(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', backdropFilter: 'blur(6px)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--glass-bg, rgba(255,255,255,0.9))', backdropFilter: 'blur(24px)', border: '1px solid var(--glass-border, rgba(0,0,0,0.1))', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '420px', boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: 0, color: 'var(--text-main, #111)', fontSize: '1rem', letterSpacing: '1.6px' }}>{appConfirm.title}</h3>
            <p style={{ margin: '0.8rem 0 1.5rem', color: 'var(--text-main, #111)', fontSize: '0.92rem', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{appConfirm.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => closeAppConfirm(false)} style={{ background: 'transparent', color: 'var(--text-main, #111)', border: '1px solid var(--glass-border, rgba(0,0,0,0.15))', borderRadius: '999px', padding: '0.72rem 1.5rem', fontSize: '0.9rem', cursor: 'pointer', minWidth: '108px' }}>{appConfirm.cancelLabel}</button>
              <button onClick={() => closeAppConfirm(true)} style={{ background: appConfirm.danger ? '#b91c1c' : '#111', color: '#fff', border: 'none', borderRadius: '999px', padding: '0.72rem 1.5rem', fontSize: '0.9rem', cursor: 'pointer', minWidth: '108px', fontWeight: 700 }}>{appConfirm.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
