import { extractMapJsonContent } from '@/lib/mapGraph';

export type GeneratorIdeaAttachmentKind = 'image' | 'audio' | 'video';

export interface ScenarioMetaData {
  title?: string;
  protagonistName?: string;
  protagonistFirstPerson?: string;
}

export interface GeneratorIdeaAttachmentLike {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: GeneratorIdeaAttachmentKind;
}

export type GenerationPhaseId = 'phase1' | 'phase2' | 'phase3a' | 'phase3b' | 'phase4';
export type GenerationPhaseStatus = 'idle' | 'running' | 'done' | 'error' | 'waiting';

export interface GenerationArtifact {
  phaseId: GenerationPhaseId;
  label: string;
  fileName: string;
  markdown: string;
}

export interface ParsedScenarioPackage {
  title: string;
  scenarioText: string;
  prologueText: string;
  briefingText: string;
  mapFileText: string;
  mapJsonText: string;
  metadataJsonText: string;
  scenarioMeta: ScenarioMetaData;
}

export interface ParsedScenarioBuildPackage {
  title: string;
  scenarioText: string;
  prologueText: string;
  mapFileText: string;
  mapJsonText: string;
}

export interface PendingGeneratedScenarioPayload {
  scenarioTitle: string;
  saveName: string;
  scenarioText: string;
  briefingText: string;
  prologueText: string;
  mapFileText: string;
  coverImage?: string;
  scenarioMeta: ScenarioMetaData;
}

export const GENERATED_SCENARIO_PAYLOAD_KEY = 'chatnoir_generated_scenario_payload';

const REPOSITORY_NAME = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const BUILD_TIME_BASE_PATH = process.env.GITHUB_ACTIONS === 'true' && REPOSITORY_NAME ? `/${REPOSITORY_NAME}` : '';

export const resolveRuntimeBasePath = (): string => {
  if (BUILD_TIME_BASE_PATH) {
    return BUILD_TIME_BASE_PATH;
  }

  if (typeof window === 'undefined') return '';
  if (!window.location.hostname.endsWith('github.io')) return '';

  const firstSegment = window.location.pathname.split('/').filter(Boolean)[0];
  return firstSegment ? `/${firstSegment}` : '';
};

export const resolvePublicAssetPath = (path: string): string => {
  if (!path || !path.trim()) return '';
  if (path.startsWith('data:') || path.startsWith('blob:') || /^[a-z]+:\/\//i.test(path)) {
    return path;
  }

  const normalized = path.replace(/^\/+/, '');
  const basePath = resolveRuntimeBasePath();
  if (!basePath) return `/${normalized}`;

  const repoName = basePath.slice(1);
  if (normalized === repoName || normalized.startsWith(`${repoName}/`)) {
    return `/${normalized}`;
  }

  return `${basePath}/${normalized}`;
};

export const sanitizeFileName = (value: string, fallback = 'scenario'): string => {
  const normalized = value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || fallback;
};

export const classifyAttachmentKind = (mimeType: string): GeneratorIdeaAttachmentKind | null => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return null;
};

