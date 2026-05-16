'use client';
/* eslint-disable @next/next/no-img-element */
import React, { useState, useEffect, useRef, useMemo, useImperativeHandle, useEffectEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import '@xyflow/react/dist/style.css';
import MapFlowCanvas, { MAP_NODE_LEGEND_ITEMS } from '@/components/MapFlowCanvas';
import { logClientViolation, requestAvatarPromptApi, requestChatApi } from '@/lib/geminiClient';
import {
  DEFAULT_MAP_LAYER_NAME,
  DEFAULT_MAP_STATE,
  getMapLayerNames,
  getMapNodeLabel,
  normalizeMapPayload,
  normalizeStoredMapState,
  parseMapState,
  type GraphMapLayer,
  type GraphMapState,
  type MapCurrentPos,
} from '@/lib/mapGraph';
import styles from './page.module.css';

// --- SVG Icons ---
const IconImage = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', marginBottom: '-3px' }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>;
const IconFile = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', marginBottom: '-3px' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>;
const IconRefresh = ({ size = 12 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>;
const IconMap = ({ size = 14, style }: { size?: number; style?: React.CSSProperties }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', marginBottom: '-2px', ...style }}><path d="M1 6v12l7-4 8 4 7-4V2l-7 4-8-4-7 4z"></path><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>;
const BetaBadge = () => <span style={{ fontSize: '0.58rem', letterSpacing: '1.4px', fontWeight: 700, padding: '2px 6px', borderRadius: '999px', background: '#f59e0b', color: '#111827' }}>BETA</span>;

const IDB_STORE = 'chatnoir_saves';
const SCENARIO_STORE = 'scenario_master';
const API_KEY_STORAGE_KEY = 'chatnoir_apiKey';
const API_KEY_STORAGE_MODE_KEY = 'chatnoir_apiKeyStorageMode';
const SUPPORT_AVATAR_PATH = 'Chibi-style_close-up_face_portrait_of_an_anime_gir-1775997248547.png';
const DEFAULT_SUPPORT_PERSONA_PATH = 'support-personas/lore-support.md';
const DEFAULT_SAMPLE_COVER_PATH = 'package.png';
const APP_LOGO_PATH = 'logo.png';
const APP_LOGO_WIDE_PATH = 'logo_yoko.png';
const SUPPORT_SUGGESTION_PROMPT = '今の状況で次に入力すると良さそうな文を3つ提案して。';
const SCENARIO_DEBUG_PROMPT = [
  'あなたはプレイヤーの代わりに、次に送る入力を1つだけ決めてください。',
  'まず「なぜその入力にするか」を簡潔に説明し、そのあとに実際に送る入力文を1つだけ示してください。'
].join('\n');
const SUPPORT_HISTORY_MAX_MESSAGES = 18;
const SUPPORT_HISTORY_MAX_CHARS = 12000;

const resolvePublicAssetPath = (path: string): string => {
  if (!path) return '';
  if (path.startsWith('data:') || path.startsWith('blob:') || /^[a-z]+:\/\//i.test(path)) {
    return path;
  }
  return path.replace(/^\/+/, '');
};

// --- Chat Input Component ---
interface ChatInputHandle {
  setValue: (text: string) => void;
  appendValue: (prefix: string, suffix: string) => void;
  focus: () => void;
  getCurrentText: () => string;
  clear: () => void;
}

const ChatInput = React.forwardRef<ChatInputHandle, {
  onSend: (text: string) => void;
  disabled: boolean;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  sendTrigger?: 'enter' | 'ctrl-enter';
}>(({ onSend, disabled, className, style, placeholder, sendTrigger = 'enter' }, ref) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const updateHeight = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useImperativeHandle(ref, () => ({
    setValue: (newText: string) => {
      setText(newText);
      setTimeout(() => { if (textareaRef.current) updateHeight(textareaRef.current); }, 0);
    },
    appendValue: (prefix: string, suffix: string) => {
      setText(prev => {
        const newText = prev + prefix + suffix;
        setTimeout(() => {
          if (textareaRef.current) {
            updateHeight(textareaRef.current);
            const pos = newText.length - suffix.length;
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(pos, pos);
          }
        }, 10);
        return newText;
      });
    },
    focus: () => textareaRef.current?.focus(),
    getCurrentText: () => text,
    clear: () => {
      setText('');
      setTimeout(() => { if (textareaRef.current) textareaRef.current.style.height = 'auto'; }, 0);
    },
  }));

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    updateHeight(e.target);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isEnter = e.key === 'Enter';
    const shouldSend = sendTrigger === 'ctrl-enter'
      ? isEnter && (e.ctrlKey || e.metaKey)
      : isEnter && !e.shiftKey;
    if (shouldSend) {
      e.preventDefault();
      if (!disabled && text.trim()) {
        const current = text;
        setText('');
        setTimeout(() => { if (textareaRef.current) textareaRef.current.style.height = 'auto'; }, 0);
        onSend(current);
      }
    }
  };

  return (
    <textarea
      ref={textareaRef}
      className={className}
      style={style}
      placeholder={placeholder}
      value={text}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      disabled={disabled}
    />
  );
});
ChatInput.displayName = 'ChatInput';

const FileUploadTrigger = ({
  accept,
  onChange,
  buttonLabel,
  multiple = false,
  fullWidth = false,
  helperText,
}: {
  accept: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  buttonLabel?: string;
  multiple?: boolean;
  fullWidth?: boolean;
  helperText?: string;
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', alignItems: fullWidth ? 'stretch' : 'flex-start' }}>
      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: fullWidth ? '100%' : 'auto',
          minHeight: '40px',
          padding: '0.75rem 1rem',
          borderRadius: '6px',
          border: '1px solid var(--border-color)',
          background: 'var(--bg-color)',
          color: 'var(--text-main)',
          cursor: 'pointer',
          fontSize: '0.8rem',
          letterSpacing: '0.6px',
          textAlign: 'center',
        }}
      >
        <input type="file" accept={accept} multiple={multiple} onChange={onChange} style={{ display: 'none' }} />
        {buttonLabel || (multiple ? 'ファイルをまとめて選ぶ' : 'ファイルを選ぶ')}
      </label>
      {helperText ? (
        <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{helperText}</p>
      ) : null}
    </div>
  );
};

type GameState = 'WELCOME' | 'SAVES' | 'LOGIN' | 'BRIEFING' | 'PLAYING';
type EndingPhase = 'NONE' | 'READY_TO_END' | 'FADE_OUT' | 'MENU' | 'REVIEW';
type ThemeMode = 'light' | 'dark';
type FontFamily = 'serif' | 'sans' | 'klee';
type MapUpdateMode = 'merge' | 'replace';

interface MessagePart {
  text: string;
}

interface AppMessage {
  role: 'user' | 'model';
  parts: MessagePart[];
  isGm?: boolean;
  isHidden?: boolean;
  kind?: string;
  hasSpeakerWarning?: boolean;
}

interface CharacterData {
  true_name?: string;
  is_name_known_to_player?: boolean;
  name: string;
  gender?: string;
  info: string;
  image: string | null;
  isGenerating: boolean;
  lastPrompt?: string;
}

interface CharacterSummary {
  true_name?: string;
  is_name_known_to_player?: boolean;
  name: string;
  gender?: string;
  info: string;
}

interface ScenarioMetaData {
  title?: string;
  protagonistName?: string;
  protagonistFirstPerson?: string;
}

interface AutoSaveMeta {
  key: string;
  coverImage: string;
  saveName: string;
  lastPlay?: string;
}

interface ScenarioMasterData {
  title: string;
  isSample?: boolean;
  gmRuleText?: string;
  scenarioText?: string;
  briefingText?: string;
  prologueText?: string;
  mapFileText?: string;
  mapLayers?: Record<string, GraphMapLayer>;
  currentPos?: MapCurrentPos;
  coverImage?: string;
  scenarioMeta?: ScenarioMetaData;
  lastUpdated: string;
}

interface MapOperationPayload {
  mode?: MapUpdateMode;
  reason?: string;
}

interface SidebarOpenSections {
  howTo: boolean;
  monologue: boolean;
  characters: boolean;
  facts: boolean;
  mysteries: boolean;
  memo: boolean;
}

interface StoredGameState {
  gameState?: GameState;
  messages?: AppMessage[];
  gmRuleText?: string;
  supportPersonaPath?: string;
  scenarioText?: string;
  briefingText?: string;
  prologueText?: string;
  mapFileText?: string;
  coverImage?: string;
  charactersData?: CharacterData[];
  factsData?: string[];
  mysteriesData?: string[];
  monologueData?: string[];
  theme?: ThemeMode;
  scenarioTitle?: string;
  scenarioMeta?: ScenarioMetaData;
  fontFamily?: FontFamily;
  fontSize?: number;
  isVertical?: boolean;
  sidebarWidth?: number;
  leftSidebarWidth?: number;
  isSidebarOpen?: boolean;
  sessionRunId?: string;
  saveName?: string;
  playerMemo?: string;
  openSections?: SidebarOpenSections;
  endingPhase?: EndingPhase;
  reviewMessages?: AppMessage[];
  gmInputText?: string;
  isGmModalOpen?: boolean;
  supportMessages?: AppMessage[];
  supportStorySnapshots?: SupportStorySnapshot[];
  supportSuggestions?: string[];
  supportInputText?: string;
  fallbackEnabled?: boolean;
  isSupportSidebarOpen?: boolean;
  isSupportModalOpen?: boolean;
  lastPlay?: string;
}

type ApiKeyStorageMode = 'session' | 'local';

interface SpecialCommandPayload {
  characters?: CharacterSummary[];
  facts?: string[];
  mysteries?: string[];
  monologue?: string;
  mapOperation?: MapOperationPayload;
  map?: unknown;
}

type SupportStorySnapshot = {
  visibleMsgCount: number;
  gmMsgCount: number;
  openMysteries: string[];
};

type SupportResponseResult = {
  text: string;
  suggestions: string[];
  action: string;
};

const DEFAULT_OPEN_SECTIONS: SidebarOpenSections = {
  howTo: true,
  monologue: true,
  characters: true,
  facts: true,
  mysteries: true,
  memo: true
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const getString = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;

const getNumber = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const isGameState = (value: unknown): value is GameState => value === 'WELCOME' || value === 'SAVES' || value === 'LOGIN' || value === 'BRIEFING' || value === 'PLAYING';

const isEndingPhase = (value: unknown): value is EndingPhase => value === 'NONE' || value === 'READY_TO_END' || value === 'FADE_OUT' || value === 'MENU' || value === 'REVIEW';

const isThemeMode = (value: unknown): value is ThemeMode => value === 'light' || value === 'dark';

const isFontFamily = (value: unknown): value is FontFamily => value === 'serif' || value === 'sans' || value === 'klee';

const isMapUpdateMode = (value: unknown): value is MapUpdateMode => value === 'merge' || value === 'replace';

const toStringArray = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string')
  : [];

const normalizeMessage = (value: unknown): AppMessage | null => {
  if (!isRecord(value)) return null;

  const role = value.role === 'user' || value.role === 'model' ? value.role : null;
  if (!role) return null;

  const parts = Array.isArray(value.parts)
    ? value.parts
        .filter((part): part is Record<string, unknown> => isRecord(part))
        .map((part) => ({ text: getString(part.text) || '' }))
    : [];

  return {
    role,
    parts: parts.length > 0 ? parts : [{ text: '' }],
    isGm: value.isGm === true,
    isHidden: value.isHidden === true,
    kind: getString(value.kind)
  };
};

const toMessageArray = (value: unknown): AppMessage[] => Array.isArray(value)
  ? value
      .map((message) => normalizeMessage(message))
      .filter((message): message is AppMessage => Boolean(message))
  : [];

const normalizeCharacterData = (value: unknown): CharacterData | null => {
  if (!isRecord(value)) return null;

  const name = getString(value.name)?.trim();
  if (!name) return null;

  return {
    true_name: getString(value.true_name),
    is_name_known_to_player: typeof value.is_name_known_to_player === 'boolean' ? value.is_name_known_to_player : undefined,
    name,
    gender: getString(value.gender),
    info: getString(value.info) || '',
    image: getString(value.image) || null,
    isGenerating: value.isGenerating === true,
    lastPrompt: getString(value.lastPrompt)
  };
};

const normalizeCharacterSummary = (value: unknown): CharacterSummary | null => {
  if (!isRecord(value)) return null;

  const name = getString(value.name)?.trim();
  if (!name) return null;

  return {
    true_name: getString(value.true_name),
    is_name_known_to_player: typeof value.is_name_known_to_player === 'boolean' ? value.is_name_known_to_player : undefined,
    name,
    gender: getString(value.gender),
    info: getString(value.info) || ''
  };
};

const toCharacterArray = (value: unknown): CharacterData[] => Array.isArray(value)
  ? value
      .map((item) => normalizeCharacterData(item))
      .filter((item): item is CharacterData => Boolean(item))
  : [];

const getCharacterIdentity = (character: Pick<CharacterSummary, 'true_name' | 'name'>): string => {
  const normalizedTrueName = (character.true_name || '').replace(/\s+/g, '');
  if (normalizedTrueName) return `true:${normalizedTrueName}`;

  const normalizedDisplayName = (character.name || '').replace(/\s+/g, '');
  return `name:${normalizedDisplayName}`;
};

const normalizeScenarioMetaData = (value: unknown): ScenarioMetaData => {
  if (!isRecord(value)) return {};

  return {
    title: getString(value.title),
    protagonistName: getString(value.protagonistName),
    protagonistFirstPerson: getString(value.protagonistFirstPerson)
  };
};

const normalizeUploadedScenarioMeta = (value: unknown): ScenarioMetaData | null => {
  if (!isRecord(value)) return null;

  const title = getString(value.title)?.trim();
  const protagonistName = (getString(value.protagonist_name) || getString(value.protagonistName))?.trim();
  const protagonistFirstPerson = (getString(value.protagonist_first_person) || getString(value.protagonistFirstPerson))?.trim();

  if (!title && !protagonistName && !protagonistFirstPerson) {
    return null;
  }

  return {
    title,
    protagonistName,
    protagonistFirstPerson,
  };
};

const extractScenarioMetaFromText = (text: string): ScenarioMetaData | null => {
  const jsonBlocks = Array.from(text.matchAll(/```json\s*([\s\S]*?)```/gi), (match) => match[1]?.trim() || '')
    .filter((candidate) => candidate.length > 0);
  const candidates = jsonBlocks.length > 0 ? jsonBlocks : [text.trim()];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const normalizedMeta = normalizeUploadedScenarioMeta(parsed);
      if (normalizedMeta) {
        return normalizedMeta;
      }
    } catch {
      continue;
    }
  }

  return null;
};

const mergeScenarioMetaData = (currentMeta: ScenarioMetaData, nextMeta: ScenarioMetaData): ScenarioMetaData => ({
  title: nextMeta.title || currentMeta.title,
  protagonistName: nextMeta.protagonistName || currentMeta.protagonistName,
  protagonistFirstPerson: nextMeta.protagonistFirstPerson || currentMeta.protagonistFirstPerson,
});

const hasRequiredScenarioMeta = (value: ScenarioMetaData): boolean => {
  return Boolean(value.protagonistName?.trim() && value.protagonistFirstPerson?.trim());
};

const normalizeSupportStorySnapshot = (value: unknown): SupportStorySnapshot | null => {
  if (!isRecord(value)) return null;

  const visibleMsgCount = getNumber(value.visibleMsgCount);
  const gmMsgCount = getNumber(value.gmMsgCount);
  if (visibleMsgCount === undefined || gmMsgCount === undefined) return null;

  return {
    visibleMsgCount,
    gmMsgCount,
    openMysteries: toStringArray(value.openMysteries)
  };
};

const normalizeMapOperationPayload = (value: unknown): MapOperationPayload | undefined => {
  if (!isRecord(value)) return undefined;

  const mode = isMapUpdateMode(value.mode) ? value.mode : undefined;
  const reason = getString(value.reason);

  if (!mode && !reason) return undefined;

  return {
    mode,
    reason
  };
};

const normalizeSidebarOpenSections = (value: unknown): SidebarOpenSections | undefined => {
  if (!isRecord(value)) return undefined;

  return {
    howTo: value.howTo !== false,
    monologue: value.monologue !== false,
    characters: value.characters !== false,
    facts: value.facts !== false,
    mysteries: value.mysteries !== false,
    memo: value.memo !== false
  };
};

const toSupportStorySnapshots = (value: unknown): SupportStorySnapshot[] => Array.isArray(value)
  ? value
      .map((item) => normalizeSupportStorySnapshot(item))
      .filter((item): item is SupportStorySnapshot => Boolean(item))
  : [];

const normalizeScenarioMasterData = (title: string, value: unknown): ScenarioMasterData => {
  const record = isRecord(value) ? value : {};
  const normalizedMapState = record.mapLayers
    ? normalizeMapPayload({ layers: record.mapLayers, currentPos: record.currentPos })
    : null;

  return {
    title,
    gmRuleText: getString(record.gmRuleText),
    scenarioText: getString(record.scenarioText),
    briefingText: getString(record.briefingText),
    prologueText: getString(record.prologueText),
    mapFileText: getString(record.mapFileText),
    mapLayers: normalizedMapState?.layers,
    currentPos: normalizedMapState?.currentPos,
    coverImage: getString(record.coverImage),
    scenarioMeta: normalizeScenarioMetaData(record.scenarioMeta),
    lastUpdated: getString(record.lastUpdated) || new Date(0).toISOString()
  };
};

const normalizeStoredGameState = (value: unknown): StoredGameState => {
  const record = isRecord(value) ? value : {};
  const rawMonologueData = record.monologueData;

  return {
    gameState: isGameState(record.gameState) ? record.gameState : undefined,
    messages: toMessageArray(record.messages),
    gmRuleText: getString(record.gmRuleText),
    supportPersonaPath: getString(record.supportPersonaPath),
    scenarioText: getString(record.scenarioText),
    briefingText: getString(record.briefingText),
    prologueText: getString(record.prologueText),
    mapFileText: getString(record.mapFileText),
    coverImage: getString(record.coverImage),
    charactersData: toCharacterArray(record.charactersData),
    factsData: toStringArray(record.factsData),
    mysteriesData: toStringArray(record.mysteriesData),
    monologueData: typeof rawMonologueData === 'string' ? [rawMonologueData] : toStringArray(rawMonologueData),
    theme: isThemeMode(record.theme) ? record.theme : undefined,
    scenarioTitle: getString(record.scenarioTitle),
    scenarioMeta: normalizeScenarioMetaData(record.scenarioMeta),
    fontFamily: isFontFamily(record.fontFamily) ? record.fontFamily : undefined,
    fontSize: getNumber(record.fontSize),
    isVertical: typeof record.isVertical === 'boolean' ? record.isVertical : undefined,
    sidebarWidth: getNumber(record.sidebarWidth),
    leftSidebarWidth: getNumber(record.leftSidebarWidth),
    isSidebarOpen: typeof record.isSidebarOpen === 'boolean' ? record.isSidebarOpen : undefined,
    sessionRunId: getString(record.sessionRunId),
    saveName: getString(record.saveName),
    playerMemo: getString(record.playerMemo),
    openSections: normalizeSidebarOpenSections(record.openSections),
    endingPhase: isEndingPhase(record.endingPhase) ? record.endingPhase : undefined,
    reviewMessages: toMessageArray(record.reviewMessages),
    gmInputText: getString(record.gmInputText),
    isGmModalOpen: record.isGmModalOpen === true,
    supportMessages: toMessageArray(record.supportMessages),
    supportStorySnapshots: toSupportStorySnapshots(record.supportStorySnapshots),
    supportSuggestions: toStringArray(record.supportSuggestions),
    supportInputText: getString(record.supportInputText),
    fallbackEnabled: typeof record.fallbackEnabled === 'boolean' ? record.fallbackEnabled : undefined,
    isSupportSidebarOpen: record.isSupportSidebarOpen === true,
    isSupportModalOpen: record.isSupportModalOpen === true,
    lastPlay: getString(record.lastPlay)
  };
};

const normalizeSpecialCommandPayload = (value: unknown): SpecialCommandPayload => {
  const record = isRecord(value) ? value : {};

  return {
    characters: Array.isArray(record.characters)
      ? record.characters
          .map((character) => normalizeCharacterSummary(character))
          .filter((character): character is CharacterSummary => Boolean(character))
      : undefined,
    facts: Array.isArray(record.facts) ? toStringArray(record.facts) : undefined,
    mysteries: Array.isArray(record.mysteries) ? toStringArray(record.mysteries) : undefined,
    monologue: getString(record.monologue),
    mapOperation: normalizeMapOperationPayload(record.mapOperation),
    map: record.map
  };
};

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) return error.name === 'AbortError';
  return error instanceof Error && error.name === 'AbortError';
};

const isApiKeyStorageMode = (value: unknown): value is ApiKeyStorageMode => value === 'session' || value === 'local';

const readStoredApiKey = (): { apiKey: string; mode: ApiKeyStorageMode } => {
  try {
    const sessionApiKey = sessionStorage.getItem(API_KEY_STORAGE_KEY);
    if (sessionApiKey) return { apiKey: sessionApiKey, mode: 'session' };

    const localApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (localApiKey) return { apiKey: localApiKey, mode: 'local' };

    const savedMode = localStorage.getItem(API_KEY_STORAGE_MODE_KEY);
    if (isApiKeyStorageMode(savedMode)) return { apiKey: '', mode: savedMode };
  } catch {
    // ignore storage access errors
  }

  return { apiKey: '', mode: 'session' };
};

const persistApiKey = (apiKey: string, mode: ApiKeyStorageMode) => {
  const trimmedApiKey = apiKey.trim();

  try {
    localStorage.setItem(API_KEY_STORAGE_MODE_KEY, mode);

    if (mode === 'local') {
      if (trimmedApiKey) {
        localStorage.setItem(API_KEY_STORAGE_KEY, trimmedApiKey);
      } else {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
      }
      sessionStorage.removeItem(API_KEY_STORAGE_KEY);
      return;
    }

    if (trimmedApiKey) {
      sessionStorage.setItem(API_KEY_STORAGE_KEY, trimmedApiKey);
    } else {
      sessionStorage.removeItem(API_KEY_STORAGE_KEY);
    }
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    // ignore storage access errors
  }
};

async function getIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open('ChatNoirDB', 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
      if (!req.result.objectStoreNames.contains(SCENARIO_STORE)) {
        req.result.createObjectStore(SCENARIO_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveToIDB<T>(key: string, val: T) {
  try {
    const db = await getIDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(val, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) { console.error(e); }
}

async function loadFromIDB<T>(key: string): Promise<T | null> {
  try {
    const db = await getIDB();
    return new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}

async function getAllIDBSavesMeta(): Promise<AutoSaveMeta[]> {
  try {
    const db = await getIDB();
    return new Promise<AutoSaveMeta[]>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.openCursor();
      const metaList: AutoSaveMeta[] = [];
      req.onsuccess = () => {
        const cursor = req.result as IDBCursorWithValue | null;
        if (cursor) {
          const key = cursor.key as string;
          if (key.startsWith('auto_save_')) {
            const value = isRecord(cursor.value) ? cursor.value : {};
            metaList.push({
              key,
              coverImage: getString(value.coverImage) || '',
              saveName: getString(value.saveName) || '',
              lastPlay: getString(value.lastPlay) || ''
            });
          }
          cursor.continue();
        } else {
          resolve(metaList);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}

async function scrubApiKeysFromIDB(): Promise<void> {
  try {
    const db = await getIDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.openCursor();

      req.onsuccess = () => {
        const cursor = req.result as IDBCursorWithValue | null;
        if (!cursor) {
          resolve();
          return;
        }

        const value = isRecord(cursor.value) ? { ...cursor.value } : null;
        if (value && 'apiKey' in value) {
          delete value.apiKey;
          cursor.update(value);
        }
        cursor.continue();
      };

      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore IndexedDB cleanup errors
  }
}

async function deleteFromIDB(key: string): Promise<void> {
  try {
    const db = await getIDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) { console.error(e); }
}

// --- Scenario Master Helpers ---
async function saveScenarioMaster<T>(title: string, data: T) {
  try {
    const db = await getIDB();
    const tx = db.transaction(SCENARIO_STORE, 'readwrite');
    const store = tx.objectStore(SCENARIO_STORE);
    await new Promise((resolve, reject) => {
      const req = store.put(data, title);
      req.onsuccess = resolve;
      req.onerror = reject;
    });
  } catch (e) { console.error(e); }
}

async function getAllScenarioMasters(): Promise<ScenarioMasterData[]> {
  try {
    const db = await getIDB();
    return new Promise<ScenarioMasterData[]>((resolve, reject) => {
      const tx = db.transaction(SCENARIO_STORE, 'readonly');
      const store = tx.objectStore(SCENARIO_STORE);
      const req = store.openCursor();
      const list: ScenarioMasterData[] = [];
      req.onsuccess = () => {
        const cursor = req.result as IDBCursorWithValue | null;
        if (cursor) {
          list.push(normalizeScenarioMasterData(String(cursor.key), cursor.value));
          cursor.continue();
        } else {
          resolve(list);
        }
      };
      req.onerror = reject;
    });
  } catch { return []; }
}

// 小説風のテキスト整形ユーティリティ（セリフ以外の段落に全角スペースを補完）
const formatNovelText = (text: string, isVertical: boolean) => {
  if (!text) return '';
  let lines = text.replace(/\\n/g, '\n').split('\n');
  lines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Markdown装飾等は字下げ無視
    if (/^[#\-\*>`]/.test(trimmed) || /^!\[/.test(trimmed) || /^\[/.test(trimmed) || /^\d+\./.test(trimmed)) {
      if (/^#+\s/.test(trimmed)) {
        // 「 - ゲーム概要」「 - 概要」などの不要な接尾辞を削除
        return line.replace(/\s*-\s*(ゲーム概要|概要|設定|プロローグ|物語概要)\s*$/, '');
      }
      return line;
    }

    // 会話や特殊括弧の始まりは字下げしない
    if (/^[「『（(\【]/.test(trimmed)) return line;
    // 既存の **名前**「セリフ」や **名前**（心の声） は字下げしない
    if (/^\*\*[^*]+\*\*[「『（]/.test(trimmed) || /^\*\*[^*]+\*\*$/.test(trimmed)) return line;

    // すでに空白で始まっている場合はそのまま
    if (/^[　\s]/.test(line)) return line;

    return '　' + line;
  });
  let formatted = lines.join('\n');

  if (isVertical) {
    // 半角記号→全角（縦書きで横倒しにならないよう変換）
    formatted = formatted.replace(/!(?!\[)/g, '！').replace(/\?(?!\[)/g, '？');
    // 三点リーダーを縦書き用に変換
    formatted = formatted.replace(/\.{3}/g, '…').replace(/…/g, '︙');
    // ダッシュ（―、—）を縦書き用の罫線（︱: 縦書き用ダッシュ）に変換して中央配置
    formatted = formatted.replace(/[―—]/g, '︱');
    // クォーテーションをダブルミニュート（縦書き対応）に変換
    let count = 0;
    formatted = formatted.replace(/"/g, () => (count++ % 2 === 0 ? '〝' : '〟'));
    // 半角英数字→全角（a-z, A-Z, 0-9）で横倒し防止
    formatted = formatted.replace(/[a-zA-Z0-9]/g, (ch) => {
      const code = ch.charCodeAt(0);
      return String.fromCharCode(code + 0xFEE0);
    });
  }
  return formatted;
};

// 地図(MAP)の更新ルール (graph JSON版)
const MAP_INSTRUCTION = `
【地図(MAP)の更新ルール】
あなたは物語の舞台を「graph JSON」で管理しています。
システムから地図更新の依頼があった場合、以下のJSON形式で、現在主人公が把握している繋がりをすべて出力してください。

JSON構造:
{
  "map": {
    "currentPos": {"nodeId": "node_id", "layer": "レイヤー名"},
    "layers": {
      "全体マップ": {
        "direction": "LR",
        "nodes": [
          { "id": "home", "label": "自宅", "kind": "place", "status": "visited" },
          { "id": "main_road", "label": "県道", "kind": "route", "status": "known" }
        ],
        "edges": [
          { "id": "edge_1", "source": "home", "target": "main_road", "kind": "path", "bidirectional": true }
        ]
      }
    }
  }
}

- layer: マップのシート名（例：「全体マップ」「洋館 1F」など）。
- nodeId: 現在主人公が立っている場所のノードID。
- layers: レイヤー名ごとの地図データです。通常は「全体マップ」を含めてください。
- layer の分け方は、プレイヤーが頭の中で「別の見取り図として管理した方が自然か」で判断してください。
- 屋外の広域移動や街・村・敷地全体の関係は、通常「全体マップ」にまとめてください。
- 建物の内部、ダンジョン、屋敷、学校、病院、駅構内などは、外の全体マップとは別レイヤーにしてください。
- 階段やエレベーターなどで階層が分かれる建物は、「洋館 1F」「洋館 2F」「地下通路」のように階や区域ごとにレイヤーを分けてください。
- 夢の中、異界、裏世界、回想空間など、通常空間とルールが違う場所は別レイヤーにしてください。
- 逆に、同じ建物や同じフロアの情報なら、細かく分けすぎず1つのレイヤーにまとめてください。
- 新しい場所が既存レイヤーに自然に収まるならそのレイヤーへ追加し、別の見取り図として扱うべきときだけ新しいレイヤーを作ってください。
- direction: "LR" または "TD" を使用してください。
- direction は見やすさ優先で選んでください。一本道が長く横一直線になりそうな場合や、階層・上下移動が中心の地図では "TD" を選んで構いません。LR に固定しないでください。
- nodes: 主人公が把握している場所や通路の一覧です。id は英数字とアンダースコア中心の安全な識別子にしてください。
- edges: ノード同士の接続です。道・廊下・階段・門など、移動の意味がわかるように必要なら中継ノードを挟んでください。
- status: visited / known / unknown を使ってください。
- kind: place / route / room / corridor / stairs / junction などの分類を使えます。
- まだ主人公が知らない場所や接続は絶対に含めないでください。
`;

const cloneDefaultMapState = (): GraphMapState => structuredClone(DEFAULT_MAP_STATE);
const cloneDefaultMapLayers = (): Record<string, GraphMapLayer> => structuredClone(DEFAULT_MAP_STATE.layers);
const cloneDefaultCurrentPos = (): MapCurrentPos => ({ ...DEFAULT_MAP_STATE.currentPos! });

export default function ChatNoir() {
  const [apiKey, setApiKey] = useState('');
  const [apiKeyStorageMode, setApiKeyStorageMode] = useState<ApiKeyStorageMode>(() => readStoredApiKey().mode);
  // ゲームの進行ステータス
  const [gameState, setGameState] = useState<GameState>('WELCOME');
  const [endingPhase, setEndingPhase] = useState<EndingPhase>('NONE');
  const [reviewMessages, setReviewMessages] = useState<AppMessage[]>([]);
  const [reviewInputText, setReviewInputText] = useState('');
  const [isSidebarUpdating, setIsSidebarUpdating] = useState(false);

  // マップ用ステート (graph JSON版)
  const [mapLayers, setMapLayers] = useState<Record<string, GraphMapLayer>>(() => cloneDefaultMapLayers());
  const [currentPos, setCurrentPos] = useState<MapCurrentPos>(() => cloneDefaultCurrentPos());
  const [activeLayer, setActiveLayer] = useState(DEFAULT_MAP_LAYER_NAME);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [isMapUpdating, setIsMapUpdating] = useState(false);

  // GMモーダル用
  const [isGmModalOpen, setIsGmModalOpen] = useState(false);
  const gmInputRef = useRef<ChatInputHandle>(null);
  const gmChatScrollRef = useRef<HTMLDivElement>(null);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [isSupportSidebarOpen, setIsSupportSidebarOpen] = useState(false);
  const [isAutoSupportMode, setIsAutoSupportMode] = useState(() => {
    try { return localStorage.getItem('chatnoir_autoSupportMode') === 'true'; } catch { return false; }
  });
  const [isScenarioDebugMode, setIsScenarioDebugMode] = useState(false);
  const supportInputRef = useRef<ChatInputHandle>(null);
  const [supportMessages, setSupportMessages] = useState<AppMessage[]>([]);
  const [supportStorySnapshots, setSupportStorySnapshots] = useState<SupportStorySnapshot[]>([]);
  const [supportSuggestions, setSupportSuggestions] = useState<string[]>([]);
  const [isSupportLoading, setIsSupportLoading] = useState(false);
  const [supportScrollTarget, setSupportScrollTarget] = useState<string | null>(null);
  const latestSupportMessagesRef = useRef<AppMessage[]>([]);
  const latestSupportStorySnapshotsRef = useRef<SupportStorySnapshot[]>([]);

  // ファイルから読み込んだテキストデータを保持するState
  const [gmRuleText, setGmRuleText] = useState('');
  const [supportPersonaPath, setSupportPersonaPath] = useState(DEFAULT_SUPPORT_PERSONA_PATH);
  const [supportPersonaPrompt, setSupportPersonaPrompt] = useState('');
  const [supportPersonaLoadError, setSupportPersonaLoadError] = useState<string | null>(null);
  const [supportPersonaReloadVersion, setSupportPersonaReloadVersion] = useState(0);
  const [isCustomGmRule, setIsCustomGmRule] = useState(false);
  const [scenarioText, setScenarioText] = useState('');
  const [briefingText, setBriefingText] = useState('');
  const [prologueText, setPrologueText] = useState('');
  const [mapFileText, setMapFileText] = useState('');
  const [scenarioTitle, setScenarioTitle] = useState('New Scenario');
  // シナリオメタデータ（4_シナリオ修正.mdから抽出）
  const [scenarioMeta, setScenarioMeta] = useState<ScenarioMetaData>({});

  // カバー画像
  const [coverImage, setCoverImage] = useState<string>('');

  // トーストUI
  const [toastMsg, setToastMsg] = useState('');
  const [autoSaves, setAutoSaves] = useState<AutoSaveMeta[]>([]);
  const [masterScenarios, setMasterScenarios] = useState<ScenarioMasterData[]>([]);

  // 起動時に保存データを取得
  useEffect(() => {
    getAllIDBSavesMeta().then(setAutoSaves);
    getAllScenarioMasters().then(setMasterScenarios);
  }, []);

  // 選択されたモデル・フォールバック設定
  const [selectedModel, setSelectedModel] = useState('gemma-4-31b-it');
  const [fallbackEnabled, setFallbackEnabled] = useState(false);

  // サイドバーの開閉状態
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [charactersData, setCharactersData] = useState<CharacterData[]>([]);
  const [factsData, setFactsData] = useState<string[]>([]);
  const [mysteriesData, setMysteriesData] = useState<string[]>([]);
  const [monologueData, setMonologueData] = useState<string[]>([]);
  const [activeCharacterOptions, setActiveCharacterOptions] = useState<string | null>(null);
  const [playerMemo, setPlayerMemo] = useState<string>('');

  // ⋯メニューのクリック外閉じ
  useEffect(() => {
    if (!activeCharacterOptions) return;
    const handler = () => setActiveCharacterOptions(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [activeCharacterOptions]);

  const [openSections, setOpenSections] = useState<SidebarOpenSections>(() => ({ ...DEFAULT_OPEN_SECTIONS }));

  const isSupportPersonaReady = supportPersonaPrompt.trim().length > 0 && !supportPersonaLoadError;
  const isSupportPersonaLoading = !supportPersonaLoadError && !isSupportPersonaReady;
  const isSupportActionDisabled = isSupportLoading || isScenarioDebugMode || !isSupportPersonaReady;

  const reloadSupportPersonaPrompt = () => {
    setSupportPersonaPrompt('');
    setSupportPersonaLoadError(null);
    setSupportPersonaReloadVersion((prev) => prev + 1);
  };

  const currentNodeLabel = useMemo(() => getMapNodeLabel(mapLayers, currentPos), [mapLayers, currentPos]);
  const scenarioSetupReadyCount = [
    Boolean(coverImage),
    Boolean(scenarioText),
    Boolean(briefingText),
    Boolean(prologueText),
    Boolean(mapFileText),
    hasRequiredScenarioMeta(scenarioMeta),
  ].filter(Boolean).length;

  const applyMapState = (nextMapState: GraphMapState, mode: 'merge' | 'replace' = 'merge') => {
    const nextLayers = Object.keys(nextMapState.layers).length > 0 ? nextMapState.layers : cloneDefaultMapLayers();
    const nextCurrentPos = nextMapState.currentPos || (mode === 'replace' ? cloneDefaultCurrentPos() : currentPos);

    if (mode === 'replace') {
      setMapLayers(nextLayers);
    } else {
      setMapLayers((prev) => ({ ...prev, ...nextLayers }));
    }

    setCurrentPos(nextCurrentPos);
    setActiveLayer(nextCurrentPos.layer || Object.keys(nextLayers)[0] || DEFAULT_MAP_LAYER_NAME);
  };
  const applyMapStateEffect = useEffectEvent((nextMapState: GraphMapState, mode: 'merge' | 'replace' = 'merge') => {
    applyMapState(nextMapState, mode);
  });

  const toggleAllSections = (expand: boolean) => {
    setOpenSections({ howTo: expand, monologue: expand, characters: expand, facts: expand, mysteries: expand, memo: expand });
  };

  // UI設定・サイドバー幅
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [fontFamily, setFontFamily] = useState<FontFamily>('serif');
  const [fontSize, setFontSize] = useState<number>(16);
  const [isVertical, setIsVertical] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(380);
  const dragRef = useRef<boolean>(false);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState<number>(450);
  const leftDragRef = useRef<boolean>(false);

  // 設定ファイルからタイトルを自動抽出（メタデータがない場合のフォールバック）
  useEffect(() => {
    // メタデータのtitleが優先
    if (scenarioMeta.title) {
      setScenarioTitle(scenarioMeta.title);
      return;
    }
    if (!scenarioText) return;
    const lines = scenarioText.split('\n');
    const titleHeaderIdx = lines.findIndex(l => l.includes('## 1. タイトル'));
    if (titleHeaderIdx !== -1 && lines[titleHeaderIdx + 1]) {
      let extracted = lines[titleHeaderIdx + 1].trim();
      // **タイトル** の形式なら中身だけ取り出す
      const boldMatch = extracted.match(/\*\*(.+)\*\*/);
      if (boldMatch) extracted = boldMatch[1];
      if (extracted) {
        setScenarioTitle(extracted);
      }
    }
  }, [scenarioText, scenarioMeta]);


  // セッション状態の復元判定
  const [isLoaded, setIsLoaded] = useState(false);
  // 各プレイスルーの一意識別子（同シナリオ複数周回対応）
  const [sessionRunId, setSessionRunId] = useState<string>('');
  // ユーザーが付けるセーブ名
  const [saveName, setSaveName] = useState<string>('');

  // チャットの状態管理
  const [messages, setMessages] = useState<AppMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const latestMessagesRef = useRef<AppMessage[]>([]);
  const regenerateMessageRef = useRef<((index: number) => void) | null>(null);
  const gmMessageCount = messages.filter(message => message.isGm).length;

  const scrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const isInitialScrollDone = useRef(false);
  const supportScrollRef = useRef<HTMLDivElement>(null);
  const supportAbortControllerRef = useRef<AbortController | null>(null);
  const isScenarioDebugModeRef = useRef(false);
  const scenarioDebugSessionRef = useRef(0);
  const debugAutomatedMessageRef = useRef(false);

  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    latestSupportMessagesRef.current = supportMessages;
  }, [supportMessages]);

  useEffect(() => {
    latestSupportStorySnapshotsRef.current = supportStorySnapshots;
  }, [supportStorySnapshots]);

  useEffect(() => {
    isScenarioDebugModeRef.current = isScenarioDebugMode;
  }, [isScenarioDebugMode]);

  const setSupportMessagesState = (nextValue: React.SetStateAction<AppMessage[]>) => {
    setSupportMessages((prev) => {
      const nextMessages = typeof nextValue === 'function'
        ? (nextValue as (prevState: AppMessage[]) => AppMessage[])(prev)
        : nextValue;
      latestSupportMessagesRef.current = nextMessages;
      return nextMessages;
    });
  };

  const setSupportStorySnapshotsState = (nextValue: React.SetStateAction<SupportStorySnapshot[]>) => {
    setSupportStorySnapshots((prev) => {
      const nextSnapshots = typeof nextValue === 'function'
        ? (nextValue as (prevState: SupportStorySnapshot[]) => SupportStorySnapshot[])(prev)
        : nextValue;
      latestSupportStorySnapshotsRef.current = nextSnapshots;
      return nextSnapshots;
    });
  };

  const removePendingDebugSupportAction = () => {
    setSupportMessagesState((prev) => {
      if (prev.length === 0) {
        return prev;
      }

      const lastMessage = prev[prev.length - 1];
      if (lastMessage.kind !== 'debug-selected-action') {
        return prev;
      }

      return prev.slice(0, -1);
    });
    setSupportScrollTarget(null);
  };

  // GMチャット：新しいメッセージが来たら自動スクロール
  useEffect(() => {
    if (gmChatScrollRef.current) {
      gmChatScrollRef.current.scrollTop = gmChatScrollRef.current.scrollHeight;
    }
  }, [gmMessageCount, isLoading]);

  // シナリオテキストから初期マップ情報を抽出
  useEffect(() => {
    // すでにメッセージが開始されている場合や、初期値以外のグラフがある場合はスキップ
    if (!scenarioText || messages.length > 2) return; 

    const parsedMapState = parseMapState(scenarioText);
    if (parsedMapState) {
      try {
        applyMapStateEffect(parsedMapState, 'replace');
        console.info("シナリオから初期マップ(graph JSON)を読み込みました");
      } catch (e) {
        console.error("Initial map parse error:", e);
      }
    }
  }, [scenarioText, messages.length]);

  const insertTags = (prefix: string, suffix: string) => {
    chatInputRef.current?.appendValue(prefix, suffix);
  };

  // 地図ファイル単体で読み込まれた場合のパース処理
  useEffect(() => {
    if (!mapFileText) return;

    const parsedMapState = parseMapState(mapFileText);
    if (parsedMapState) {
      try {
        applyMapStateEffect(parsedMapState, 'replace');
        console.info("地図（graph JSON形式）をセットしました");
      } catch (e) {
        console.warn("Map file parse error:", e);
      }
    }
  }, [mapFileText]);

  const resetAllState = () => {
    setMessages([]);
    setSupportMessagesState([]);
    setSupportStorySnapshotsState([]);
    setSupportSuggestions([]);
    isScenarioDebugModeRef.current = false;
    scenarioDebugSessionRef.current += 1;
    debugAutomatedMessageRef.current = false;
    setIsScenarioDebugMode(false);
    gmInputRef.current?.clear();
    supportInputRef.current?.clear();
    setCharactersData([]);
    setFactsData([]);
    setMysteriesData([]);
    setMonologueData([]);
    setGmRuleText('');
    setSupportPersonaPath(DEFAULT_SUPPORT_PERSONA_PATH);
    reloadSupportPersonaPrompt();
    setIsCustomGmRule(false);
    setScenarioText('');
    setBriefingText('');
    setPrologueText('');
    setMapFileText('');
    setCoverImage('');
    setSaveName('');
    setSessionRunId('');
    setPlayerMemo('');
    setOpenSections({ ...DEFAULT_OPEN_SECTIONS });
    setEndingPhase('NONE');
    setReviewMessages([]);
    setReviewInputText('');
    setIsGmModalOpen(false);
    setIsSupportModalOpen(false);
    setIsSupportSidebarOpen(false);
    setScenarioMeta({});
    const defaultMapState = cloneDefaultMapState();
    setMapLayers(defaultMapState.layers);
    setCurrentPos(defaultMapState.currentPos || cloneDefaultCurrentPos());
    setActiveLayer(defaultMapState.currentPos?.layer || DEFAULT_MAP_LAYER_NAME);
    sessionStorage.removeItem('chatnoir-current-save-key');
  };

  const showToast = (message: string) => {
    setToastMsg(message);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const stopScenarioDebugMode = (options: { showToast?: boolean; reason?: string; abortRequests?: boolean } = {}) => {
    const {
      showToast: shouldShowToast = true,
      reason = 'シナリオデバッグモードを停止しました',
      abortRequests = true,
    } = options;

    scenarioDebugSessionRef.current += 1;
    isScenarioDebugModeRef.current = false;
    setIsScenarioDebugMode(false);

    if (abortRequests && supportAbortControllerRef.current) {
      supportAbortControllerRef.current.abort();
    }
    if (abortRequests && debugAutomatedMessageRef.current && abortControllerRef.current) {
      removePendingDebugSupportAction();
      abortControllerRef.current.abort();
    }

    if (shouldShowToast) {
      showToast(reason);
    }
  };

  const restoreStateData = (raw: unknown, targetGameState?: GameState) => {
    const parsed = normalizeStoredGameState(raw);
    // 明示的な指定があればそれを使用、なければ保存されたもの、それもなければPLAYING
    const nextState = targetGameState || parsed.gameState || 'PLAYING';
    const shouldOpenGmModal = parsed.isGmModalOpen === true;
    const shouldOpenSupportSidebar = parsed.isSupportSidebarOpen === true;
    const shouldOpenSupportModal = !shouldOpenSupportSidebar && parsed.isSupportModalOpen === true;
    isScenarioDebugModeRef.current = false;
    scenarioDebugSessionRef.current += 1;
    debugAutomatedMessageRef.current = false;
    setGameState(nextState);
    setMessages(parsed.messages || []);
    setGmRuleText(parsed.gmRuleText || '');
    setSupportPersonaPath(parsed.supportPersonaPath || DEFAULT_SUPPORT_PERSONA_PATH);
    setSupportPersonaPrompt('');
    setSupportPersonaLoadError(null);
    setSupportPersonaReloadVersion((prev) => prev + 1);
    setScenarioText(parsed.scenarioText || '');
    setBriefingText(parsed.briefingText || '');
    setPrologueText(parsed.prologueText || '');
    setMapFileText(parsed.mapFileText || '');
    setCoverImage(parsed.coverImage || '');
    setCharactersData((parsed.charactersData || []).map((character) => ({ ...character, isGenerating: false })));
    setFactsData(parsed.factsData || []);
    setMysteriesData(parsed.mysteriesData || []);
    setMonologueData(parsed.monologueData || []);
    if (parsed.theme) setTheme(parsed.theme);
    setScenarioTitle(parsed.scenarioTitle || 'New Scenario');
    setScenarioMeta(parsed.scenarioMeta || {});
    if (parsed.fontFamily) setFontFamily(parsed.fontFamily);
    if (parsed.fontSize !== undefined) setFontSize(parsed.fontSize);
    if (parsed.isVertical !== undefined) setIsVertical(parsed.isVertical);
    if (parsed.sidebarWidth !== undefined) setSidebarWidth(parsed.sidebarWidth);
    if (parsed.leftSidebarWidth !== undefined) setLeftSidebarWidth(parsed.leftSidebarWidth);
    setIsSidebarOpen(parsed.isSidebarOpen !== undefined ? parsed.isSidebarOpen : true);
    setSessionRunId(parsed.sessionRunId || '');
    setSaveName(parsed.saveName || '');
    setPlayerMemo(parsed.playerMemo || '');
    setOpenSections(parsed.openSections || { ...DEFAULT_OPEN_SECTIONS });
    setEndingPhase(parsed.endingPhase || 'NONE');
    setReviewMessages(parsed.reviewMessages || []);
    const gmInputText = parsed.gmInputText;
    if (gmInputText) setTimeout(() => gmInputRef.current?.setValue(gmInputText), 0);
    setIsGmModalOpen(shouldOpenGmModal);
    setSupportMessagesState(parsed.supportMessages || []);
    setSupportStorySnapshotsState(parsed.supportStorySnapshots || []);
    setSupportSuggestions(parsed.supportSuggestions || []);
    const supportInputText = parsed.supportInputText;
    if (supportInputText) setTimeout(() => supportInputRef.current?.setValue(supportInputText), 0);
    if (parsed.fallbackEnabled !== undefined) setFallbackEnabled(parsed.fallbackEnabled);
    setIsSupportSidebarOpen(shouldOpenSupportSidebar);
    setIsSupportModalOpen(shouldOpenSupportModal);
    setSupportScrollTarget(null);
    setIsScenarioDebugMode(false);
    const restoredMapState = normalizeStoredMapState(raw);
    setMapLayers(restoredMapState.layers);
    setCurrentPos(restoredMapState.currentPos || cloneDefaultCurrentPos());
    setActiveLayer(restoredMapState.currentPos?.layer || Object.keys(restoredMapState.layers)[0] || DEFAULT_MAP_LAYER_NAME);

    // 復元後、DOMのレンダリングを待ってから最新メッセージへスクロール
    setTimeout(() => scrollToBottom(), 150);
  };
  const restoreStateDataEffect = useEffectEvent((parsed: unknown, targetGameState?: GameState) => {
    restoreStateData(parsed, targetGameState);
  });

  // GameStateをsessionStorageへ保存（リロード時のUI状態維持）
  useEffect(() => {
    if (isLoaded) {
      sessionStorage.setItem('chatnoir-current-gameState', gameState);
    }
  }, [gameState, isLoaded]);

  useEffect(() => {
    let isCancelled = false;

    const loadSupportPersonaPrompt = async () => {
      if (!isCancelled) {
        setSupportPersonaPrompt('');
        setSupportPersonaLoadError(null);
      }

      try {
        const response = await fetch(resolvePublicAssetPath(supportPersonaPath), { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to load support persona: ${response.status}`);
        }

        const text = (await response.text()).trim();
        if (!text) {
          throw new Error('Support persona prompt is empty');
        }

        if (!isCancelled) {
          setSupportPersonaPrompt(text);
          setSupportPersonaLoadError(null);
        }
      } catch (error) {
        console.warn('おたすけロアちゃんの人格プロンプト読み込みに失敗しました。support-personas/lore-support.md を確認してください。', error);
        if (!isCancelled) {
          setSupportPersonaPrompt('');
          setSupportPersonaLoadError('support-personas/lore-support.md を読み込めませんでした。');
        }
      }
    };

    loadSupportPersonaPrompt();

    return () => {
      isCancelled = true;
    };
  }, [supportPersonaPath, supportPersonaReloadVersion]);

  // マウント時に保存されたキー・オートセーブを読み込む
  useEffect(() => {
    const savedApiKey = readStoredApiKey();
    if (savedApiKey.apiKey) setApiKey(savedApiKey.apiKey);
    setApiKeyStorageMode(savedApiKey.mode);

    // GMルールを内蔵ファイルから自動ロード（ユーザーが手動でアップロードしない限り使用）
    fetch(resolvePublicAssetPath('scenarios/GMルール.md')).then(r => r.text()).then(text => {
      setGmRuleText(prev => prev || text);
    }).catch(() => {});

    const runStartupInfo = async () => {
      await scrubApiKeysFromIDB();

      // sessionStorageから前回の状態を読み込む（リロード用）
      const currentKey = sessionStorage.getItem('chatnoir-current-save-key');
      const isReload = !!currentKey;

      // まず全オートセーブのメタデータを読み込んでおく（SAVES画面用）
      const metas = await getAllIDBSavesMeta();
      setAutoSaves(metas);

      const savedGameStateRaw = sessionStorage.getItem('chatnoir-current-gameState');
      const savedGameState = isGameState(savedGameStateRaw) ? savedGameStateRaw : null;

      if (isReload) {
        const autoSavedData = await loadFromIDB<StoredGameState>(currentKey as string);
        if (autoSavedData) {
          // リロード時は保存されているデータと状態を復元
          restoreStateDataEffect(autoSavedData, savedGameState || autoSavedData.gameState);
          showToast('セッションから復帰しました');
        } else if (savedGameState) {
          setGameState(savedGameState);
        }
      } else if (savedGameState) {
        // ゲーム中ではないが、SAVES画面やLOGIN画面を開いていた場合はその状態を復元
        setGameState(savedGameState);
      }
      setIsLoaded(true);
    };
    runStartupInfo();
  }, []);

  // SAVES画面を開くたびに最新のセーブデータを再取得する
  useEffect(() => {
    if (isLoaded && gameState === 'SAVES') {
      getAllIDBSavesMeta().then(metas => setAutoSaves(metas));
    }
  }, [gameState, isLoaded]);

  // 常にバックアップ (IndexedDB)
  useEffect(() => {
    // 復元が終わる前に上書き保存されるのを防ぐため、isLoadedチェック
    if (isLoaded && gameState !== 'WELCOME' && gameState !== 'SAVES' && gameState !== 'LOGIN') {
      const currentData = {
        gameState, messages, gmRuleText, scenarioText, briefingText, prologueText, mapFileText, coverImage,
        charactersData, factsData, mysteriesData, monologueData, playerMemo, openSections, theme, fontFamily, fontSize, isVertical, sidebarWidth, leftSidebarWidth, isSidebarOpen, sessionRunId, saveName, scenarioTitle, scenarioMeta, endingPhase, reviewMessages, isGmModalOpen, supportMessages, supportStorySnapshots, supportSuggestions, supportPersonaPath, isSupportModalOpen, isSupportSidebarOpen,
        mapLayers, currentPos, fallbackEnabled,
        lastPlay: new Date().toISOString()
      };

      const fileNameTitle = scenarioTitle.trim().replace(/[\/\\?%*:|"<>]/g, '_');
      // sessionRunIdが空（新規開始前）、またはタイトルが設定されていない場合はセーブしない
      if (!sessionRunId || !fileNameTitle) return;

      const runKey = `auto_save_${fileNameTitle}_${sessionRunId}`;
      sessionStorage.setItem('chatnoir-current-save-key', runKey);
      saveToIDB(runKey, currentData);
    }
  }, [isLoaded, gameState, messages, gmRuleText, scenarioText, briefingText, prologueText, mapFileText, coverImage, apiKey, charactersData, factsData, mysteriesData, monologueData, playerMemo, openSections, theme, fontFamily, fontSize, isVertical, sidebarWidth, leftSidebarWidth, isSidebarOpen, sessionRunId, saveName, scenarioTitle, scenarioMeta, endingPhase, reviewMessages, isGmModalOpen, supportMessages, supportStorySnapshots, supportSuggestions, supportPersonaPath, isSupportModalOpen, isSupportSidebarOpen, mapLayers, currentPos, fallbackEnabled]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      if (isVertical) {
        // 縦書きモードでは、内容が増えるごとに左方向へサイズが伸びるため、左端を基準にする
        scrollRef.current.scrollLeft = -scrollRef.current.scrollWidth;
      } else {
        // 通常（横書き）モード
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  };

  const scrollToTop = () => {
    if (scrollRef.current) {
      if (isVertical) {
        scrollRef.current.scrollLeft = 0;
      } else {
        scrollRef.current.scrollTop = 0;
      }
    }
  };

  const scrollSupportToBottom = () => {
    if (supportScrollRef.current) {
      supportScrollRef.current.scrollTop = supportScrollRef.current.scrollHeight;
    }
  };

  const scrollSupportToAnchor = (anchorId: string) => {
    const container = supportScrollRef.current;
    const anchor = container?.querySelector<HTMLElement>(`[data-support-anchor="${anchorId}"]`);

    if (container && anchor) {
      container.scrollTo({ top: Math.max(anchor.offsetTop - 8, 0), behavior: 'smooth' });
      return;
    }

    scrollSupportToBottom();
  };

  const scrollToBottomEffect = useEffectEvent(() => {
    scrollToBottom();
  });

  const scrollSupportToAnchorEffect = useEffectEvent((anchorId: string) => {
    scrollSupportToAnchor(anchorId);
  });

  // サイドバーのリサイズ処理
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 250 && newWidth < 800) setSidebarWidth(newWidth);
      }
      if (leftDragRef.current) {
        const newWidth = e.clientX;
        if (newWidth > 250 && newWidth < 800) setLeftSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      if (dragRef.current || leftDragRef.current) {
        dragRef.current = false;
        leftDragRef.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto'; // Re-enable text selection after drag
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // スクロール処理（自動スクロールを停止し、プレイヤーが自分のペースで読めるようにする）
  useEffect(() => {
    // 初回ロード時のみ、最新メッセージまでスクロールする
    if (isLoaded && gameState === 'PLAYING' && !isInitialScrollDone.current && messages.length > 0) {
      setTimeout(() => {
        scrollToBottomEffect();
        isInitialScrollDone.current = true;
      }, 500); // レンダリング完了まで余裕を持つ
    }
  }, [isLoaded, gameState, messages.length]);

  useEffect(() => {
    if (!supportScrollTarget) return;
    if (!isSupportModalOpen && !isSupportSidebarOpen) return;

    const timer = window.setTimeout(() => {
      scrollSupportToAnchorEffect(supportScrollTarget);
      setSupportScrollTarget(null);
    }, 40);

    return () => window.clearTimeout(timer);
  }, [supportScrollTarget, isSupportModalOpen, isSupportSidebarOpen]);

  useEffect(() => {
    if (!isSupportModalOpen && !isSupportSidebarOpen) return;
    if (supportScrollTarget) return;

    const timer = window.setTimeout(() => {
      scrollSupportToBottom();
    }, 40);

    return () => window.clearTimeout(timer);
  }, [isSupportModalOpen, isSupportSidebarOpen, supportScrollTarget]);

  // ホイールスクロールの縦書き変換処理
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isVertical || gameState !== 'PLAYING') return;

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        // vertical-rlではscrollLeftを引くと左（古い方から新しい方）へ進む
        el.scrollLeft -= e.deltaY;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [isVertical, gameState]);

  // ローカルファイルの読み込み関数
  const handleFileRead = (e: React.ChangeEvent<HTMLInputElement>, setter: (text: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setter(evt.target?.result as string);
    };
    reader.readAsText(file);
  };

  // 複数ファイルを一括読み込みして名前で自動振り分け
  const handleMultiFileRead = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const name = file.name.toLowerCase();

      // 画像がドロップされたらカバー画像（パッケージ）としてセット
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          setCoverImage(evt.target?.result as string);
        };
        reader.readAsDataURL(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        const extractedScenarioMeta = extractScenarioMetaFromText(text);
        if (extractedScenarioMeta && (hasRequiredScenarioMeta(extractedScenarioMeta) || name.includes('修正') || name.includes('meta'))) {
          setScenarioMeta((prev) => mergeScenarioMetaData(prev, extractedScenarioMeta));
          console.log('📋 [メタデータ読み込み完了]', extractedScenarioMeta);
        }

        if (name.includes('setting') || name.includes('設定')) {
          setScenarioText(text);
        } else if (name.includes('prologue') || name.includes('プロローグ')) {
          setPrologueText(text);
        } else if (name.includes('briefing') || name.includes('概要')) {
          setBriefingText(text);
        } else if (name.includes('map') || name.includes('地図')) {
          setMapFileText(text);

          const parsedMapState = parseMapState(text);
          if (parsedMapState) {
            try {
              applyMapState(parsedMapState, 'replace');
              console.log('🗺️ [マップ読み込み完了]');
            } catch (e) {
              console.warn('マップJSONのパースに失敗:', e);
            }
          }
        } else if (name.includes('gm') || name.includes('ルール')) {
          setGmRuleText(text);
        }
      };
      reader.readAsText(file);
    });
    // 入力値をリセットして、同じファイル名の再選択を可能にする
    e.target.value = '';
  };

  // サンプルシナリオをサーバーから自動ロード
  const loadDefaultScenario = async () => {
    try {
      const [rGM, rScen, rBrief, rPrologue, rMeta, rMap] = await Promise.all([
        fetch(resolvePublicAssetPath('scenarios/GMルール.md')).then(r => r.text()),
        fetch(resolvePublicAssetPath('scenarios/歯車_設定.md')).then(r => r.text()),
        fetch(resolvePublicAssetPath('scenarios/歯車_概要.md')).then(r => r.text()),
        fetch(resolvePublicAssetPath('scenarios/歯車_プロローグ.md')).then(r => r.text()),
        fetch(resolvePublicAssetPath('scenarios/歯車_修正.md')).then(r => r.text()),
        fetch(resolvePublicAssetPath('scenarios/歯車_地図.md')).then(r => r.text()),
      ]);
      setGmRuleText(rGM);
      setScenarioText(rScen);
      setBriefingText(rBrief);
      setCoverImage(DEFAULT_SAMPLE_COVER_PATH);
      setPrologueText(rPrologue.trim());

      const extractedScenarioMeta = extractScenarioMetaFromText(rMeta);
      if (extractedScenarioMeta) {
        setScenarioMeta((prev) => mergeScenarioMetaData(prev, extractedScenarioMeta));
      } else {
        console.warn('サンプルメタデータJSONのパースに失敗: 主人公情報を抽出できませんでした');
      }

      setMapFileText(rMap);
      const parsedMapState = parseMapState(rMap);
      if (parsedMapState) {
        try {
          applyMapState(parsedMapState, 'replace');
          console.info('🗺️ [サンプル初期地図を読み込み完了]');
        } catch (e) {
          console.warn('サンプル初期地図JSONのパースに失敗:', e);
        }
      }
    } catch {
      alert('サンプルシナリオの読み込みに失敗しました。');
    }
  };

  const handleStartLogin = () => {
    if (apiKey.trim() === '' || !scenarioText || !prologueText || !briefingText) {
      alert("必須項目（APIキー、設定ファイル、プロローグ、概要ファイル）をすべてセットしてください！");
      return;
    }
    if (!hasRequiredScenarioMeta(scenarioMeta)) {
      alert('メタデータの主人公名と一人称を読み込めていません。メタデータファイルをアップロードしてください。');
      return;
    }
    if (!saveName.trim()) {
      alert("プロジェクト名を入力してください（セーブスロットの識別に必要です）");
      return;
    }
    persistApiKey(apiKey, apiKeyStorageMode);
    // 新規ゲーム開始時に前回の派生データをクリア
    setMessages([]);
    setSupportMessagesState([]);
    setSupportStorySnapshotsState([]);
    setSupportSuggestions([]);
    isScenarioDebugModeRef.current = false;
    scenarioDebugSessionRef.current += 1;
    debugAutomatedMessageRef.current = false;
    setIsScenarioDebugMode(false);
    supportInputRef.current?.clear();
    setCharactersData([]);
    setFactsData([]);
    setMysteriesData([]);
    setMonologueData([]);
    // 新しいセッションIDを発行（同じシナリオでも別スロットに保存される）
    const newId = Date.now().toString(36);
    setSessionRunId(newId);

    // シナリオマスターに保存（次回の再利用のため）
    saveScenarioMaster(scenarioTitle, {
      gmRuleText,
      scenarioText,
      briefingText,
      prologueText,
      mapFileText,
      mapLayers,
      currentPos,
      coverImage,
      scenarioMeta,
      lastUpdated: new Date().toISOString()
    });
    getAllScenarioMasters().then(setMasterScenarios);

    // いきなりゲームを開始せず、まずはブリーフィング画面へ進む
    setGameState('BRIEFING');
    
    // 画面遷移時に一番上（先頭）が表示されるようにスクロール位置をリセット（DOM更新後に行うためsetTimeout）
    setTimeout(() => {
      window.scrollTo(0, 0);
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
        scrollRef.current.scrollLeft = 0;
      }
    }, 100);
  };

  // ブリーフィング画面で「物語を始める」を押した時の処理（プロローグだけ表示）
  const startInitialChat = () => {
    setGameState('PLAYING');
    
    // 初回起動時の強制一番下スクロール（useEffect）が誤ってはたらくのを防ぐフラグ
    isInitialScrollDone.current = true;

    // ページの先頭にスクロールをリセット（DOM更新後に行うためsetTimeout）
    setTimeout(() => {
      window.scrollTo(0, 0);
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
        scrollRef.current.scrollLeft = 0;
      }
    }, 200);

    const outText = prologueText ? prologueText : "（※プロローグファイルが読み込まれていません。行動を入力して開始してください）";

    // プロローグをチャット履歴に配置（AIの最初の発言として）
    const initialHistory: AppMessage[] = [
      { role: 'user', parts: [{ text: "（システム起動：ゲーム開始。プロローグが読み込まれました）" }] },
      { role: 'model', parts: [{ text: "# プロローグ\n\n" + outText }] },
    ];

    setMessages(initialHistory);
    // この時点ではAIへの通信は行わない。プレイヤーがプロローグを読み終えるのを待つ。
  };

  // プレイヤーがプロローグを読み終え、「物語に入る」を押した時の処理
  const startPhase2 = async () => {
    setIsLoading(true);

    // メインゲーム開始のシステム通知を履歴に追加
    const phase2History: AppMessage[] = [
      ...messages,
      { role: 'user', parts: [{ text: "（システム通知：メインゲーム（本編）を開始してください。上記のプロローグは事前に用意されたテキストであり、GMルールの書式に従っていない場合があります。ここから先のあなたの出力では、GMルールに厳密に従ってください。NPCの発言には必ず **名前**「セリフ」 の形式を使用すること。プロローグの状況を引き継ぎ、最初のシーンの描写を一人称視点で行い、プレイヤーの行動を待つ形で終了してください）" }] },
    ];

    setMessages(phase2History);

    // AIにフェーズ2の最初の描写を生成させる
    try {
      const res = await requestChatApi({
        apiKey: apiKey,
        model: selectedModel,
        messages: phase2History,
        systemInstruction: gmRuleText + "\n\n" + scenarioText,
        fallbackEnabled,
        scenarioMeta
      });
      const data = await res.json();
      if (res.ok) {
        const phase2Response: AppMessage = {
          role: 'model',
          parts: [{ text: typeof data.text === 'string' ? data.text : '' }]
        };
        setMessages([...phase2History, phase2Response]);
      } else {
        let errorStr = 'Unknown Error';
        if (data.error) {
          errorStr = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
          // もし文字列の中にさらにJSONが含まれている場合はパースを試みる
          try {
            const nested = JSON.parse(errorStr);
            if (nested.error?.message) errorStr = nested.error.message;
            else if (nested.message) errorStr = nested.message;
          } catch { /* ignore */ }
        }

        const isOverloaded = errorStr.includes('503') || errorStr.toLowerCase().includes('demand') || errorStr.includes('UNAVAILABLE');
        const displayMsg = isOverloaded
          ? "【サーバー混雑】AIが一時的に利用できません。1分ほど待ってから再度「物語に入る」を押してください。"
          : `エラーが発生しました: ${errorStr}`;

        showToast(displayMsg);
        // 開発時のエラーオーバーレイ表示を避けるため、想定内のAPIエラーはconsole.warnに留める
        console.warn(`${displayMsg} (API Response: ${errorStr})`);
        // メッセージ履歴をプロローグ後に戻す（以前の状態を保持していた messages を使用）
        setMessages(messages);
      }
    } catch (err: unknown) {
      const isAbort = isAbortError(err);
      if (!isAbort) {
        showToast("通信エラーが発生しました。ネットワーク設定を確認してください。");
        console.warn("フェーズ2開始通信エラー:", getErrorMessage(err));
        setMessages(messages);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // --- 特殊コマンド（JSON抽出） ---
  const requestSpecialCommand = async (commandType: 'characters' | 'facts' | 'mysteries' | 'monologue' | 'map', overrideMessages?: AppMessage[]) => {
    if (isLoading) return;
    setIsLoading(true);
    setIsSidebarUpdating(true);
    if (commandType === 'map') setIsMapUpdating(true);

    // UI（小説空間）には出さず、APIの裏側で送るメッセージ
    let triggerText = '';
    if (commandType === 'characters') {
      triggerText = "（システムコマンド：GMとしてではなくシステムとして応答せよ。このシナリオの主人公（プレイヤー自身）と、ここまでに登場した人物の基本情報を以下のJSON形式のみで出力せよ。※システムプロンプトの「設定ファイル」にある裏設定や真相を先回りして書くことは【重大なルール違反】です。必ず【これまでのチャット履歴で主人公が実際に知り得た情報】と【主人公が物語開始時点で当然知っている前提情報】のみで構成すること。\n\n【名前の出力ルール】\n1. 苗字のみ、あるいは名前のみしか明かされていない場合、`name` には【その判明している部分のみ】を出力してください。\n2. フルネームを出力して良いのは、姓名の両方が明示的に明かされた場合のみです。\n3. ただし、家族・同居人など、主人公が物語開始時点で本名を当然知っている人物については、本文中で本名が明示されていなくても `is_name_known_to_player` を true にし、`name` に本名を出力して構いません。\n4. 『父』『母』『おばあちゃん』『先生』『店長』などの呼称・続柄・役職・通称しか分かっていない場合は、それを `name` に出力してください。\n5. 『黒服の男』などの外観的特徴を `name` に出力してよいのは、呼称・続柄・役職・通称・名前のいずれもまだ分からない場合のみです。\n6. 【重要】`true_name` は、正体が不明な段階であっても、設定ファイルに基づいた【一貫した本名（ID）】を必ず使用してください。これにより、表示名が変わっても同一人物として管理されます。\n\n```json\n{\n  \"characters\": [\n    { \"true_name\": \"本当の名前(一貫したIDとして使用)\", \"is_name_known_to_player\": trueかfalse, \"name\": \"上記のルールに従った表示名\", \"gender\": \"male/female/unknown\", \"info\": \"既知の情報\" }\n  ]\n}\n```）";
    } else if (commandType === 'facts') {
      triggerText = "（システムコマンド：GMとしてではなくシステムとして応答せよ。現在主人公が把握している確定的な事実を以下のJSON形式のみで出力せよ。※「設定ファイル」に記載されている真相や裏設定は絶対に反映させず、必ず【これまでのチャット履歴で主人公が実際に体験・確認した事実のみ】を抽出すること。先回りしたネタバレ記述は厳禁。\n```json\n{\n  \"facts\": [\"事実1\", \"事実2\"]\n}\n```）";
    } else if (commandType === 'mysteries') {
      triggerText = "（システムコマンド：GMとしてではなくシステムとして応答せよ。現在主人公がまだ解決できていない未解決の謎（解くべき課題）を以下のJSON形式のみで出力せよ。※「設定ファイル」にある真相を先回りして謎の形式で提示（例：主人公がまだ知らないトリックの核心を疑問形にする等）することは【重大な違反（ネタバレ）】です。必ず【これまでのチャット履歴のみ】から、今の主人公が純粋に不思議に思っている事だけを抽出すること。\n```json\n{\n  \"mysteries\": [\"謎1\", \"謎2\"]\n}\n```）";
    } else if (commandType === 'monologue') {
      triggerText = "（システムコマンド：GMとしてではなくシステムとして応答せよ。これまでの展開を踏まえ、現在の主人公の心境、疑念、あるいは決意を、まるでミステリー小説の幕間のモノローグ（地の文）のように文学的でドラマチックに出力せよ。※「設定ファイル」の真相に引張られて、主人公が知り得ないメタ的な推論をさせないこと。必ずチャット履歴の範囲内での主観視点で、感情豊かに記述すること。一人称（俺、僕、私など）は文脈にそろえること。\n出力は以下のJSON形式のみとし、改行を入れる場合は必ず `\\n` を使って表現すること。\n```json\n{\n  \"monologue\": \"小説のモノローグのような地の文...\\n\\n（改行を含む）...\"\n}\n```）";
    } else if (commandType === 'map') {
      const currentMapJson = JSON.stringify({ currentPos, layers: mapLayers }, null, 2);
      triggerText = `（システムコマンド：GMとしてではなくシステムとして応答せよ。以下に示す【現在の地図データ】を元に、最新のチャット履歴を反映して更新した地図JSONを出力せよ。
【重要ルール】
- mapOperation.mode は必ず "merge" または "replace" を返すこと。
- "merge" は一部のレイヤーだけを更新・訂正するときに使う。返したレイヤーはそのレイヤー全体を正しい完成形として扱うので、修正したいレイヤーは差分ではなく完成形を返すこと。
- "replace" は地図全体の前提が崩れていて、全面的に再構築した方が安全なときだけ使うこと。その場合は必要な全レイヤーを返すこと。
- 既存ノードIDは基本的には維持すること。ただし、明らかな誤り・重複・仮ID・誤接続に由来するノードや edge は、修正・統合・削除してよい。
- ノードIDは英数字とアンダースコア中心の安全な識別子にし、表示名は label へ入れてください。
- layer は「別の見取り図として扱うべき空間単位」で分けること。屋外の広域関係は通常「全体マップ」に置く。
- 建物内部、ダンジョン、学校、病院、駅構内などは、外の全体マップとは別レイヤーにすること。
- 階段・エレベーター・地下通路などで構造が分かれるなら、「洋館 1F」「洋館 2F」「地下通路」のように階や区域ごとにレイヤーを分けてよい。
- 同じ建物・同じフロアの情報は、細かく分けすぎず1つのレイヤーにまとめること。
- 新しい場所が既存レイヤーに自然に収まるならそのレイヤーを使い、別の見取り図として把握する方が自然な場合だけ新しいレイヤーを作ること。
- direction は見やすさ優先で選ぶこと。一本道が長く横一直線になりそうな場合や、階層・上下移動が中心なら TD を選んでよい。LR に固定しないこと。
- 「設定ファイル」にある真相を先回りして書くことは【重大なルール違反】です。
- 必ず【これまでのチャット履歴のみ】から、今の主人公が知っている場所の繋がりを更新してください。

【現在の地図データ】
\`\`\`json
${currentMapJson}
\`\`\`

出力形式（この形式のみで返せ）：
\`\`\`json
{
  "mapOperation": {
    "mode": "merge",
    "reason": "一部レイヤーの接続や既知情報を訂正・更新したため"
  },
  "map": {
    "currentPos": {"nodeId": "home", "layer": "全体マップ"},
    "layers": {
      "全体マップ": {
        "direction": "TD",
        "nodes": [
          { "id": "home", "label": "自宅", "kind": "place", "status": "visited" },
          { "id": "western_mansion", "label": "洋館", "kind": "building", "status": "known" }
        ],
        "edges": [
          { "id": "edge_1", "source": "home", "target": "western_mansion", "kind": "path", "bidirectional": true }
        ]
      },
      "洋館 1F": {
        "direction": "LR",
        "nodes": [
          { "id": "mansion_entrance", "label": "玄関ホール", "kind": "room", "status": "visited" },
          { "id": "mansion_library", "label": "図書室", "kind": "room", "status": "known" }
        ],
        "edges": [
          { "id": "edge_2", "source": "mansion_entrance", "target": "mansion_library", "kind": "corridor", "bidirectional": true }
        ]
      }
    }
  }
}
\`\`\`）`;
    }

    // GMルールから削った「システムコマンドはルールを無視してJSONのみ返せ」という厳格な指示を、この瞬間の最後尾だけに動的に結合させる
    triggerText += "\n\n※重要：これはシステムコマンドです。他のルール(情景描写、一人称、ステータス表示など)をすべて無視し、要求されたJSON形式のデータのみを純粋に出力してください。余計な挨拶や地の文は一切不要です。（アプリの手帳更新に必須なルールです）";

    // チャット履歴を維持したまま、最後に一時的なコマンドを足して通信する
    const activeMessages = overrideMessages || messages;
    const apiMessages: AppMessage[] = [...activeMessages, { role: 'user', parts: [{ text: triggerText }] }];

    try {
      const res = await requestChatApi({
        apiKey: apiKey,
        model: selectedModel,
        messages: apiMessages,
        systemInstruction: gmRuleText + "\n\n" + scenarioText + (mapFileText ? "\n\n【初期マップ設定】\n" + mapFileText : "") + "\n\n" + MAP_INSTRUCTION,
        fallbackEnabled,
        scenarioMeta
      });
      const data = await res.json();
      if (res.ok) {
        // 返ってきた文字列からJSONだけを強引に抽出
        let jsonStr = data.text;
        const startIndex = jsonStr.indexOf('{');
        const endIndex = jsonStr.lastIndexOf('}');
        if (startIndex !== -1 && endIndex !== -1) {
          jsonStr = jsonStr.substring(startIndex, endIndex + 1);
          const parsed = normalizeSpecialCommandPayload(JSON.parse(jsonStr) as unknown);
          const parsedCharacters = parsed.characters;
          const parsedFacts = parsed.facts;
          const parsedMysteries = parsed.mysteries;
          const parsedMonologue = parsed.monologue;
          const parsedMapOperation = parsed.mapOperation;
          const parsedMap = parsed.map;

          // データをサイドバー用の状態変数にセット
          if (commandType === 'characters' && parsedCharacters) {
            setCharactersData(prev => {
              const normalizeCharacterId = (value?: string) => (value || '').replace(/\s+/g, '');
              const findMatchedPreviousCharacter = (character: CharacterSummary) => {
                const newTrueName = normalizeCharacterId(character.true_name);
                const newDisplayName = normalizeCharacterId(character.name);

                return prev.find((old) => {
                  const oldTrueName = normalizeCharacterId(old.true_name);
                  const oldDisplayName = normalizeCharacterId(old.name);

                  if (newTrueName && oldTrueName) return newTrueName === oldTrueName;
                  if (newTrueName && !oldTrueName) {
                    return oldDisplayName === newDisplayName || oldDisplayName === newTrueName;
                  }
                  if (!newTrueName && oldTrueName) {
                    return oldTrueName === newDisplayName || oldDisplayName === newDisplayName;
                  }
                  return newDisplayName && oldDisplayName && newDisplayName === oldDisplayName;
                });
              };

              const nextCharacters: CharacterData[] = [];
              const seen = new Set<string>();

              parsedCharacters.forEach((character) => {
                const identity = normalizeCharacterId(character.true_name) || normalizeCharacterId(character.name);
                if (!identity || seen.has(identity)) return;

                seen.add(identity);
                const previous = findMatchedPreviousCharacter(character);
                nextCharacters.push({
                  ...character,
                  image: previous?.image || null,
                  isGenerating: false,
                  lastPrompt: previous?.lastPrompt
                });
              });

              return nextCharacters;
            });
            showToast("人物情報を更新しました");
          } else if (commandType === 'facts' && parsedFacts) {
            setFactsData(parsedFacts);
            showToast("事実情報を更新しました");
          } else if (commandType === 'mysteries' && parsedMysteries) {
            setMysteriesData(parsedMysteries);
            showToast("謎情報を更新しました");
          } else if (commandType === 'monologue' && parsedMonologue) {
            setMonologueData(prev => [...prev, parsedMonologue]);
            showToast("モノローグを更新しました");
          } else if (commandType === 'map' && parsedMap) {
            const parsedMapState = normalizeMapPayload(parsedMap);
            if (parsedMapState) {
              const mapMode = parsedMapOperation?.mode === 'replace' ? 'replace' : 'merge';
              applyMapState(parsedMapState, mapMode);
              if (parsedMapOperation?.reason) {
                console.info(`[MAP] ${mapMode === 'replace' ? '再構築' : '更新'}理由: ${parsedMapOperation.reason}`);
              }
              if (parsedMapState.currentPos) {
                showToast(`MAP: ${parsedMapState.currentPos.layer} へ移動しました`);
              }
              showToast(mapMode === 'replace' ? "地図を再構築しました" : "地図情報を更新しました");
            }
          }
        } else {
          console.error("JSON形式ではありませんでした:", data.text);
          logClientViolation({ text: data.text, type: 'JSON_ERROR', command: commandType });
        }
      }
    } catch (err) {
      console.error("コマンド実行失敗:", err);
      const isOverloaded = err instanceof Error && (err.message.includes('503') || err.message.includes('demand') || err.message.includes('UNAVAILABLE'));
      const msg = isOverloaded
        ? "【お知らせ】現在AIが非常に混み合っており、情報の更新に失敗しました。少し時間をおいてから、再度「更新」ボタンを押してみてください。"
        : "情報の取得・解析に失敗しました。一時的な通信エラーの可能性があります。";
      alert(msg);
    } finally {
      setIsLoading(false);
      setIsSidebarUpdating(false);
      setIsMapUpdating(false);
    }
  };

  const handleGeneratePrompt = async (characterId: string, characterName: string) => {
    setCharactersData(curr => curr.map(old => getCharacterIdentity(old) === characterId ? { ...old, isGenerating: true } : old));
    try {
      const res = await requestAvatarPromptApi({
        apiKey: apiKey,
        characterName: characterName,
        systemInstruction: gmRuleText + "\n\n" + scenarioText,
        messages: messages
      });
      const data = await res.json();
      if (res.ok && data.prompt) {
        try {
          await navigator.clipboard.writeText(data.prompt);
          showToast("プロンプトをクリップボードにコピーしました！");
        } catch {
          alert("プロンプト:\n" + data.prompt);
        }
        setCharactersData(curr => curr.map(old => getCharacterIdentity(old) === characterId ? { ...old, isGenerating: false, lastPrompt: data.prompt } : old));
      } else {
        setCharactersData(curr => curr.map(old => getCharacterIdentity(old) === characterId ? { ...old, isGenerating: false } : old));
        alert("生成に失敗しました: " + (data.error || '不明なエラー'));
      }
    } catch {
      setCharactersData(curr => curr.map(old => getCharacterIdentity(old) === characterId ? { ...old, isGenerating: false } : old));
      alert("通信エラーが発生しました");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, characterId: string, characterName: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setCharactersData(curr => curr.map(old => getCharacterIdentity(old) === characterId ? { ...old, image: base64 } : old));
        showToast(`${characterName}の画像を設定しました`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeleteImage = (characterId: string, characterName: string) => {
    setCharactersData(curr => curr.map(old => getCharacterIdentity(old) === characterId ? { ...old, image: null } : old));
    showToast(`${characterName}の画像を削除しました`);
  };

  const getVisibleStoryMessages = (sourceMessages: AppMessage[]) => {
    return sourceMessages.filter((msg, index) => {
      if (index === 0 || index === 2) return false;
      if (msg.isGm || msg.isHidden) return false;
      return Boolean(msg.parts?.[0]?.text);
    });
  };

  const buildSupportStorySnapshot = (): SupportStorySnapshot => {
    const sourceMessages = latestMessagesRef.current;
    const visibleMessages = getVisibleStoryMessages(sourceMessages);
    const gmMessages = sourceMessages.filter((msg) => msg.isGm && msg.parts?.[0]?.text);

    return {
      visibleMsgCount: visibleMessages.length,
      gmMsgCount: gmMessages.length,
      openMysteries: mysteriesData.filter((mystery): mystery is string => typeof mystery === 'string' && mystery.trim().length > 0),
    };
  };

  const buildSupportContext = () => {
    const sourceMessages = latestMessagesRef.current;
    const visibleMessages = getVisibleStoryMessages(sourceMessages);
    const gmMessages = sourceMessages.filter((msg) => msg.isGm && msg.parts?.[0]?.text);
    const openMysteries = mysteriesData.filter((mystery): mystery is string => typeof mystery === 'string' && mystery.trim().length > 0);
    const protagonistName = scenarioMeta.protagonistName?.trim();
    const openMysteriesText = openMysteries.length > 0
      ? openMysteries.map((mystery) => `- ${mystery}`).join('\n')
      : '- まだ整理されていない';
    const recentTranscript = visibleMessages.length > 0
      ? visibleMessages.map((msg) => `${msg.role === 'user' ? '主人公' : '本編'}: ${msg.parts[0].text}`).join('\n\n')
      : 'まだ本編ログはありません。';
    const gmTranscript = gmMessages.length > 0
      ? gmMessages.map((msg) => `${msg.role === 'user' ? '主人公からGMへの質問' : 'GMの回答'}: ${msg.parts[0].text.replace(/^※GMへ：\n/, '')}`).join('\n\n')
      : '';

    return [
      '【プレイヤーが既に知っている情報】',
      scenarioTitle ? `シナリオ名: ${scenarioTitle}` : '',
      protagonistName ? `主人公 = プレイヤー = ${protagonistName}` : '主人公 = プレイヤー',
      `未解決の謎:\n${openMysteriesText}`,
      `直近の公開ログ:\n${recentTranscript}`,
      gmTranscript ? `GMとのやりとり:\n${gmTranscript}` : '',
      'この範囲を超える情報は知らない前提で、ネタバレなしに助言してください。'
    ].filter(Boolean).join('\n\n');
  };

  const buildSupportStoryProgressMessage = (currentSnapshot: SupportStorySnapshot): AppMessage | null => {
    const previousSnapshot = supportStorySnapshots[supportStorySnapshots.length - 1];

    if (!previousSnapshot) {
      return null;
    }

    const sourceMessages = latestMessagesRef.current;
    const visibleMessages = getVisibleStoryMessages(sourceMessages);
    const gmMessages = sourceMessages.filter((msg) => msg.isGm && msg.parts?.[0]?.text);
    const newStoryLines = visibleMessages.slice(previousSnapshot.visibleMsgCount)
      .map((msg) => `${msg.role === 'user' ? '主人公' : '本編'}: ${msg.parts[0].text}`);
    const newGmLines = gmMessages.slice(previousSnapshot.gmMsgCount)
      .map((msg) => `${msg.role === 'user' ? '主人公からGMへの質問' : 'GMの回答'}: ${msg.parts[0].text.replace(/^※GMへ：\n/, '')}`);
    const addedMysteries = currentSnapshot.openMysteries.filter((mystery) => !previousSnapshot.openMysteries.includes(mystery));
    const removedMysteries = previousSnapshot.openMysteries.filter((mystery) => !currentSnapshot.openMysteries.includes(mystery));

    return {
      role: 'user',
      parts: [{
        text: [
          '【前回相談から今回までの本編差分】',
          '以下は、前回相談した時点から今回相談する時点までに本編で増えた情報です。',
          newStoryLines.length > 0
            ? `新しく増えた公開ログ:\n${newStoryLines.join('\n\n')}`
            : '新しく増えた公開ログ: なし',
          newGmLines.length > 0
            ? `新しく増えたGMとのやりとり:\n${newGmLines.join('\n\n')}`
            : '新しく増えたGMとのやりとり: なし',
          addedMysteries.length > 0
            ? `新しく未解決になった謎:\n${addedMysteries.map((mystery) => `- ${mystery}`).join('\n')}`
            : '新しく未解決になった謎: なし',
          removedMysteries.length > 0
            ? `前回から解消・整理された謎:\n${removedMysteries.map((mystery) => `- ${mystery}`).join('\n')}`
            : '前回から解消・整理された謎: なし',
          '差分が少ない場合は、進展がほぼない前提で助言してください。'
        ].join('\n\n')
      }]
    };
  };

  const buildSupportHistoryMessages = (): AppMessage[] => {
    const supportConversationHistory = latestSupportMessagesRef.current
      .filter((message) => message.kind !== 'selected-suggestion' && message.kind !== 'debug-selected-action' && message.kind !== 'debug-request' && message.kind !== 'debug-analysis')
      .filter((message) => Boolean(message.parts?.[0]?.text));

    if (supportConversationHistory.length === 0) {
      return [];
    }

    const recentSupportConversationHistory: AppMessage[] = [];
    let totalChars = 0;

    for (let index = supportConversationHistory.length - 1; index >= 0; index -= 1) {
      const message = supportConversationHistory[index];
      const text = message.parts?.[0]?.text ?? '';

      if (recentSupportConversationHistory.length >= SUPPORT_HISTORY_MAX_MESSAGES) {
        break;
      }

      if (recentSupportConversationHistory.length > 0 && totalChars + text.length > SUPPORT_HISTORY_MAX_CHARS) {
        break;
      }

      recentSupportConversationHistory.unshift(message);
      totalChars += text.length;
    }

    const isHistoryTrimmed = recentSupportConversationHistory.length < supportConversationHistory.length;

    return [
      {
        role: 'user',
        parts: [{
          text: isHistoryTrimmed
            ? '【直近のおたすけロアちゃんとの相談履歴】\n以下は直近の相談履歴です。古い履歴は長さの都合で省略しています。user ロールは主人公からの相談、model ロールはロアの過去の回答です。履歴は参考情報として扱い、直前のロアの回答をそのまま繰り返さず、必要なら差分を加えて答えてください。'
            : '【これまでのおたすけロアちゃんとの相談履歴】\n以下は過去の相談履歴です。user ロールは主人公からの相談、model ロールはロアの過去の回答です。履歴は参考情報として扱い、直前のロアの回答をそのまま繰り返さず、必要なら差分を加えて答えてください。'
        }]
      },
      ...recentSupportConversationHistory,
    ];
  };

  const applySupportSuggestion = (suggestion: string) => {
    chatInputRef.current?.setValue(suggestion);
    showToast('提案文を入力欄へ入れました');
  };

  const openSupportModal = () => {
    setIsSupportSidebarOpen(false);
    setIsSupportModalOpen(true);
  };

  const closeSupportPanels = () => {
    setIsSupportModalOpen(false);
    setIsSupportSidebarOpen(false);
  };

  const sendSupportMessage = async (overrideText?: string, options: { suppressPersonaNotice?: boolean } = {}): Promise<SupportResponseResult | null> => {
    const textToSend = overrideText !== undefined ? overrideText : (supportInputRef.current?.getCurrentText() ?? '');
    const suppressPersonaNotice = options.suppressPersonaNotice === true;
    if (!textToSend.trim() || isSupportLoading) return null;

    if (!isSupportPersonaReady) {
      if (!suppressPersonaNotice) {
        showToast(isSupportPersonaLoading
          ? 'ロア人格プロンプトを読み込み中です。少し待ってから相談してください。'
          : 'support-personas/lore-support.md を読めません。ファイルを確認して再読込してください。');
      }
      return null;
    }

    const isScenarioDebugRequest = overrideText === SCENARIO_DEBUG_PROMPT;
    const previousSupportMessages = latestSupportMessagesRef.current;
    const previousSupportStorySnapshots = latestSupportStorySnapshotsRef.current;

    const newUserMessage: AppMessage = {
      role: 'user',
      parts: [{ text: textToSend }],
      kind: isScenarioDebugRequest ? 'debug-request' : undefined,
    };
    const newHistory: AppMessage[] = [...previousSupportMessages, newUserMessage];
    const currentSupportStorySnapshot = buildSupportStorySnapshot();
    const nextSupportStorySnapshots = [...previousSupportStorySnapshots, currentSupportStorySnapshot];
    const supportContextMessage: AppMessage = { role: 'user', parts: [{ text: buildSupportContext() }] };
    const supportHistoryMessages = buildSupportHistoryMessages();
    const supportStoryProgressMessage = buildSupportStoryProgressMessage(currentSupportStorySnapshot);
    const latestSupportRequestMessage: AppMessage = { role: 'user', parts: [{ text: `【今回の最新相談】\n${textToSend}` }] };
    const supportInstruction = [
      supportPersonaPrompt,
      '過去のロアの回答をそのまま繰り返さず、現在の相談に合わせて必要な差分や更新を加えてください。',
      '本編差分が与えられている場合は、前回相談以降に本編で何が進展したかを先に整理してから回答してください。'
    ].join('\n\n');
    setSupportMessagesState(newHistory);
    setSupportSuggestions([]);
    setSupportStorySnapshotsState(nextSupportStorySnapshots);
    setSupportScrollTarget(`support-message-${newHistory.length - 1}`);

    if (overrideText === undefined) {
      supportInputRef.current?.clear();
    }

    setIsSupportLoading(true);
    supportAbortControllerRef.current = new AbortController();

    try {
      const res = await requestChatApi({
        apiKey,
        model: selectedModel,
        messages: [
          supportContextMessage,
          ...supportHistoryMessages,
          ...(supportStoryProgressMessage ? [supportStoryProgressMessage] : []),
          latestSupportRequestMessage,
        ],
        systemInstruction: supportInstruction,
        fallbackEnabled,
        assistantMode: 'support',
        abortSignal: supportAbortControllerRef.current.signal,
      });
      const data = await res.json();

      if (res.ok) {
        const normalizedSuggestions = Array.isArray(data.suggestions)
          ? data.suggestions
              .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
              .map((s: string) => s
                .replace(/\/\/\s*[a-z]?\s*/gi, '')
                .replace(/^\s*[\d]+\.\s*/, '')
                .trim()
              )
              .filter((s: string) => s.length > 0)
              .slice(0, 3)
          : [];
        const nextModelMessage: AppMessage = {
          role: 'model',
          parts: [{ text: typeof data.text === 'string' ? data.text : '' }],
          kind: isScenarioDebugRequest ? 'debug-analysis' : undefined,
        };
        const nextMessages: AppMessage[] = [...newHistory, nextModelMessage];
        const nextSuggestions = isScenarioDebugRequest ? [] : normalizedSuggestions;
        setSupportMessagesState(nextMessages);
        setSupportSuggestions(nextSuggestions);
        setSupportScrollTarget(`support-message-${nextMessages.length - 1}`);
        return {
          text: typeof data.text === 'string' ? data.text : '',
          suggestions: nextSuggestions,
          action: typeof data.action === 'string' ? data.action.trim() : '',
        };
      } else {
        const errorStr = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        alert('サポートAIの応答に失敗しました: ' + errorStr);
        setSupportMessagesState(previousSupportMessages);
        setSupportStorySnapshotsState(previousSupportStorySnapshots);
        if (overrideText === undefined) {
          supportInputRef.current?.setValue(textToSend);
        }
        return null;
      }
    } catch (err: unknown) {
      if (!isAbortError(err)) {
        console.error(err);
        alert('サポートAIとの通信に失敗しました。');
      }
      setSupportMessagesState(previousSupportMessages);
      setSupportStorySnapshotsState(previousSupportStorySnapshots);
      if (overrideText === undefined) {
        supportInputRef.current?.setValue(textToSend);
      }
      return null;
    } finally {
      setIsSupportLoading(false);
      supportAbortControllerRef.current = null;
    }
  };

  const runScenarioDebugStep = async () => {
    const debugSessionId = scenarioDebugSessionRef.current;
    if (!isScenarioDebugModeRef.current || isSupportLoading) return;

    if (!isSupportPersonaReady) {
      stopScenarioDebugMode({
        showToast: false,
        abortRequests: false,
      });
      showToast(isSupportPersonaLoading
        ? 'ロア人格プロンプトの読み込み完了前のため、シナリオデバッグモードを停止しました'
        : 'support-personas/lore-support.md を読めないため、シナリオデバッグモードを停止しました');
      return;
    }

    const supportResult = await sendSupportMessage(SCENARIO_DEBUG_PROMPT, { suppressPersonaNotice: true });

    if (!isScenarioDebugModeRef.current || debugSessionId !== scenarioDebugSessionRef.current) {
      return;
    }

    const nextInput = supportResult?.action || supportResult?.suggestions[0]?.trim();

    if (!nextInput) {
      stopScenarioDebugMode({
        showToast: false,
        abortRequests: false,
      });
      showToast('シナリオデバッグモードを停止しました。自動入力候補を作れませんでした');
      return;
    }

    setSupportMessagesState((prev) => ([
      ...prev,
      {
        role: 'model',
        parts: [{ text: nextInput }],
        kind: 'debug-selected-action'
      }
    ]));
    setTimeout(() => scrollSupportToBottom(), 0);

    if (!isScenarioDebugModeRef.current || debugSessionId !== scenarioDebugSessionRef.current) {
      return;
    }

    await sendMessage(nextInput, false, { automatedByDebug: true });
  };

  // --- セーブ・ロード機能 ---
  const handleDownloadPlayLog = () => {
    let logText = `# ${scenarioTitle} - プレイログ\n\n`;
    messages.forEach((msg, index) => {
      // システム起動メッセージとメインゲーム開始指示は除外
      if (index === 0 || index === 2) return;
      if (!msg.parts?.[0]?.text) return;
      
      logText += `${msg.parts[0].text}\n\n---\n\n`;
    });
    
    const blob = new Blob([logText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const now = new Date();
    const datePart = now.getFullYear().toString() + (now.getMonth() + 1).toString().padStart(2, '0') + now.getDate().toString().padStart(2, '0');
    const fileNameTitle = scenarioTitle.trim().replace(/[\/\\?%*:|"<>]/g, '_');
    
    a.download = `プレイログ_${fileNameTitle}_${datePart}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('プレイログをテキスト出力しました');
  };
  const handleSaveData = () => {
    try {
      const saveData = {
        gameState, messages, gmRuleText, scenarioText, briefingText, prologueText, mapFileText, coverImage, apiKey,
        charactersData, factsData, mysteriesData, monologueData, theme, fontFamily, fontSize, isVertical, sidebarWidth, isSidebarOpen, scenarioTitle, endingPhase, reviewMessages, supportMessages, supportStorySnapshots, supportSuggestions, supportPersonaPath,
        mapLayers, currentPos
      };

      const fileNameTitle = scenarioTitle.trim().replace(/[\/\\?%*:|"<>]/g, '_');
      const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date();
      const datePart = now.getFullYear().toString() + (now.getMonth() + 1).toString().padStart(2, '0') + now.getDate().toString().padStart(2, '0');
      const timePart = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
      a.download = `${fileNameTitle}_${datePart}_${timePart}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('セーブデータをダウンロード保存しました');
      setShowSettings(false);
    } catch {
      alert("セーブに失敗しました");
    }
  };

  const handleLoadData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        restoreStateData(parsed);
        showToast('セーブデータを復元しました');
        setShowSettings(false);
      } catch {
        alert("ロードに失敗しました。ファイル形式が不正です。");
      }
    };
    input.click();
  };

  const handleAutoSaveLoad = async (key: string) => {
    const data = await loadFromIDB<StoredGameState>(key);
    if (data) {
      sessionStorage.setItem('chatnoir-current-save-key', key);
      restoreStateData(data);
      showToast('オートセーブデータから復帰しました');
    }
  };

  const handleDeleteSave = async (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`「${key.replace('auto_save_', '')}」のセーブデータを削除しますか？`)) {
      await deleteFromIDB(key);
      setAutoSaves(metas => metas.filter(m => m.key !== key));
      showToast('セーブデータを削除しました');
      if (sessionStorage.getItem('chatnoir-current-save-key') === key) {
        sessionStorage.removeItem('chatnoir-current-save-key');
      }
    }
  };

  // キャンセル用コントローラー
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- 通常の行動入力 ---
  const startScenarioDebugMode = () => {
    if (gameState !== 'PLAYING' || isLoading || isSupportLoading) return;

    scenarioDebugSessionRef.current += 1;
    isScenarioDebugModeRef.current = true;
    setIsScenarioDebugMode(true);
    if (!isSupportSidebarOpen && !isSupportModalOpen) {
      setIsSupportModalOpen(true);
    }
    showToast('シナリオデバッグモードを開始しました');
    void runScenarioDebugStep();
  };

  const sendMessage = async (overrideText?: string, isGm: boolean = false, options?: { automatedByDebug?: boolean }) => {
    const automatedByDebug = options?.automatedByDebug === true;
    const textToSend = overrideText !== undefined ? overrideText : (chatInputRef.current?.getCurrentText() ?? '');
    if (!textToSend.trim() || isLoading) return;

    const previousMessages = latestMessagesRef.current;
    const actualText = isGm ? `※GMへ：\n${textToSend}` : textToSend;
    const newUserMsg: AppMessage = { role: 'user', parts: [{ text: actualText }], isGm };
    const newHistory: AppMessage[] = [...previousMessages, newUserMsg];
    latestMessagesRef.current = newHistory;
    setMessages(newHistory);
    
    setIsLoading(true);
    debugAutomatedMessageRef.current = automatedByDebug;
    // 自分が送信した直後だけは一番下（最新の自分の入力）までスクロールさせる
    setTimeout(() => scrollToBottom(), 100);

    abortControllerRef.current = new AbortController();

    try {
      const res = await requestChatApi({
        apiKey: apiKey,
        model: selectedModel,
        messages: newHistory,
        systemInstruction: isGm
          ? gmRuleText + "\n\n" + scenarioText + "\n\n【GM質問モード】\nあなたはこのシナリオのGMとして、プレイヤーからのメタな質問・相談に答えます。現在の本編を続けて描写してはいけません。scene_blocks 形式の出力や小説本文の続きではなく、質問への回答だけを簡潔に返してください。位置・時刻のステータス行も不要です。"
          : gmRuleText + "\n\n" + scenarioText + "\n\n" + MAP_INSTRUCTION,
        fallbackEnabled,
        scenarioMeta,
        assistantMode: isGm ? 'gm' : undefined,
        abortSignal: abortControllerRef.current.signal,
      });
      const data = await res.json();
      if (res.ok) {
        const nextModelMessage: AppMessage = {
          role: 'model',
          parts: [{ text: typeof data.text === 'string' ? data.text : '' }],
          isGm,
          hasSpeakerWarning: data.hasSpeakerWarning === true,
        };
        const nextMessages: AppMessage[] = [...newHistory, nextModelMessage];
        latestMessagesRef.current = nextMessages;
        setMessages(nextMessages);
        // エンディング判定：AIのレスポンスに【終】が含まれていたらエンディング待機状態へ
        const hasReachedEnding = typeof data.text === 'string' && data.text.includes('【終】');
        if (hasReachedEnding && endingPhase === 'NONE') {
          setEndingPhase('READY_TO_END');
        }
        if (!isGm) {
          if (hasReachedEnding && isScenarioDebugModeRef.current) {
            stopScenarioDebugMode({
              showToast: false,
              abortRequests: false,
            });
            showToast('シナリオデバッグモードを停止しました。エンディングに到達しました');
          } else if (isScenarioDebugModeRef.current) {
            void runScenarioDebugStep();
          } else if (isAutoSupportMode && isSupportPersonaReady) {
            void sendSupportMessage(SUPPORT_SUGGESTION_PROMPT, { suppressPersonaNotice: true });
          }
        }
      } else {
        const errorStr = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        const isOverloaded = errorStr.includes('503') || errorStr.includes('demand') || errorStr.includes('UNAVAILABLE');
        const msg = isOverloaded
          ? "【ご案内】現在、AIサーバーが一時的に非常に混み合っています。自動リトライを行いましたが解決しませんでした。数十秒ほど待ってから、もう一度送信してみてください。"
          : "エラーが発生しました: " + errorStr;
        alert(msg);
        
        // 再送処理：履歴からユーザー発言を取り除き、入力欄に戻す
        latestMessagesRef.current = previousMessages;
        setMessages(previousMessages);
        if (isGm) {
          gmInputRef.current?.setValue(textToSend);
          setIsGmModalOpen(true);
        } else {
          chatInputRef.current?.setValue(textToSend);
        }

        if (automatedByDebug) {
          stopScenarioDebugMode({
            showToast: false,
            abortRequests: false,
          });
          showToast('シナリオデバッグモードを停止しました。自動送信に失敗しました');
        }
      }
    } catch (err: unknown) {
      if (isAbortError(err)) {
        console.log("出力が中断されました");
      } else {
        console.error(err);
        alert("通信に失敗しました。");
      }
      
      // 再送処理
      latestMessagesRef.current = previousMessages;
      setMessages(previousMessages);
      if (isGm) {
        gmInputRef.current?.setValue(textToSend);
        setIsGmModalOpen(true);
      } else {
        chatInputRef.current?.setValue(textToSend);
      }

      if (automatedByDebug && !isAbortError(err)) {
        stopScenarioDebugMode({
          showToast: false,
          abortRequests: false,
        });
        showToast('シナリオデバッグモードを停止しました。自動送信に失敗しました');
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      if (automatedByDebug) {
        debugAutomatedMessageRef.current = false;
      }
    }
  };

  const sendReviewMessage = async (initialPrompt?: string) => {
    const prompt = initialPrompt || reviewInputText;
    if (!prompt.trim() || isLoading) return;

    // 初回のみ本編履歴をベースにする
    const baseHistory = reviewMessages.length > 0 ? reviewMessages : messages;
    const isInitial = !!initialPrompt;
    const newHistory: AppMessage[] = [...baseHistory, { role: 'user', parts: [{ text: prompt }], isHidden: isInitial }];
    setReviewMessages(newHistory);
    setReviewInputText('');
    setIsLoading(true);

    abortControllerRef.current = new AbortController();

    const REVIEW_SYSTEM_PROMPT = `
【重要】ここからは本編クリア後の感想戦（ネタバレありのメタ会話）です。
あなたは、この物語の全てを知るGM「ロア」として、プレイヤーの旅を振り返ります。以下の手順に従って解説と感想を行ってください。

1. まず、設定ファイルに記述されていた**物語の全ての真相**と、**核心となる謎（セントラル・クエスチョン）に対する最終的な答え**を、分かりやすくプレイヤーに開示してください。
2. 次に、プレイヤーがゲーム中に下した**重要な選択**をいくつかピックアップし、その選択が他の登場人物の感情や物語の分岐に**どのように影響したか**を具体的に解説してください。（例：「あの場面で彼に正直に話したことで、彼の信頼度が大幅に上昇し、通常では得られない情報を得ることができました」）
3. プレイヤーが**見逃してしまった可能性のある重要な伏線や情報**について、その本来の意味と、どこで発見できた可能性があったかを解説してください。
4. 各登場人物（特にプレイヤーが深く関わった人物）の、プレイヤーが知り得なかった**最終的な内面や秘密**について語り、彼らの物語を補完してください。
5. 最後に、GM「ロア」個人の視点から、プレイヤーの旅路全体に対する感想や称賛の言葉を述べてください。
6. 全ての解説と感想の締めくくりとして、必ず以下の言葉を出力してください：
「もし、この物語について何か他に聞きたいことがあれば、何でも質問してください。」
`;

    try {
      const res = await requestChatApi({
        apiKey: apiKey,
        model: selectedModel,
        messages: newHistory,
        isReviewMode: true,
        systemInstruction: gmRuleText + "\n\n" + scenarioText + "\n\n" + REVIEW_SYSTEM_PROMPT,
        fallbackEnabled,
        scenarioMeta,
        abortSignal: abortControllerRef.current.signal,
      });
      const data = await res.json();
      if (res.ok) {
        const nextReviewMessage: AppMessage = {
          role: 'model',
          parts: [{ text: typeof data.text === 'string' ? data.text : '' }]
        };
        setReviewMessages([...newHistory, nextReviewMessage]);
      } else {
        const errorStr = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        alert("エラーが発生しました: " + errorStr);
        setReviewMessages(baseHistory);
        if (!isInitial) setReviewInputText(prompt);
      }
    } catch (err: unknown) {
      if (!isAbortError(err)) {
        console.error(err);
        alert("通信に失敗しました。");
      }
      setReviewMessages(baseHistory);
      if (!isInitial) setReviewInputText(prompt);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // --- メッセージ再生成 ---
  const regenerateMessage = async (targetIndex: number) => {
    if (isLoading) return;
    const capturedMessages = latestMessagesRef.current;
    const modelMsg = capturedMessages[targetIndex];
    if (!modelMsg || modelMsg.role !== 'model') return;

    const isGmRegen = modelMsg.isGm ?? false;
    const historyForRequest = capturedMessages.slice(0, targetIndex);

    latestMessagesRef.current = historyForRequest;
    setMessages(historyForRequest);
    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      const res = await requestChatApi({
        apiKey: apiKey,
        model: selectedModel,
        messages: historyForRequest,
        systemInstruction: isGmRegen
          ? gmRuleText + "\n\n" + scenarioText + "\n\n【GM質問モード】\nあなたはこのシナリオのGMとして、プレイヤーからのメタな質問・相談に答えます。現在の本編を続けて描写してはいけません。scene_blocks 形式の出力や小説本文の続きではなく、質問への回答だけを簡潔に返してください。位置・時刻のステータス行も不要です。"
          : gmRuleText + "\n\n" + scenarioText + "\n\n" + MAP_INSTRUCTION,
        fallbackEnabled,
        scenarioMeta,
        assistantMode: isGmRegen ? 'gm' : undefined,
        abortSignal: abortControllerRef.current.signal,
      });
      const data = await res.json();
      if (res.ok) {
        const newModelMessage: AppMessage = {
          role: 'model',
          parts: [{ text: typeof data.text === 'string' ? data.text : '' }],
          isGm: isGmRegen,
          hasSpeakerWarning: data.hasSpeakerWarning === true,
        };
        const nextMessages: AppMessage[] = [...historyForRequest, newModelMessage];
        latestMessagesRef.current = nextMessages;
        setMessages(nextMessages);
      } else {
        latestMessagesRef.current = capturedMessages;
        setMessages(capturedMessages);
        const errStr = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        alert('再生成に失敗しました: ' + errStr);
      }
    } catch (err: unknown) {
      latestMessagesRef.current = capturedMessages;
      setMessages(capturedMessages);
      if (!isAbortError(err)) alert('再生成中にエラーが発生しました。');
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };
  regenerateMessageRef.current = regenerateMessage;

  // --- ゲーム画面の描画最適化（入力毎の再レンダリング防止） ---
  const renderedMessages = useMemo(() => {
    return messages.map((msg, index) => {
      // システム起動メッセージ(0)とメインゲーム開始指示(2)は非表示
      if (index === 0 || index === 2) return null;
      if (msg.isGm) return null;

      return (
        <div
          key={index}
          className={`fade-in ${styles.messageRow}`}
        >
          {msg.role === 'user' && <span style={{ color: 'var(--text-muted)' }}>＞ </span>}
          <div
            className={styles.messageContent + " markdown-body"}
            style={{
              color: msg.role === 'user' ? 'var(--text-muted)' : 'var(--text-main)',
              fontStyle: 'normal',
              whiteSpace: 'pre-wrap'
            }}
          >
            {msg.hasSpeakerWarning && (
              <div style={{ color: '#b5890f', fontSize: '0.72rem', marginBottom: '0.4rem', opacity: 0.85, letterSpacing: '0.5px' }}>
                ⚠️ 発話者が不明なセリフが含まれています
              </div>
            )}
            <ReactMarkdown
              components={{
                p: ({ children }) => {
                  // 文字列「【終】」のみの段落を特定
                  const isEnd = Array.isArray(children)
                    ? (children.length === 1 && children[0] === '【終】')
                    : children === '【終】';

                  return <p className={isEnd ? 'end-mark' : ''}>{children}</p>;
                }
              }}
            >
              {formatNovelText(msg.parts[0].text, isVertical)}
            </ReactMarkdown>
          </div>
        </div>
      );
    });
  }, [messages, isVertical]);

  // サイドバーのどこかが更新中かどうかの判定
  const isAnySidebarUpdating = useMemo(() => {
    return isSidebarUpdating || charactersData.some(c => c.isGenerating);
  }, [isSidebarUpdating, charactersData]);

  const renderSupportPanel = (variant: 'modal' | 'sidebar') => {
    const isSidebarVariant = variant === 'sidebar';
    const supportHistoryEntries = supportMessages.map((message, index) => ({ message, index }));
    const visibleSupportMessages = supportHistoryEntries.filter(({ message }) => message.kind !== 'selected-suggestion' && message.kind !== 'debug-request');

    return (
      <div
        className="fade-in"
        style={{
          width: isSidebarVariant ? `${leftSidebarWidth}px` : 'min(720px, 100%)',
          height: isSidebarVariant ? '100%' : 'min(90vh, 820px)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          padding: isSidebarVariant ? '1.5rem' : '2rem',
          flexShrink: 0,
          background: 'var(--sidebar-bg)',
          border: isSidebarVariant ? 'none' : '1px solid var(--border-color)',
          borderRadius: isSidebarVariant ? '0' : '8px',
          boxShadow: isSidebarVariant ? 'none' : '0 10px 30px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(10px)',
          overflow: 'hidden'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: isSidebarVariant ? '0.5rem' : '0' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <img src={resolvePublicAssetPath(SUPPORT_AVATAR_PATH)} alt="ロア" style={{ width: isSidebarVariant ? '48px' : '56px', height: isSidebarVariant ? '48px' : '56px', borderRadius: '999px', objectFit: 'cover', border: '1px solid var(--border-color)' }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, color: 'var(--text-main)', letterSpacing: '2px', fontSize: isSidebarVariant ? '1.05rem' : '1.2rem' }}>おたすけロアちゃん</h3>
                {isScenarioDebugMode && (
                  <span style={{ padding: '0.2rem 0.55rem', borderRadius: '999px', background: 'var(--text-main)', color: 'var(--bg-color)', fontSize: '0.68rem', letterSpacing: '1px', fontWeight: 700 }}>DEBUG RUN</span>
                )}
              </div>
            </div>
          </div>
          {isSidebarVariant ? (
            <button onClick={() => setIsSupportSidebarOpen(false)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '0.4rem 0.9rem', letterSpacing: '1px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', transition: 'all 0.2s', whiteSpace: 'nowrap' }}>閉じる</button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button onClick={() => { setIsSupportModalOpen(false); setIsSupportSidebarOpen(true); }} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '0.4rem 0.9rem', letterSpacing: '1px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', transition: 'all 0.2s', whiteSpace: 'nowrap' }}>左で開く</button>
              <button onClick={closeSupportPanels} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingRight: '4px' }}>
          <div ref={supportScrollRef} style={{ flex: 1, minHeight: '180px', overflowY: 'auto', background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {visibleSupportMessages.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginTop: '2rem', lineHeight: 1.8 }}>まだ相談はありません。<br />「今の状況で何を入力すると良さそう？」のように聞くと、ロアが候補を一緒に考えます。</p>
            ) : (
              visibleSupportMessages.map(({ message, index }) => (
                <div key={index} data-support-anchor={`support-message-${index}`} style={{
                  background: message.kind === 'debug-selected-action'
                    ? 'rgba(0,0,0,0.08)'
                    : message.role === 'user'
                      ? 'transparent'
                      : 'var(--sidebar-bg)',
                  border: message.kind === 'debug-selected-action'
                    ? '1px dashed var(--text-main)'
                    : message.role === 'user'
                      ? 'none'
                      : '1px solid var(--border-color)',
                  padding: '0.8rem',
                  borderRadius: '8px',
                  color: message.kind === 'debug-selected-action'
                    ? 'var(--text-main)'
                    : message.role === 'user'
                      ? 'var(--text-muted)'
                      : 'var(--text-main)',
                  fontSize: '0.9rem',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.7
                }}>
                  {message.kind !== 'debug-selected-action' && (message.role === 'user' ? (
                    <span style={{ fontWeight: 'bold' }}>あなた：<br /></span>
                  ) : (
                    <span style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <img src={resolvePublicAssetPath(SUPPORT_AVATAR_PATH)} alt="ロア" style={{ width: '24px', height: '24px', borderRadius: '999px', objectFit: 'cover' }} />
                      ロア：
                    </span>
                  ))}
                  <ReactMarkdown>{message.parts[0].text}</ReactMarkdown>
                </div>
              ))
            )}
            {supportSuggestions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', background: 'rgba(0,0,0,0.08)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.9rem', flexShrink: 0 }}>
                <p style={{ margin: 0, fontSize: '0.78rem', letterSpacing: '1px', color: 'var(--text-muted)' }}>ロアの候補</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {supportSuggestions.map((suggestion, index) => (
                    <button
                      key={`${suggestion}-${index}`}
                      onClick={() => applySupportSuggestion(suggestion)}
                      style={{ textAlign: 'left', background: 'var(--sidebar-bg)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.8rem 0.9rem', cursor: 'pointer', lineHeight: 1.6, fontSize: '0.88rem' }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {isSupportPersonaLoading && (
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', flexShrink: 0 }}>ロア人格プロンプトを読み込み中です……</p>
            )}
            {supportPersonaLoadError && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', background: 'rgba(0,0,0,0.08)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem 0.9rem', flexShrink: 0 }}>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{supportPersonaLoadError}</p>
                <button onClick={reloadSupportPersonaPrompt} style={{ background: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '0.45rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}>再読込</button>
              </div>
            )}
            {isSupportLoading && (
              <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem', textAlign: 'center' }}>ロアが次の一手を考えています……</p>
            )}
          </div>
        </div>

        <ChatInput
          ref={supportInputRef}
          onSend={() => sendSupportMessage()}
          disabled={isSupportActionDisabled}
          style={{ width: '100%', minHeight: '72px', maxHeight: '140px', background: 'var(--chat-input-bg)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '4px', resize: 'vertical', fontSize: '0.9rem', fontFamily: 'inherit', flexShrink: 0 }}
          placeholder={isScenarioDebugMode
            ? 'シナリオデバッグモード中です。停止すると手動で相談できます。'
            : isSupportPersonaLoading
              ? 'ロア人格プロンプトを読み込み中です。'
              : supportPersonaLoadError
                ? 'support-personas/lore-support.md を確認して再読込してください。'
                : '例：今の状況だと何を調べるとよさそう？ / この人物への聞き方を一緒に考えて'}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: isSidebarVariant ? '1.5rem' : '0' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => sendSupportMessage(SUPPORT_SUGGESTION_PROMPT)} disabled={isSupportActionDisabled} style={{ background: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '0.6rem 1rem', borderRadius: '4px', cursor: isSupportActionDisabled ? 'not-allowed' : 'pointer', opacity: isSupportActionDisabled ? 0.5 : 1, fontSize: '0.85rem' }}>ロアにおまかせ</button>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.75rem', color: isAutoSupportMode ? 'var(--text-main)' : 'var(--text-muted)', userSelect: 'none' }} title="本編が更新されるたびに自動でロアにおまかせを実行します">
              <div
                onClick={() => setIsAutoSupportMode(v => { const next = !v; try { localStorage.setItem('chatnoir_autoSupportMode', String(next)); } catch {} return next; })}
                style={{ width: '32px', height: '18px', borderRadius: '9px', background: isAutoSupportMode ? 'var(--text-main)' : 'var(--border-color)', position: 'relative', transition: '0.2s', flexShrink: 0, cursor: 'pointer' }}
              >
                <div style={{ position: 'absolute', top: '3px', left: isAutoSupportMode ? '17px' : '3px', width: '12px', height: '12px', borderRadius: '50%', background: isAutoSupportMode ? 'var(--bg-color)' : 'var(--text-muted)', transition: '0.2s' }} />
              </div>
              自動
            </label>
            <button
              onClick={isScenarioDebugMode ? () => stopScenarioDebugMode() : () => startScenarioDebugMode()}
              disabled={!isScenarioDebugMode && (isLoading || isSupportLoading)}
              style={{
                background: isScenarioDebugMode ? 'var(--text-main)' : 'transparent',
                color: isScenarioDebugMode ? 'var(--bg-color)' : 'var(--text-main)',
                border: '1px solid var(--text-main)',
                padding: '0.6rem 1rem',
                borderRadius: '4px',
                cursor: (!isScenarioDebugMode && (isLoading || isSupportLoading)) ? 'not-allowed' : 'pointer',
                opacity: (!isScenarioDebugMode && (isLoading || isSupportLoading)) ? 0.5 : 1,
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              {isScenarioDebugMode ? 'デバッグ停止' : 'シナリオデバッグ開始'}
            </button>
          </div>
          <button onClick={() => { const t = supportInputRef.current?.getCurrentText() ?? ''; if (t.trim()) { supportInputRef.current?.clear(); sendSupportMessage(t); } }} disabled={isSupportActionDisabled} style={{ background: 'var(--text-main)', color: 'var(--bg-color)', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '4px', cursor: isSupportActionDisabled ? 'not-allowed' : 'pointer', opacity: isSupportActionDisabled ? 0.5 : 1, transition: '0.2s' }}>相談する</button>
        </div>
      </div>
    );
  };

  if (gameState === 'WELCOME') {
    return (
      <div className={`${styles.welcomeContainer} fade-in`}>
        <img src={resolvePublicAssetPath(APP_LOGO_WIDE_PATH)} alt="ChatNoir" className={styles.welcomeLogo} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button className={styles.welcomeBtn} onClick={() => { resetAllState(); setGameState('LOGIN'); }}>
            新しく入室する
          </button>

          {autoSaves.length > 0 && (
            <button className={styles.welcomeBtn} onClick={() => setGameState('SAVES')} style={{ background: 'var(--text-main)', color: 'var(--bg-color)', border: 'none', fontSize: '0.9rem', padding: '0.8rem 2rem' }}>
              続きから遊ぶ
            </button>
          )}

          <button className={styles.welcomeBtn} onClick={handleLoadData} style={{ background: 'transparent', color: '#666', border: '1px solid #ccc', fontSize: '0.8rem', padding: '0.6rem 2rem' }}>
            ファイルからロード
          </button>
        </div>
      </div>
    );
  }

  if (gameState === 'SAVES') {
    return (
      <div className="fade-in" style={{ minHeight: '100vh', width: '100vw', background: '#0a0a0a', color: '#fff', padding: '3rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: '1000px', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold', letterSpacing: '4px', display: 'flex', alignItems: 'center', gap: '12px', color: '#e0e0e0' }}>
              シナリオ一覧
            </h2>
            <button onClick={() => setGameState('WELCOME')} style={{ background: '#1a1a1a', color: '#ccc', border: '1px solid #333', padding: '0.6rem 1.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', letterSpacing: '1px', transition: 'all 0.2s' }}>
              トップ画面へ戻る
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', width: '100%', marginTop: '1rem' }}>
            {autoSaves.map(meta => (
              <div key={meta.key} style={{ display: 'flex', flexDirection: 'column', width: '280px', background: '#161616', border: '1px solid #2a2a2a', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                <div
                  onClick={() => handleAutoSaveLoad(meta.key)}
                  style={{ width: '100%', height: '160px', background: meta.coverImage ? `url(${meta.coverImage}) center/cover` : '#222', cursor: 'pointer', position: 'relative' }}
                >
                  {!meta.coverImage && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '0.8rem', letterSpacing: '2px' }}>NO IMAGE</div>}
                </div>
                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div
                    style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '1px', cursor: 'pointer' }}
                    title="クリックして名前を変更"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const currentName = meta.saveName || meta.key.replace('auto_save_', '').replace(/_[a-z0-9]+$/, '');
                      const newName = prompt('セーブデータの名前を入力してください：', currentName);
                      if (newName && newName.trim()) {
                        const data = await loadFromIDB<StoredGameState>(meta.key);
                        if (data) {
                          data.saveName = newName.trim();
                          await saveToIDB(meta.key, data);
                          setAutoSaves(prev => prev.map(m => m.key === meta.key ? { ...m, saveName: newName.trim() } : m));
                        }
                      }
                    }}
                  >
                    {meta.saveName || meta.key.replace('auto_save_', '').replace(/_[a-z0-9]+$/, '')}
                  </div>
                  {meta.saveName && (
                    <div style={{ color: '#777', fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {meta.key.replace('auto_save_', '').replace(/_[a-z0-9]+$/, '')}
                    </div>
                  )}
                  {meta.lastPlay && (
                    <div style={{ color: '#555', fontSize: '0.65rem' }}>
                      最終プレイ: {new Date(meta.lastPlay).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <button onClick={() => handleAutoSaveLoad(meta.key)} style={{ flex: 1, background: '#e0e0e0', color: '#000', border: 'none', padding: '6px 0', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', marginRight: '8px' }}>プレイ再開</button>
                    <button onClick={(e) => handleDeleteSave(meta.key, e)} style={{ background: 'transparent', color: '#ff4444', border: '1px solid rgba(255,68,68,0.4)', padding: '6px 12px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>削除</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {autoSaves.length === 0 && (
            <div style={{ padding: '4rem', textAlign: 'center', color: '#555', letterSpacing: '2px' }}>
              現在保存されているシナリオはありません
            </div>
          )}

        </div>
      </div>
    );
  }

  // --- APIキー入力・ファイルアップロード画面 ---
  if (gameState === 'LOGIN') {
    const dynamicStyles = `
      :root {
        --bg-color: ${theme === 'dark' ? '#121212' : '#fafafa'};
        --text-main: ${theme === 'dark' ? '#f0f0f0' : '#111'};
        --text-muted: ${theme === 'dark' ? '#aaa' : '#666'};
        --border-color: ${theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'};
        --sidebar-bg: ${theme === 'dark' ? 'rgba(25, 25, 25, 0.85)' : 'rgba(250, 250, 250, 0.85)'};
        --chat-input-bg: ${theme === 'dark' ? 'rgba(30, 30, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)'};
        --app-font: ${fontFamily === 'serif' ? 'var(--font-serif)' : fontFamily === 'sans' ? 'var(--font-sans)' : 'var(--font-klee)'};
        --app-font-size: ${fontSize}px;
        --ui-font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }
      body {
        background-color: var(--bg-color);
        color: var(--text-main);
        font-family: var(--app-font);
      }
      .markdown-body {
        font-family: var(--app-font) !important;
        font-size: var(--app-font-size) !important;
        color: var(--text-main) !important;
      }
      .markdown-body strong {
        color: ${theme === 'dark' ? '#fff' : '#000'} !important;
      }
    `;

    return (
      <div className={styles.container}>
        <style dangerouslySetInnerHTML={{ __html: dynamicStyles }} />
        <div className={`${styles.loginCard} fade-in`}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
            <button
              onClick={() => setGameState('WELCOME')}
              style={{ background: '#1a1a1a', color: '#ccc', border: '1px solid #333', padding: '0.6rem 1.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', letterSpacing: '1px', transition: 'all 0.2s' }}
            >
              トップ画面へ戻る
            </button>
          </div>
          <div style={{ width: '100%', marginBottom: '1.5rem', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {coverImage ? (
              <img src={resolvePublicAssetPath(coverImage)} alt="Cover" style={{ width: '100%', height: 'auto', maxHeight: '450px', objectFit: 'cover', display: 'block' }} />
            ) : (
              <img src={resolvePublicAssetPath(APP_LOGO_PATH)} alt="Chat;Noir" style={{ width: '100%', height: 'auto', maxHeight: '450px', objectFit: 'contain', display: 'block', padding: '2rem' }} />
            )}
          </div>

          {/* シナリオライブラリ（保存済みマスターデータ + サンプル） */}
          <div style={{ marginBottom: '2rem' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.8rem', letterSpacing: '1px', fontWeight: 'bold' }}>シナリオライブラリから選ぶ</p>
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px' }}>
              {/* サンプルシナリオを先頭に追加 */}
              {[
                {
                  title: '【サンプルシナリオ】歯車仕掛けの手紙',
                  isSample: true,
                  coverImage: DEFAULT_SAMPLE_COVER_PATH,
                  lastUpdated: new Date(0).toISOString() // 常に一番後ろにならないよう適宜調整
                },
                ...masterScenarios.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
              ].map((s, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    if (s.isSample) {
                      loadDefaultScenario();
                      setScenarioTitle(s.title);
                      showToast('サンプルシナリオを読み込みました');
                    } else {
                      setGmRuleText(s.gmRuleText || '');
                      setScenarioText(s.scenarioText || '');
                      setBriefingText(s.briefingText || '');
                      setPrologueText(s.prologueText || '');
                      setMapFileText(s.mapFileText || '');
                      const storedMapState = normalizeStoredMapState(s);
                      setMapLayers(storedMapState.layers);
                      setCurrentPos(storedMapState.currentPos || cloneDefaultCurrentPos());
                      setActiveLayer(storedMapState.currentPos?.layer || Object.keys(storedMapState.layers)[0] || DEFAULT_MAP_LAYER_NAME);
                      setCoverImage(s.coverImage || '');
                      setScenarioTitle(s.title || '');
                      setScenarioMeta(s.scenarioMeta || {});
                      showToast(`${s.title} を読み込みました`);
                    }
                  }}
                  style={{
                    flexShrink: 0,
                    width: '120px',
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <div style={{ position: 'relative' }}>
                    {s.coverImage ? (
                      <img 
                        src={resolvePublicAssetPath(s.coverImage)} 
                        alt={s.title} 
                        style={{ width: '120px', height: 'auto', borderRadius: '4px', border: scenarioTitle === s.title ? '2px solid #fff' : '1px solid #333', marginBottom: '6px', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }} 
                      />
                    ) : (
                      <div style={{ width: '120px', height: '160px', borderRadius: '4px', background: '#222', border: '1px solid #333', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#555' }}>NO IMAGE</div>
                    )}
                  </div>
                  <div style={{ 
                    fontSize: '0.7rem', 
                    color: 'var(--text-main)', 
                    width: '100%', 
                    marginTop: '8px',
                    textAlign: 'center',
                    lineHeight: '1.2',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordBreak: 'break-all',
                    letterSpacing: '0.5px'
                  }}>
                    {s.title}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.inputWrapper}>
            <input
              type="password"
              className={styles.input}
              placeholder="Google AI Studio API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />

            <div style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '0.9rem 1rem', marginBottom: '0.9rem' }}>
              <p style={{ fontSize: '0.76rem', color: '#111', marginBottom: '0.45rem', fontWeight: 700, letterSpacing: '0.6px' }}>
                APIキーの保存について
              </p>
              <p style={{ fontSize: '0.72rem', color: '#444', lineHeight: 1.7, marginBottom: '0.55rem' }}>
                入力したAPIキーは GitHub やこのサイトのセーブデータには保存されません。AI応答を作るときだけ、あなたのブラウザから Google API へ直接送信されます。
              </p>
              <p style={{ fontSize: '0.72rem', color: '#666', lineHeight: 1.7, margin: 0 }}>
                共用PCでは「一時保存」をおすすめします。利用後にブラウザを閉じるとキーが消えます。
              </p>
            </div>

            <div style={{ marginBottom: '0.9rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block', letterSpacing: '1px' }}>APIキーの保存方法</label>
              <select
                value={apiKeyStorageMode}
                onChange={(e) => {
                  const nextMode = e.target.value;
                  if (!isApiKeyStorageMode(nextMode)) return;
                  setApiKeyStorageMode(nextMode);
                  persistApiKey(apiKey, nextMode);
                }}
                style={{ width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.5)', color: '#111', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '2px', fontFamily: 'inherit' }}
              >
                <option value="session">一時保存: ブラウザを閉じると消える（推奨）</option>
                <option value="local">この端末に保存: 次回も自動入力する</option>
              </select>
              <p style={{ fontSize: '0.72rem', color: '#666', lineHeight: 1.7, marginTop: '0.45rem', marginBottom: 0 }}>
                一時保存は sessionStorage、端末保存は localStorage を使います。どちらもこのブラウザ内だけに保存されます。
              </p>
            </div>

            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{ width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.5)', color: '#111', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '2px', fontFamily: 'inherit' }}
            >
              <option value="gemma-4-31b-it">Gemma 4 31B（推奨）</option>
              <option value="gemma-4-26b-a4b-it">Gemma 4 26B</option>
              <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite（軽量高速）</option>
            </select>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
              <span style={{ fontSize: '0.8rem', color: '#555' }}>フォールバック（混雑時に自動で下位モデルへ切替）</span>
              <div
                onClick={() => setFallbackEnabled(!fallbackEnabled)}
                style={{ width: '40px', height: '20px', background: fallbackEnabled ? '#4a7c59' : '#ccc', borderRadius: '20px', position: 'relative', cursor: 'pointer', transition: 'background 0.3s', flexShrink: 0 }}
              >
                <div style={{ position: 'absolute', top: '2px', left: fallbackEnabled ? '22px' : '2px', width: '16px', height: '16px', background: '#fff', borderRadius: '50%', transition: 'left 0.3s' }} />
              </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block', letterSpacing: '1px' }}>プロジェクト名（必須）</label>
              <input
                type="text"
                className={styles.input}
                placeholder="例：1周目、Aルート、2024プレイ等"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
              />
            </div>

            <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.03)', padding: '1.5rem', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)', marginTop: '1rem', marginBottom: '2rem' }}>
              <p style={{ fontSize: '0.85rem', color: '#111', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)', fontWeight: 'bold', letterSpacing: '1px' }}>
                ファイルを一括選択
              </p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                設定ファイル・概要・プロローグ・ルール・画像を<br />まとめて選択して一気に準備できます。
              </p>
              <FileUploadTrigger
                accept=".md,.txt,image/*"
                multiple
                fullWidth
                onChange={handleMultiFileRead}
                buttonLabel="ファイルをまとめて選ぶ"
                helperText={scenarioSetupReadyCount > 0
                  ? `現在の準備状況: ${scenarioSetupReadyCount}/6 項目を読み込み済みです。再選択すると上書きされます。`
                  : '一括アップロード後の内容は下の各項目に反映されます。'}
              />
            </div>

            <div style={{ position: 'relative', textAlign: 'center', margin: '2rem 0' }}>
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'var(--border-color)', zIndex: 1 }}></div>
              <span style={{ position: 'relative', zIndex: 2, background: 'var(--sidebar-bg)', padding: '0 1rem', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '1px' }}>
                または、個別に細かく設定
              </span>
            </div>
            <div style={{ textAlign: 'left', background: 'transparent', padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.8rem', color: '#111', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)', letterSpacing: '1px' }}>
                <IconImage /> パッケージ画像
                {coverImage && <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '0.7rem' }}>✓ 準備完了</span>}
              </p>
              <FileUploadTrigger accept="image/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (evt) => setCoverImage(evt.target?.result as string);
                  reader.readAsDataURL(file);
                }
                e.target.value = '';
              }} helperText={coverImage ? '画像を読み込み済みです。再選択すると上書きします。' : 'パッケージ画像を選ぶとここに反映されます。'} />
            </div>

            <div style={{ textAlign: 'left', background: 'transparent', padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.8rem', color: '#111', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)', letterSpacing: '1px' }}>
                <IconFile /> 設定ファイル
                {scenarioText && <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '0.7rem' }}>✓ 準備完了</span>}
              </p>
              <FileUploadTrigger accept=".md,.txt" onChange={(e) => handleFileRead(e, setScenarioText)} helperText={scenarioText ? '設定ファイルを読み込み済みです。再選択すると上書きします。' : '設定ファイルを選ぶとここに反映されます。'} />
            </div>

            <div style={{ textAlign: 'left', background: 'transparent', padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.8rem', color: '#111', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)', letterSpacing: '1px' }}>
                <IconFile /> 概要ファイル
                {briefingText && <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '0.7rem' }}>✓ 準備完了</span>}
              </p>
              <FileUploadTrigger accept=".md,.txt" onChange={(e) => handleFileRead(e, setBriefingText)} helperText={briefingText ? '概要ファイルを読み込み済みです。再選択すると上書きします。' : '概要ファイルを選ぶとここに反映されます。'} />
            </div>

            <div style={{ textAlign: 'left', background: 'transparent', padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.8rem', color: '#111', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)', letterSpacing: '1px' }}>
                <IconFile /> プロローグ
                {prologueText && <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '0.7rem' }}>✓ 準備完了</span>}
              </p>
              <FileUploadTrigger accept=".md,.txt" onChange={(e) => handleFileRead(e, setPrologueText)} helperText={prologueText ? 'プロローグを読み込み済みです。再選択すると上書きします。' : 'プロローグファイルを選ぶとここに反映されます。'} />
            </div>

            <div style={{ textAlign: 'left', background: 'transparent', padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.8rem', color: '#111', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)', letterSpacing: '1px' }}>
                <IconMap size={14} style={{ marginRight: '4px' }} /> マップ情報
                {mapFileText && <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '0.7rem' }}>✓ 準備完了</span>}
              </p>
              <FileUploadTrigger accept=".md,.txt" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (evt) => {
                    const text = evt.target?.result as string;
                    setMapFileText(text);
                    setMapFileText(text);

                    const parsedMapState = parseMapState(text);
                    if (parsedMapState) {
                      try {
                        applyMapState(parsedMapState);
                        showToast('マップ情報を読み込みました');
                      } catch (e) {
                        console.warn('マップJSONのパースに失敗:', e);
                      }
                    }
                  };
                  reader.readAsText(file);
                }
                e.target.value = '';
              }} helperText={mapFileText ? 'マップ情報を読み込み済みです。再選択すると上書きします。' : '地図ファイルを選ぶとここに反映されます。'} />
            </div>

            <div style={{ textAlign: 'left', background: 'transparent', padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.8rem', color: '#111', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)', letterSpacing: '1px' }}>
                <IconFile /> メタデータ
                {hasRequiredScenarioMeta(scenarioMeta) && <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '0.7rem' }}>✓ 準備完了</span>}
              </p>

              <FileUploadTrigger accept=".md,.txt" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (evt) => {
                    const text = evt.target?.result as string;
                    const extractedScenarioMeta = extractScenarioMetaFromText(text);
                    if (extractedScenarioMeta && hasRequiredScenarioMeta(extractedScenarioMeta)) {
                      setScenarioMeta((prev) => mergeScenarioMetaData(prev, extractedScenarioMeta));
                      showToast('メタデータを読み込みました');
                    } else {
                      alert('ファイル内のメタデータから主人公名と一人称を読み取れませんでした。形式を確認してください。');
                    }
                  };
                  reader.readAsText(file);
                }
                e.target.value = '';
              }} helperText={hasRequiredScenarioMeta(scenarioMeta) ? '主人公名と一人称を読み込み済みです。再選択すると上書きします。' : 'メタデータファイルから主人公名と一人称を読み込みます。'} />
            </div>


            <div style={{ textAlign: 'left', background: 'transparent', padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.1)', opacity: 0.7 }}>
              <p style={{ fontSize: '0.8rem', color: '#111', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)', letterSpacing: '1px' }}>
                <IconFile /> GMルール
                {isCustomGmRule
                  ? <span style={{ color: '#f59e0b', marginLeft: '8px', fontSize: '0.7rem' }}>✎ カスタムルール適用中</span>
                  : <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '0.7rem' }}>✓ 内蔵ルールを使用中</span>
                }
              </p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>独自ルールに差し替える場合のみアップロード</p>
              <FileUploadTrigger accept=".md,.txt" onChange={(e) => { handleFileRead(e, setGmRuleText); setIsCustomGmRule(true); }} helperText={isCustomGmRule ? '現在はカスタムルールを反映中です。再選択すると上書きします。' : '内蔵ルールを使う場合はアップロード不要です。'} />
            </div>

            <button
              className={styles.btn}
              onClick={handleStartLogin}
              style={{ opacity: (!apiKey || !scenarioText || !prologueText || !briefingText) ? 0.5 : 1 }}
            >
              物語の準備へ
            </button>
          </div>
        </div>
      </div>
    );
  }


  // --- ゲーム画面（プレイング 兼 ブリーフィング） ---
  return (
    <div className={styles.gameLayout}>
      <style dangerouslySetInnerHTML={{
        __html: `
        :root {
          --bg-color: ${theme === 'dark' ? '#121212' : '#fafafa'};
          --text-main: ${theme === 'dark' ? '#f0f0f0' : '#111'};
          --text-muted: ${theme === 'dark' ? '#aaa' : '#666'};
          --border-color: ${theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'};
          --sidebar-bg: ${theme === 'dark' ? 'rgba(25, 25, 25, 0.85)' : 'rgba(250, 250, 250, 0.85)'};
          --chat-input-bg: ${theme === 'dark' ? 'rgba(30, 30, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)'};
          --app-font: ${fontFamily === 'serif' ? 'var(--font-serif)' : fontFamily === 'sans' ? 'var(--font-sans)' : 'var(--font-klee)'};
          --app-font-size: ${fontSize}px;
          --ui-font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        ${isVertical ? `
          .markdown-body {
            text-orientation: mixed;
          }
          .markdown-body p {
            margin-block-end: 2.5em !important;
          }
          .${styles.messageRow} {
            margin-bottom: 0 !important;
            margin-left: 3.5rem !important;
          }
          .review-markdown ul, .review-markdown ol {
            padding-left: 1.8rem;
            margin-top: 0.8rem;
            margin-bottom: 0.8rem;
          }
        ` : ''}
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
          100% { transform: scale(1); opacity: 1; }
        }
        .pulse {
          animation: pulse 2s infinite ease-in-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-in {
          animation: fadeIn 0.4s ease-out forwards;
        }
      ` }} />

      {/* UI背景（単色無地） */}
      <div className={styles.overlayGradient} />
      {gameState === 'BRIEFING' && <div className={styles.briefingOverlay} />}

      {toastMsg && <div className={styles.toast}>{toastMsg}</div>}

      {/* 感想戦 / ロア相談（左サイドバー） */}
      <aside style={{ position: 'relative', width: (endingPhase === 'REVIEW' || isSupportSidebarOpen) ? `${leftSidebarWidth}px` : '0px', transition: leftDragRef.current ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)', overflow: 'hidden', background: 'var(--sidebar-bg)', borderRight: (endingPhase === 'REVIEW' || isSupportSidebarOpen) ? '1px solid var(--border-color)' : 'none', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
        <div
          onMouseDown={() => { leftDragRef.current = true; document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none'; }}
          style={{ position: 'absolute', top: 0, right: 0, width: '6px', height: '100%', cursor: 'ew-resize', zIndex: 100, background: 'transparent' }}
        />
        {endingPhase === 'REVIEW' && (
          <div className="fade-in" style={{ width: `${leftSidebarWidth}px`, height: '100%', display: 'flex', flexDirection: 'column', padding: '1.5rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
              <h2 style={{ letterSpacing: '2px', margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>感想戦</h2>
              <button onClick={() => setEndingPhase('MENU')} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '0.4rem 1rem', letterSpacing: '1px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', transition: 'all 0.2s' }}>MENUへ戻る</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem', paddingRight: '0.5rem' }}>
              {reviewMessages.map((msg, idx) => {
                // 本編履歴や非表示プロンプトは表示しない
                if (idx < messages.length || msg.isHidden) return null;
                return (
                  <div key={idx} className="review-markdown" style={{ color: msg.role === 'user' ? 'var(--text-muted)' : 'var(--text-main)', whiteSpace: 'pre-wrap', background: msg.role === 'user' ? 'transparent' : 'var(--bg-color)', padding: '1rem', borderRadius: '8px', border: msg.role !== 'user' ? '1px solid var(--border-color)' : 'none', lineHeight: 1.8, fontSize: '0.9rem' }}>
                    {msg.role === 'user' && '＞ '}
                    <ReactMarkdown>{formatNovelText(msg.parts[0].text, false)}</ReactMarkdown>
                  </div>
                );
              })}
              {isLoading && <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '1rem', fontSize: '0.9rem' }}>🖋 GMが執筆中……</p>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
              <textarea
                value={reviewInputText}
                onChange={e => setReviewInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendReviewMessage();
                  }
                }}
                placeholder="GMに質問する... (Enterで送信、Shift+Enterで改行)"
                style={{ width: '100%', background: 'var(--chat-input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '0.8rem', borderRadius: '4px', minHeight: '60px', fontFamily: 'inherit', resize: 'vertical', fontSize: '0.9rem' }}
              />
              <button onClick={() => sendReviewMessage()} disabled={isLoading || !reviewInputText.trim()} style={{ width: '100%', background: 'var(--text-main)', color: 'var(--bg-color)', border: 'none', padding: '0.8rem', borderRadius: '4px', cursor: isLoading ? 'not-allowed' : 'pointer', letterSpacing: '2px', opacity: (isLoading || !reviewInputText.trim()) ? 0.5 : 1, fontSize: '0.9rem' }}>
                送信
              </button>
            </div>
          </div>
        )}
        {endingPhase !== 'REVIEW' && isSupportSidebarOpen && renderSupportPanel('sidebar')}
      </aside>

      <main className={styles.mainChat}>
        <div
          className={styles.chatHistory}
          ref={scrollRef}
          style={{
            writingMode: (isVertical && gameState === 'PLAYING') ? 'vertical-rl' : 'horizontal-tb',
            overflowX: (isVertical && gameState === 'PLAYING') ? 'auto' : 'hidden',
            overflowY: (isVertical && gameState === 'PLAYING') ? 'hidden' : 'auto'
          }}
        >

          {/* ブリーフィング（導入）画面 */}
          {gameState === 'BRIEFING' && (
            <div className="fade-in" style={{ maxWidth: '800px', margin: '0 auto', paddingTop: '2rem', position: 'relative', zIndex: 11 }}>
              <h2 style={{ fontFamily: 'var(--app-font)', color: 'var(--text-main)', marginBottom: '2rem', textAlign: 'center', letterSpacing: '4px', borderBottom: 'none' }}>
                INTRODUCTION
              </h2>
              <div className="markdown-body" style={{ background: 'var(--sidebar-bg)', padding: '3rem 4rem', borderRadius: '4px', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}>
                {briefingText ? (
                  <ReactMarkdown>{formatNovelText(briefingText, false)}</ReactMarkdown>
                ) : (
                  <p>No briefing file loaded.</p>
                )}
              </div>
              <div style={{ textAlign: 'center', marginTop: '4rem' }}>
                <button
                  className={styles.btn}
                  onClick={startInitialChat}
                  style={{ padding: '1.2rem 4rem', fontSize: '1.2rem', background: '#111', color: '#fff', border: 'none' }}
                >
                  プロローグを読む
                </button>
              </div>
            </div>
          )}

          {/* プレイ中のチャット表示 */}
          {gameState === 'PLAYING' && renderedMessages}

          {/* エンディング「幕を閉じる」ボタン */}
          {gameState === 'PLAYING' && endingPhase === 'READY_TO_END' && (
            <div className="fade-in" style={{
              textAlign: isVertical ? 'left' : 'center',
              marginTop: isVertical ? '0' : '4rem',
              marginLeft: isVertical ? '4rem' : '0',
              marginBottom: '6rem',
              display: 'flex',
              flexDirection: isVertical ? 'column' : 'column',
              alignItems: isVertical ? 'center' : 'center',
            }}>
              <button
                className={styles.btn}
                onClick={() => {
                  setIsSidebarOpen(false);
                  setEndingPhase('FADE_OUT');
                  setTimeout(() => setEndingPhase('MENU'), 3000);
                }}
                style={{
                  padding: isVertical ? '3rem 1.5rem' : '1.5rem 5rem',
                  fontSize: '1.2rem',
                  background: 'var(--text-main)',
                  color: 'var(--bg-color)',
                  border: 'none',
                  letterSpacing: '8px',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                  transition: 'transform 0.3s ease'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                幕を閉じる
              </button>
            </div>
          )}

          {/* プロローグ表示後の「物語に入る」ボタン（フェーズ2がまだ開始されていない時のみ） */}
          {gameState === 'PLAYING' && messages.length <= 2 && !isLoading && (
            <div className="fade-in" style={{
              textAlign: isVertical ? 'left' : 'center',
              marginTop: isVertical ? '0' : '3rem',
              marginLeft: isVertical ? '3rem' : '0',
              marginBottom: '2rem',
              display: 'flex',
              flexDirection: isVertical ? 'column' : 'column',
              alignItems: isVertical ? 'center' : 'center',
              gap: '1.5rem',
            }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', letterSpacing: '2px', fontFamily: 'var(--app-font)', margin: 0, lineHeight: 2 }}>
                ここから、あなたの行動が物語を動かします。{isVertical ? '' : <br />}用意ができたら「物語に入る」を押してください。
              </p>
              <button
                className={styles.btn}
                onClick={startPhase2}
                style={{ padding: isVertical ? '2rem 1rem' : '1rem 4rem', fontSize: '1rem', background: 'var(--text-main)', color: 'var(--bg-color)', border: 'none', letterSpacing: '4px', whiteSpace: 'nowrap' }}
              >
                物語に入る
              </button>
            </div>
          )}

          {isLoading && (
            <div className="fade-in writing-indicator" style={{ color: 'var(--text-muted)', marginTop: '2rem', fontStyle: 'italic' }}>
              🖋 執筆中……
            </div>
          )}
        </div>

        {/* フローティング「手帳を開く」ボタン */}
        {!isSidebarOpen && gameState === 'PLAYING' && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            style={{ position: 'fixed', top: '20px', right: '0', background: '#333', color: '#fff', padding: '14px 8px 16px 10px', borderRadius: '24px 0 0 24px', border: 'none', cursor: 'pointer', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', writingMode: 'vertical-rl', textOrientation: 'mixed', boxShadow: '-2px 2px 10px rgba(0,0,0,0.2)', fontSize: '0.8rem', letterSpacing: '1px', minHeight: '150px' }}
          >
            手帳を開く
          </button>
        )}

        {/* フローティング「おたすけを開く」ボタン */}
        {!isSupportSidebarOpen && !isSupportModalOpen && endingPhase !== 'REVIEW' && gameState === 'PLAYING' && (
          <button
            onClick={() => setIsSupportSidebarOpen(true)}
            style={{ position: 'fixed', top: '20px', left: '0', background: '#333', color: '#fff', padding: '14px 10px 16px 8px', borderRadius: '0 24px 24px 0', border: 'none', cursor: 'pointer', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', writingMode: 'vertical-rl', textOrientation: 'mixed', boxShadow: '2px 2px 10px rgba(0,0,0,0.2)', fontSize: '0.8rem', letterSpacing: '1px', minHeight: '150px' }}
          >
            おたすけを開く
          </button>
        )}

        {/* エンディング演出オーバーレイ */}
        {(endingPhase === 'FADE_OUT' || endingPhase === 'MENU') && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: '#000', zIndex: 1000,
            display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'center',
            opacity: endingPhase === 'FADE_OUT' ? 0 : 1,
            animation: endingPhase === 'FADE_OUT' ? 'fadeInSlow 3s ease-in-out forwards' : 'none',
            color: '#fff', fontFamily: 'var(--font-serif)',
          }}>
            {endingPhase === 'FADE_OUT' && (
              <div style={{ animation: 'fadeInSlow 2.5s ease-in-out forwards', padding: '2rem', height: '100%', display: 'flex', alignItems: 'center' }}>
                <p style={{ letterSpacing: '4px', fontSize: '1.2rem', textAlign: 'center', lineHeight: 2 }}>
                  ― あなたの物語はここで幕を閉じます ―
                </p>
              </div>
            )}
            {endingPhase === 'MENU' && (
              <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center', maxWidth: '600px', width: '100%', padding: '2rem' }}>
                <h2 style={{ letterSpacing: '8px', fontSize: '2rem', marginBottom: '1rem', color: '#fff', fontWeight: 'bold' }}>THE END</h2>
                <p style={{ color: '#aaa', letterSpacing: '2px', marginBottom: '2rem', textAlign: 'center', fontSize: '1rem' }}>
                  素晴らしい物語でした。<br />ここから先はどうしますか？
                </p>
                
                <button onClick={() => {
                  setEndingPhase('REVIEW');
                  sendReviewMessage("シナリオクリアお疲れ様でした！それでは、感想戦をよろしくお願いします！");
                }} style={{ background: 'var(--accent-glow)', border: '1px solid var(--accent-red)', padding: '1.5rem 3rem', color: '#fff', fontSize: '1.1rem', letterSpacing: '2px', borderRadius: '8px', width: '100%', cursor: 'pointer', backdropFilter: 'blur(10px)', transition: '0.3s' }}
                onMouseOver={(e) => e.currentTarget.style.background = 'var(--accent-red)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'var(--accent-glow)'}>
                  感想戦をはじめる（ネタバレあり解説）
                </button>

                <button onClick={() => {
                  setEndingPhase('NONE');
                  showToast('エピローグの続きを再開しました');
                }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '1rem 3rem', color: '#aaa', fontSize: '1rem', letterSpacing: '2px', borderRadius: '8px', width: '100%', cursor: 'pointer', transition: '0.3s' }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#aaa'; }}>
                  エピローグの続きを遊ぶ（フリーモード）
                </button>

                <button onClick={handleDownloadPlayLog} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '1rem 3rem', color: '#aaa', fontSize: '1rem', letterSpacing: '2px', borderRadius: '8px', width: '100%', cursor: 'pointer', transition: '0.3s' }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#aaa'; }}>
                  物語をテキスト形式で出力する（プレイログ）
                </button>

                <button onClick={handleSaveData} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '1rem 3rem', color: '#aaa', fontSize: '1rem', letterSpacing: '2px', borderRadius: '8px', width: '100%', cursor: 'pointer', transition: '0.3s' }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#aaa'; }}>
                  システム状態をまるごとセーブデータとして保存
                </button>

                <button onClick={() => { resetAllState(); setGameState('WELCOME'); }} style={{ background: 'transparent', border: 'none', padding: '1rem', color: '#666', fontSize: '0.9rem', letterSpacing: '2px', marginTop: '1rem', cursor: 'pointer', textDecoration: 'underline' }}
                onMouseOver={(e) => e.currentTarget.style.color = '#aaa'}
                onMouseOut={(e) => e.currentTarget.style.color = '#666'}>
                  トップ画面へ戻る
                </button>
              </div>
            )}
          </div>
        )}

        {/* 入力欄（ブリーフィング、エンディング演出中は非表示） */}
        <div className={styles.inputArea} style={{ display: (gameState === 'BRIEFING' || endingPhase === 'FADE_OUT' || endingPhase === 'MENU' || endingPhase === 'REVIEW') ? 'none' : 'flex', flexDirection: 'column', gap: '8px', zIndex: 100 }}>

          {/* 入力補助・特殊コマンドボタン */}
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  style={{ display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', color: 'var(--text-muted)', padding: '4px', fontSize: '1.2rem', cursor: 'pointer', transition: '0.3s' }}
                  title="画面設定"
                >
                  ⚙
                </button>
                {showSettings && (
                  <div style={{ position: 'absolute', bottom: '100%', left: '0', marginBottom: '8px', background: 'var(--sidebar-bg)', border: `1px solid var(--border-color)`, padding: '1rem', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '0.8rem', zIndex: 200, minWidth: '220px', boxShadow: '0 -4px 10px rgba(0,0,0,0.1)' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>設定</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>ダークモード</span>
                      <div
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        style={{
                          width: '40px', height: '20px', background: theme === 'dark' ? '#555' : '#ccc',
                          borderRadius: '20px', position: 'relative', cursor: 'pointer', transition: 'background 0.3s'
                        }}
                      >
                        <div style={{
                          position: 'absolute', top: '2px', left: theme === 'dark' ? '22px' : '2px',
                          width: '16px', height: '16px', background: '#fff', borderRadius: '50%', transition: 'left 0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }} />
                      </div>
                    </div>
                    <select value={fontFamily} onChange={e => setFontFamily(e.target.value as FontFamily)} style={{ background: 'var(--bg-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px' }}>
                      <option value="serif">明朝体 (Serif)</option>
                      <option value="sans">ゴシック体 (Sans)</option>
                      <option value="klee">手書き風 (Klee One)</option>
                    </select>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-main)', display: 'flex', justifyContent: 'space-between' }}>
                        文字サイズ: <span>{fontSize}px</span>
                      </label>
                      <input
                        type="range"
                        min="12"
                        max="28"
                        step="1"
                        value={fontSize}
                        onChange={e => setFontSize(Number(e.target.value))}
                        style={{ cursor: 'pointer' }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>縦書きモード</span>
                      <div
                        onClick={() => setIsVertical(!isVertical)}
                        style={{
                          width: '40px', height: '20px', background: isVertical ? '#555' : '#ccc',
                          borderRadius: '20px', position: 'relative', cursor: 'pointer', transition: 'background 0.3s'
                        }}
                      >
                        <div style={{
                          position: 'absolute', top: '2px', left: isVertical ? '22px' : '2px',
                          width: '16px', height: '16px', background: '#fff', borderRadius: '50%', transition: 'left 0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                      <button onClick={handleSaveData} style={{ flex: 1, background: 'var(--bg-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>手動セーブ</button>
                      <button onClick={handleLoadData} style={{ flex: 1, background: 'var(--bg-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>手動ロード</button>
                    </div>
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>AIモデル</p>
                      <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} style={{ background: 'var(--bg-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '0.75rem' }}>
                        <option value="gemma-4-31b-it">Gemma 4 31B</option>
                        <option value="gemma-4-26b-a4b-it">Gemma 4 26B</option>
                        <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite</option>
                      </select>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-main)' }}>フォールバック</span>
                        <div onClick={() => setFallbackEnabled(!fallbackEnabled)} style={{ width: '36px', height: '18px', background: fallbackEnabled ? '#4a7c59' : 'var(--border-color)', borderRadius: '18px', position: 'relative', cursor: 'pointer', transition: 'background 0.3s' }}>
                          <div style={{ position: 'absolute', top: '1px', left: fallbackEnabled ? '19px' : '1px', width: '16px', height: '16px', background: '#fff', borderRadius: '50%', transition: 'left 0.3s' }} />
                        </div>
                      </div>
                    </div>
                    <button onClick={() => { setGameState('SAVES'); setShowSettings(false); }} style={{ background: 'var(--text-main)', color: 'var(--bg-color)', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', marginTop: '4px', textAlign: 'center' }}>シナリオ選択画面へ</button>
                    <button onClick={() => {
                      if (confirm("トップ画面へ戻りますか？（現在の進行状況は自動セーブされています）")) {
                        setGameState('WELCOME'); 
                        setShowSettings(false);
                      }
                    }} style={{ background: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', marginTop: '4px', textAlign: 'center' }}>トップ画面へ戻る</button>
                  </div>
                )}
              </div>

              <button onClick={() => insertTags('「', '」')} style={{ fontSize: '0.75rem', color: 'var(--text-main)', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '2px', padding: '2px 8px', cursor: 'pointer' }}>「」セリフ</button>
              <button onClick={openSupportModal} style={{ fontSize: '0.75rem', color: 'var(--text-main)', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '2px', padding: '2px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <img src={resolvePublicAssetPath(SUPPORT_AVATAR_PATH)} alt="ロア" style={{ width: '18px', height: '18px', borderRadius: '999px', objectFit: 'cover' }} />
                ロアに相談する
              </button>
              <button onClick={() => setIsGmModalOpen(true)} style={{ fontSize: '0.75rem', color: 'var(--text-main)', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '2px', padding: '2px 8px', cursor: 'pointer' }}>GMに質問する</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', width: '100%', alignItems: 'flex-end' }}>
            <ChatInput
              ref={chatInputRef}
              className={styles.chatInput}
              style={{ minHeight: '80px', maxHeight: '300px', flex: 1, resize: 'none', padding: '12px' }}
              placeholder={isScenarioDebugMode ? 'シナリオデバッグモード実行中です。停止すると手動入力できます。' : 'Enterで送信、Shift+Enterで改行'}
              onSend={(text) => { sendMessage(text); }}
              disabled={isLoading || gameState === 'BRIEFING' || isScenarioDebugMode}
            />
            {/* GMモーダル */}
            {isGmModalOpen && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="fade-in" style={{ background: 'var(--sidebar-bg)', padding: '2rem', borderRadius: '8px', border: '1px solid var(--border-color)', width: '90%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', maxHeight: '90vh' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: 0, color: 'var(--text-main)', letterSpacing: '2px' }}>GMへ質問・相談する</h3>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, marginTop: '4px' }}>メタな質問や状況の確認などをGMに直接送ります。本編には表示されません。</p>
                    </div>
                    <button onClick={() => setIsGmModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                  </div>
                  
                  {/* GMチャット履歴表示エリア */}
                  <div ref={gmChatScrollRef} style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '200px' }}>
                    {messages.filter(m => m.isGm).length === 0 ? (
                       <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginTop: '2rem' }}>まだGMとのやりとりはありません</p>
                    ) : (
                      messages.filter(m => m.isGm).map((m, idx) => (
                        <div key={idx} style={{ 
                          background: m.role === 'user' ? 'transparent' : 'var(--sidebar-bg)',
                          border: m.role === 'user' ? 'none' : '1px solid var(--border-color)',
                          padding: '0.8rem', borderRadius: '4px', color: m.role === 'user' ? 'var(--text-muted)' : 'var(--text-main)',
                          fontSize: '0.9rem', whiteSpace: 'pre-wrap', lineHeight: 1.6
                        }}>
                          {m.role === 'user' && <span style={{ fontWeight: 'bold' }}>あなた：<br/></span>}
                          {m.role === 'model' && <span style={{ fontWeight: 'bold', color: 'var(--accent-red)' }}>GM：<br/></span>}
                          <ReactMarkdown>{m.parts[0].text.replace(/^※GMへ：\n/, '')}</ReactMarkdown>
                        </div>
                      ))
                    )}
                    {isLoading && messages[messages.length - 1]?.isGm && messages[messages.length - 1]?.role === 'user' && (
                      <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem', textAlign: 'center' }}>🖋 GMが執筆中……</p>
                    )}
                  </div>

                  <ChatInput
                    ref={gmInputRef}
                    onSend={(text) => { sendMessage(text, true); }}
                    disabled={isLoading}
                    style={{ width: '100%', minHeight: '80px', background: 'var(--chat-input-bg)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '4px', resize: 'vertical', fontSize: '0.9rem', fontFamily: 'inherit' }}
                    placeholder="例：今の部屋に窓はありますか？ / 一度セーブして中断したいです&#13;&#10;(Enterで送信、改行はShift+Enter)"
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button onClick={() => { const t = gmInputRef.current?.getCurrentText() ?? ''; if (t.trim()) { gmInputRef.current?.clear(); sendMessage(t, true); } }} disabled={isLoading} style={{ background: 'var(--text-main)', color: 'var(--bg-color)', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '4px', cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.5 : 1, transition: '0.2s' }}>送信する</button>
                  </div>
                </div>
              </div>
            )}

            {isSupportModalOpen && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
                {renderSupportPanel('modal')}
              </div>
            )}

            <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ position: 'absolute', top: '-45px', right: '0', width: '100%', display: 'flex', gap: '5px', zIndex: 10 }}>
                {/* 最新へ（左側） */}
                <button
                  onClick={scrollToBottom}
                  style={{
                    flex: 1, height: '36px', background: 'var(--sidebar-bg)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-muted)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', transition: 'color 0.2s'
                  }}
                  title="最新の文へ"
                >
                  <span style={{ transform: isVertical ? 'rotate(90deg)' : 'none', display: 'flex', alignItems: 'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M19 12l-7 7-7-7"/>
                    </svg>
                  </span>
                </button>

                {/* 先頭へ（右側） */}
                <button
                  onClick={scrollToTop}
                  style={{
                    flex: 1, height: '36px', background: 'var(--sidebar-bg)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-muted)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', transition: 'color 0.2s'
                  }}
                  title="先頭へ"
                >
                  <span style={{ transform: isVertical ? 'rotate(90deg)' : 'none', display: 'flex', alignItems: 'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 19V5M5 12l7-7 7 7"/>
                    </svg>
                  </span>
                </button>
              </div>
              <button
                className={styles.sendBtn}
                onClick={() => { const text = chatInputRef.current?.getCurrentText() ?? ''; if (text.trim()) { chatInputRef.current?.clear(); sendMessage(text); } }}
                disabled={isLoading || gameState === 'BRIEFING' || isScenarioDebugMode}
                style={{ height: '40px', padding: '0 2rem' }}
              >
                送信
              </button>
              {/* 再生成ボタン */}
              {(() => {
                let latestModelIndex = -1;
                for (let i = messages.length - 1; i >= 0; i--) {
                  if (messages[i].role === 'model' && !messages[i].isGm) { latestModelIndex = i; break; }
                }
                return latestModelIndex >= 0 ? (
                  <button
                    onClick={() => regenerateMessageRef.current?.(latestModelIndex)}
                    disabled={isLoading}
                    title="直前のAI出力を再生成する"
                    style={{ height: '40px', fontSize: '1.1rem', color: 'var(--text-muted)', background: 'transparent', border: 'none', padding: '0 8px', cursor: isLoading ? 'not-allowed' : 'pointer', opacity: 0.45, transition: 'opacity 0.2s', flexShrink: 0 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.9'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.45'; }}
                  >
                    ↺
                  </button>
                ) : null;
              })()}
            </div>
          </div>
        </div>
      </main>
      
      {/* 地図モーダル */}
      {isMapModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
          <div className="fade-in" style={{ background: '#fff', width: '90%', height: '90%', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
            {/* ヘッダー */}
            <div style={{ padding: '1rem 2rem', borderBottom: '1px solid rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.02)' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#111', letterSpacing: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <IconMap size={24} /> MAP <BetaBadge />
                </h2>
                <p style={{ margin: 0, fontSize: '0.7rem', color: '#666', marginTop: '4px' }}>現在地：{currentNodeLabel || currentPos.nodeId} - レイヤー: {currentPos.layer}</p>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button 
                  onClick={() => requestSpecialCommand('map')} 
                  disabled={isLoading}
                  style={{ background: '#111', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: isLoading ? 'not-allowed' : 'pointer', fontSize: '0.7rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '0.5rem', opacity: isLoading ? 0.6 : 1 }}
                >
                  {isMapUpdating ? <><IconRefresh size={12} /> 更新中…</> : <><IconRefresh size={12} /> 更新</>}
                </button>
                <button onClick={() => setIsMapModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#666', fontSize: '1.5rem', cursor: 'pointer', marginLeft: '1rem' }}>✕</button>
              </div>
            </div>

            {/* レイヤータブ */}
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.03)', padding: '0 2rem', borderBottom: '1px solid rgba(0,0,0,0.1)', gap: '10px', overflowX: 'auto' }}>
              {getMapLayerNames(mapLayers).map(layerName => (
                <button
                  key={layerName}
                  onClick={() => setActiveLayer(layerName)}
                  style={{
                    padding: '0.8rem 1.2rem',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: activeLayer === layerName ? '2px solid #111' : '2px solid transparent',
                    color: activeLayer === layerName ? '#111' : '#888',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: activeLayer === layerName ? 'bold' : 'normal',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {layerName} {currentPos.layer === layerName && <span style={{ marginLeft: '4px', color: '#f59e0b' }}>●</span>}
                </button>
              ))}
            </div>

            {/* マップ本体（React Flow描画エリア） */}
            <div style={{ flex: 1, overflow: 'auto', position: 'relative', background: '#fdfdfd', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MapFlowCanvas layer={mapLayers[activeLayer] || DEFAULT_MAP_STATE.layers[DEFAULT_MAP_LAYER_NAME]} currentNodeId={currentPos.nodeId} />
            </div>

            <div style={{ padding: '0.9rem 2rem', borderTop: '1px solid rgba(0,0,0,0.08)', background: '#fff', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#666', letterSpacing: '1px' }}>色の意味</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem 1rem' }}>
                {MAP_NODE_LEGEND_ITEMS.map((item) => (
                  <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: '168px' }}>
                    <span
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: item.pill ? '999px' : '6px',
                        background: item.colors.background,
                        border: `2px solid ${item.colors.border}`,
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: '0.78rem', color: '#374151' }}>{item.label} - {item.description}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* フッター */}
            <div style={{ padding: '0.8rem 2rem', background: 'rgba(0,0,0,0.03)', borderTop: '1px solid rgba(0,0,0,0.1)', color: '#888', fontSize: '0.7rem', display: 'flex', justifyContent: 'flex-end' }}>
              <span>ドラッグで移動、ホイールで拡大縮小</span>
            </div>
          </div>
        </div>
      )}

      {/* サイドバー（初期情報 ＋ 抽出された特殊コマンド情報） */}
      <aside 
        className={styles.sidebar} 
        style={{ 
          position: 'relative', 
          width: (isSidebarOpen && gameState === 'PLAYING') ? `${sidebarWidth}px` : '0px', 
          padding: 0, 
          overflowY: 'hidden', 
          overflowX: 'hidden', 
          borderLeft: isSidebarOpen ? '1px solid var(--border-color)' : 'none', 
          transition: dragRef.current ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
          opacity: (isSidebarOpen && gameState === 'PLAYING') ? (isAnySidebarUpdating ? 0.6 : 1) : 0, 
          pointerEvents: isAnySidebarUpdating ? 'none' : 'auto',
          display: 'flex', 
          flexDirection: 'column' 
        }}
      >
        {/* 更新中オーバーレイ（スクロールの影響を受けないよう外側に配置） */}
        {isAnySidebarUpdating && (
          <div style={{ 
            position: 'absolute', 
            top: 0, left: 0, right: 0, bottom: 0, 
            background: 'rgba(0,0,0,0.2)', 
            backdropFilter: 'blur(4px)',
            zIndex: 1000, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            pointerEvents: 'all'
          }}>
            <div style={{ 
              background: 'var(--sidebar-bg)', 
              padding: '10px 24px', 
              borderRadius: '24px', 
              fontSize: '0.75rem', 
              color: 'var(--text-main)', 
              border: '2px solid var(--border-color)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
              letterSpacing: '2px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <IconRefresh size={14} />
              <span>情報更新中...</span>
            </div>
          </div>
        )}

        <div
          onMouseDown={() => { dragRef.current = true; document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none'; }}
          style={{ position: 'absolute', top: 0, left: 0, width: '6px', height: '100%', cursor: 'ew-resize', zIndex: 100, background: 'transparent' }}
        />

        {/* 固定ヘッダー */}
        <div style={{ flexShrink: 0, background: 'var(--sidebar-bg)', zIndex: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', padding: '0.8rem 1.5rem' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => toggleAllSections(true)} style={{ fontSize: '0.7rem', padding: '3px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)', letterSpacing: '1px' }}>一括展開</button>
            <button onClick={() => toggleAllSections(false)} style={{ fontSize: '0.7rem', padding: '3px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)', letterSpacing: '1px' }}>一括折りたたみ</button>
            <button onClick={() => setIsMapModalOpen(true)} style={{ fontSize: '0.7rem', padding: '3px 8px', background: 'var(--text-main)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'var(--bg-color)', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <IconMap size={12} /> {isMapUpdating ? '地図（更新中…）' : '地図'}
            </button>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '4px 8px', letterSpacing: '1px' }}
          >
            ✕ 閉じる
          </button>
        </div>

        {/* スクロール可能なメインコンテンツ */}
        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '2rem 2rem 4rem 2.5rem', display: 'flex', flexDirection: 'column', gap: '4rem', scrollBehavior: 'smooth', position: 'relative' }}>
          {/* プレイヤーメモ */}
          <div className={styles.sidebarSection}>
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span onClick={() => setOpenSections(prev => ({ ...prev, memo: !prev.memo }))} style={{ cursor: 'pointer', flex: 1 }}>メモ</span>
              <span onClick={() => setOpenSections(prev => ({ ...prev, memo: !prev.memo }))} style={{ fontSize: '0.7rem', color: '#999', cursor: 'pointer' }}>{openSections.memo ? '▲' : '▼'}</span>
            </h3>
            {openSections.memo && (
              <div style={{ margin: '1rem 0' }}>
                <textarea
                  value={playerMemo}
                  onChange={(e) => setPlayerMemo(e.target.value)}
                  placeholder="気になったことや推理をここに書き留めておきましょう..."
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    padding: '10px 12px',
                    fontFamily: 'var(--app-font)',
                    fontSize: '0.85rem',
                    lineHeight: '1.8',
                    color: 'var(--text-main)',
                    background: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    resize: 'vertical',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}
          </div>

          {/* 人物情報JSONを展開 */}
          <div className={styles.sidebarSection}>
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span onClick={() => setOpenSections(prev => ({ ...prev, characters: !prev.characters }))} style={{ cursor: 'pointer', flex: 1 }}>登場人物</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); requestSpecialCommand('characters'); }}
                  disabled={isLoading}
                  style={{ fontSize: '0.65rem', padding: '3px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                >
                  <IconRefresh /> 更新
                </button>
                <span onClick={() => setOpenSections(prev => ({ ...prev, characters: !prev.characters }))} style={{ fontSize: '0.7rem', color: '#999', cursor: 'pointer' }}>{openSections.characters ? '▲' : '▼'}</span>
              </div>
            </h3>
            {openSections.characters && (
              <ul className={styles.sidebarList}>
                {charactersData.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: '1rem 0' }}>まだ判明している人物はいません</p>
                ) : (
                  charactersData.map((c, i) => {
                    const characterId = getCharacterIdentity(c);
                    const fileInputId = `file-${encodeURIComponent(characterId)}-${i}`;
                    const isFemale = c.gender === 'female' || (!c.gender && /女|少女|娘|婦|嬢|姉|妹|彼女|妻|母|ヒロイン/.test(c.info + c.name));
                    return (
                      <li key={`${characterId}-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', fontFamily: 'var(--font-serif)', marginBottom: '1.5rem' }}>

                        {/* 左：画像・メニュー列 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '96px', flexShrink: 0 }}>
                          <div style={{ width: '96px', height: '96px', borderRadius: '4px', background: c.image ? `url(${c.image}) center/cover no-repeat` : 'var(--bg-color)', display: 'flex', flexShrink: 0, alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', cursor: 'pointer', overflow: 'hidden' }} onClick={() => document.getElementById(fileInputId)?.click()}>
                            {!c.image && (
                              c.isGenerating ? <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>準備中..</span> :
                                isFemale ? (
                                  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '36px', height: '36px', color: 'var(--text-muted)', opacity: 0.4 }}>
                                    <path d="M12 2C10.9 2 10 2.9 10 4s.9 2 2 2 2-.9 2-2-.9-2-2-2z M12 6.5C10 6.5 9.1 7.2 8.7 8l-2.6 8h3.3v6h5.2v-6h3.3l-2.6-8c-.4-.8-1.3-1.5-3.3-1.5z" />
                                  </svg>
                                ) : (
                                  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '36px', height: '36px', color: 'var(--text-muted)', opacity: 0.4 }}>
                                    <path d="M12 2C10.9 2 10 2.9 10 4s.9 2 2 2 2-.9 2-2-.9-2-2-2z M14 6H10A2 2 0 0 0 8 8v6h2v8h4v-8h2V8a2 2 0 0 0-2-2z" />
                                  </svg>
                                )
                            )}
                          </div>
                          <input
                            type="file"
                            id={fileInputId}
                            style={{ display: 'none' }}
                            accept="image/*"
                            onChange={(e) => { handleImageUpload(e, characterId, c.name); setActiveCharacterOptions(null); }}
                          />
                          {!c.isGenerating && (
                            <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); setActiveCharacterOptions(activeCharacterOptions === characterId ? null : characterId); }}
                                style={{ fontSize: '1.2rem', lineHeight: '10px', padding: '2px 8px', background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}
                              >
                                ⋯
                              </button>
                              {activeCharacterOptions === characterId && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', background: 'var(--sidebar-bg)', padding: '6px', border: '1px solid var(--border-color)', borderRadius: '4px', zIndex: 10, minWidth: '90px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
                                  <button
                                    onClick={() => { handleGeneratePrompt(characterId, c.name); setActiveCharacterOptions(null); }}
                                    style={{ fontSize: '0.6rem', padding: '4px', background: '#333', color: '#fff', border: 'none', borderRadius: '2px', cursor: 'pointer', textAlign: 'center' }}
                                  >
                                    プロンプト生成
                                  </button>
                                  {c.image && (
                                    <button
                                      onClick={() => { handleDeleteImage(characterId, c.name); setActiveCharacterOptions(null); }}
                                      style={{ fontSize: '0.6rem', padding: '4px', background: '#e11d48', color: '#fff', border: 'none', borderRadius: '2px', cursor: 'pointer', textAlign: 'center' }}
                                    >
                                      画像削除
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 右：名前・情報列 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <strong style={{ color: 'var(--text-main)', letterSpacing: '1px' }}>{c.name}</strong>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>{c.info}</span>
                          {c.lastPrompt && (
                            <details style={{ marginTop: '6px' }}>
                              <summary style={{ fontSize: '0.65rem', color: 'var(--text-muted)', cursor: 'pointer', letterSpacing: '0.5px', outline: 'none' }}>
                                生成プロンプト
                              </summary>
                              <div style={{ marginTop: '4px', padding: '6px 8px', background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-main)', lineHeight: '1.5', margin: '0 0 6px 0', wordBreak: 'break-all', userSelect: 'text', cursor: 'text' }}>
                                  {c.lastPrompt}
                                </p>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(c.lastPrompt!).then(() => showToast('コピーしました')).catch(() => { });
                                  }}
                                  style={{ fontSize: '0.6rem', padding: '2px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '2px', cursor: 'pointer', color: 'var(--text-muted)' }}
                                >
                                  コピー
                                </button>
                              </div>
                            </details>
                          )}
                        </div>

                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>

          {/* 事実と謎JSONを展開 */}
          <div className={styles.sidebarSection}>
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span onClick={() => setOpenSections(prev => ({ ...prev, facts: !prev.facts }))} style={{ cursor: 'pointer', flex: 1 }}>判明した事実</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); requestSpecialCommand('facts'); }}
                  disabled={isLoading}
                  style={{ fontSize: '0.65rem', padding: '3px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                >
                  <IconRefresh /> 更新
                </button>
                <span onClick={() => setOpenSections(prev => ({ ...prev, facts: !prev.facts }))} style={{ fontSize: '0.7rem', color: '#999', cursor: 'pointer' }}>{openSections.facts ? '▲' : '▼'}</span>
              </div>
            </h3>
            {openSections.facts && (
              <ul className={styles.sidebarList}>
                {factsData.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>まだ有力な事実はありません</p>
                ) : (
                  factsData.map((f, i) => <li key={i} className={styles.sidebarItem} style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{f}</li>)
                )}
              </ul>
            )}
          </div>

          <div className={styles.sidebarSection}>
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span onClick={() => setOpenSections(prev => ({ ...prev, mysteries: !prev.mysteries }))} style={{ cursor: 'pointer', flex: 1 }}>未解決の謎</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); requestSpecialCommand('mysteries'); }}
                  disabled={isLoading}
                  style={{ fontSize: '0.65rem', padding: '3px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                >
                  <IconRefresh /> 更新
                </button>
                <span onClick={() => setOpenSections(prev => ({ ...prev, mysteries: !prev.mysteries }))} style={{ fontSize: '0.7rem', color: '#999', cursor: 'pointer' }}>{openSections.mysteries ? '▲' : '▼'}</span>
              </div>
            </h3>
            {openSections.mysteries && (
              <ul className={styles.sidebarList}>
                {mysteriesData.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>未解決の謎はありません</p>
                ) : (
                  mysteriesData.map((m, i) => <li key={i} className={styles.sidebarItem} style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>{m}</li>)
                )}
              </ul>
            )}
          </div>

          {/* モノローグ情報 */}
          <div className={styles.sidebarSection}>
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span onClick={() => setOpenSections(prev => ({ ...prev, monologue: !prev.monologue }))} style={{ cursor: 'pointer', flex: 1 }}>主人公の独白</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); requestSpecialCommand('monologue'); }}
                  disabled={isLoading}
                  style={{ fontSize: '0.65rem', padding: '3px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                >
                  <IconRefresh /> 更新
                </button>
                <span onClick={() => setOpenSections(prev => ({ ...prev, monologue: !prev.monologue }))} style={{ fontSize: '0.7rem', color: '#999', cursor: 'pointer' }}>{openSections.monologue ? '▲' : '▼'}</span>
              </div>
            </h3>
            {openSections.monologue && (
              <div style={{ margin: '1rem 0' }}>
                {monologueData.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>まだ独白はありません</p>
                ) : (
                  monologueData.map((text, i) => (
                    <details key={i} open={i === monologueData.length - 1} style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.8rem' }}>
                      <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', outline: 'none' }}>
                        独白 #{i + 1} {i === monologueData.length - 1 ? '(最新)' : ''}
                      </summary>
                      <p style={{ fontFamily: 'var(--app-font)', fontSize: '0.85rem', fontStyle: 'italic', lineHeight: '1.8', color: 'var(--text-main)', paddingLeft: '1rem', borderLeft: '2px solid var(--border-color)', whiteSpace: 'pre-wrap' }}>
                        「 {text} 」
                      </p>
                    </details>
                  ))
                )}
              </div>
            )}
          </div>

          <div className={styles.sidebarSection} style={{ paddingRight: '0.5rem', whiteSpace: 'pre-wrap' }}>
            <h3 onClick={() => setOpenSections(prev => ({ ...prev, howTo: !prev.howTo }))} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>遊び方</span>
              <span style={{ fontSize: '0.7rem', color: '#999' }}>{openSections.howTo ? '▲' : '▼'}</span>
            </h3>
            {openSections.howTo && (
              <div style={{ color: 'var(--text-main)', fontSize: '0.85rem', lineHeight: '1.8', margin: '1rem 0' }}>
                <ul style={{ paddingLeft: '1.2rem' }}>
                  <li style={{ marginBottom: '0.5rem' }}><strong>「」</strong>：主人公としての発言</li>
                  <li style={{ marginBottom: '0.5rem' }}><strong>自由入力</strong>：主人公としての行動</li>
                </ul>
              </div>
            )}
          </div>

          {/* エンディングメニューへ飛ぶボタン (クリア後) */}
          {messages.some(msg => msg?.parts?.[0]?.text?.includes('【終】')) && endingPhase === 'NONE' && (
            <div style={{ marginTop: '2rem', paddingBottom: '2rem' }}>
              <button
                onClick={() => setEndingPhase('MENU')}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: 'transparent',
                  border: '1px solid var(--accent-red)',
                  color: 'var(--accent-red)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  letterSpacing: '2px',
                  fontSize: '0.9rem',
                  transition: '0.3s',
                  boxShadow: '0 4px 15px rgba(255, 0, 0, 0.1)'
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'var(--accent-red)'; e.currentTarget.style.color = '#fff'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--accent-red)'; }}
              >
                エンディングメニューを開く
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