export const formatFileSize = (sizeBytes: number): string => {
  if (sizeBytes >= 1024 * 1024 * 1024) return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${sizeBytes} B`;
};

export const summarizeAttachments = (attachments: GeneratorIdeaAttachmentLike[]): string => {
  if (attachments.length === 0) {
    return '添付メディアなし';
  }

  return attachments
    .map((attachment, index) => {
      const label = attachment.kind === 'image' ? '画像' : attachment.kind === 'audio' ? '音声' : '動画';
      return `${index + 1}. ${label}: ${attachment.name} (${attachment.mimeType}, ${formatFileSize(attachment.sizeBytes)})`;
    })
    .join('\n');
};

export const replacePromptPlaceholders = (template: string, replacements: Record<string, string>): string => {
  return Object.entries(replacements).reduce(
    (current, [key, value]) => current.replaceAll(`{{${key}}}`, value),
    template,
  );
};

const normalizeLineBreaks = (text: string): string => text.replace(/\r\n/g, '\n');

const extractSectionBetweenHeadings = (text: string, startPattern: RegExp, endPattern: RegExp): string => {
  const normalized = normalizeLineBreaks(text);
  const startMatch = startPattern.exec(normalized);
  if (!startMatch) return '';

  const startIndex = startMatch.index + startMatch[0].length;
  const nextSlice = normalized.slice(startIndex);
  const endMatch = endPattern.exec(nextSlice);
  const endIndex = endMatch ? startIndex + endMatch.index : normalized.length;

  return normalized.slice(startIndex, endIndex).trim();
};

export const extractHookPreview = (phase1Markdown: string): string => {
  const section = extractSectionBetweenHeadings(
    phase1Markdown,
    /^###\s*2\.\s*導入シナリオ（The Hook）\s*$/m,
    /^###\s*3\./m,
  );

  if (section) return section;

  const fallback = extractSectionBetweenHeadings(
    phase1Markdown,
    /^##\s*2\.\s*導入シナリオ（The Hook）\s*$/m,
    /^##\s*3\./m,
  );

  return fallback || phase1Markdown.trim();
};

export const extractScenarioTitle = (markdown: string): string => {
  const normalized = normalizeLineBreaks(markdown);
  const titleMatch = normalized.match(/^\*\s*\*タイトル:\*\s*(.+)$/m)
    || normalized.match(/^###\s*1\.\s*\[(.+?)\]\s*$/m)
    || normalized.match(/^#\s+(.+)$/m)
    || normalized.match(/^##\s+(.+)$/m);

  return titleMatch?.[1]?.trim() || 'Generated Scenario';
};

const extractLastJsonCodeBlock = (text: string): string => {
  const matches = Array.from(text.matchAll(/```json\s*([\s\S]*?)```/gi));
  if (matches.length === 0) return '';
  return matches[matches.length - 1]?.[1]?.trim() || '';
};

const parseScenarioMetaData = (jsonText: string): ScenarioMetaData => {
  if (!jsonText) return {};

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    return {
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      protagonistName: typeof parsed.protagonist_name === 'string'
        ? parsed.protagonist_name
        : typeof parsed.protagonistName === 'string'
          ? parsed.protagonistName
          : undefined,
      protagonistFirstPerson: typeof parsed.protagonist_first_person === 'string'
        ? parsed.protagonist_first_person
        : typeof parsed.protagonistFirstPerson === 'string'
          ? parsed.protagonistFirstPerson
          : undefined,
    };
  } catch {
    return {};
  }
};

const extractOutputSections = (markdown: string): Map<number, string> => {
  const normalized = normalizeLineBreaks(markdown);
  const headingRegex = /^###\s*出力\s*([1-5])\s*[：:].*$/gm;
  const matches = Array.from(normalized.matchAll(headingRegex));
  const sections = new Map<number, string>();

  matches.forEach((match, index) => {
    const sectionNumber = Number(match[1]);
    const start = (match.index ?? 0) + match[0].length;
    const end = index < matches.length - 1 ? (matches[index + 1].index ?? normalized.length) : normalized.length;
    sections.set(sectionNumber, normalized.slice(start, end).trim());
  });

  return sections;
};

export const parseFinalScenarioPackage = (phase4Markdown: string): ParsedScenarioPackage => {
  const sections = extractOutputSections(phase4Markdown);
  const scenarioText = sections.get(1)?.trim() || '';
  const prologueRaw = sections.get(2)?.trim() || '';
  const briefingText = sections.get(3)?.trim() || '';
  const mapSection = sections.get(4)?.trim() || '';
  const metadataSection = sections.get(5)?.trim() || '';

  const prologueText = prologueRaw.replace(/\n---\s*$/u, '').trim();
  const extractedMapJson = extractMapJsonContent(mapSection || phase4Markdown).trim();
  const mapFileText = extractedMapJson ? `\`\`\`json:initial_map\n${extractedMapJson}\n\`\`\``.replace(/\`/g, '`') : '';
  const metadataJsonText = extractLastJsonCodeBlock(metadataSection || phase4Markdown);
  const scenarioMeta = parseScenarioMetaData(metadataJsonText);
  const title = scenarioMeta.title || extractScenarioTitle(scenarioText || phase4Markdown);

  return {
    title,
    scenarioText,
    prologueText,
    briefingText,
    mapFileText,
    mapJsonText: extractedMapJson,
    metadataJsonText,
    scenarioMeta,
  };
};

export const parseScenarioBuildPackage = (phase2Markdown: string): ParsedScenarioBuildPackage => {
  const sections = extractOutputSections(phase2Markdown);
  const scenarioText = sections.get(1)?.trim() || '';
  const prologueRaw = sections.get(2)?.trim() || '';
  const mapSection = sections.get(3)?.trim() || '';

  const prologueText = prologueRaw.replace(/\n---\s*$/u, '').trim();
  const extractedMapJson = extractMapJsonContent(mapSection || phase2Markdown).trim();
  const mapFileText = extractedMapJson ? `\`\`\`json:initial_map\n${extractedMapJson}\n\`\`\``.replace(/\`/g, '`') : '';

  return {
    title: extractScenarioTitle(scenarioText || phase2Markdown),
    scenarioText,
    prologueText,
    mapFileText,
    mapJsonText: extractedMapJson,
  };
};

export const storePendingGeneratedScenario = (payload: PendingGeneratedScenarioPayload): void => {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(GENERATED_SCENARIO_PAYLOAD_KEY, JSON.stringify(payload));
};

export const consumePendingGeneratedScenario = (): PendingGeneratedScenarioPayload | null => {
  if (typeof window === 'undefined') return null;

  const raw = sessionStorage.getItem(GENERATED_SCENARIO_PAYLOAD_KEY);
  if (!raw) return null;

  sessionStorage.removeItem(GENERATED_SCENARIO_PAYLOAD_KEY);

  try {
    const parsed = JSON.parse(raw) as Partial<PendingGeneratedScenarioPayload>;
    if (!parsed.scenarioText || !parsed.prologueText || !parsed.briefingText) {
      return null;
    }

    return {
      scenarioTitle: parsed.scenarioTitle || parsed.scenarioMeta?.title || 'Generated Scenario',
      saveName: parsed.saveName || parsed.scenarioTitle || 'Generated Scenario',
      scenarioText: parsed.scenarioText,
      briefingText: parsed.briefingText,
      prologueText: parsed.prologueText,
      mapFileText: parsed.mapFileText || '',
      coverImage: parsed.coverImage || '',
      scenarioMeta: parsed.scenarioMeta || {},
    };
  } catch {
    return null;
  }
};

export const buildMarkdownDownloadName = (phaseNumberLabel: string, title: string): string => {
  return `${phaseNumberLabel}_${sanitizeFileName(title)}.md`;
};
