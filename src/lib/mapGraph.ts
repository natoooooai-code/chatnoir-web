export type MapDirection = 'LR' | 'TD';

export type MapNodeStatus = 'unknown' | 'known' | 'visited';

export interface MapCurrentPos {
  nodeId: string;
  layer: string;
}

export interface GraphMapNode {
  id: string;
  label: string;
  kind?: string;
  description?: string;
  status?: MapNodeStatus;
  position?: {
    x: number;
    y: number;
  };
}

export interface GraphMapEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind?: string;
  bidirectional?: boolean;
}

export interface GraphMapLayer {
  direction: MapDirection;
  nodes: GraphMapNode[];
  edges: GraphMapEdge[];
}

export interface GraphMapState {
  layers: Record<string, GraphMapLayer>;
  currentPos?: MapCurrentPos;
}

type UnknownRecord = Record<string, unknown>;

interface LegacyMapLocation {
  id: string;
  layer?: string;
  x: number;
  y: number;
  name: string;
  description?: string;
  status?: MapNodeStatus;
  type?: string;
}

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null;

const getString = (record: UnknownRecord, key: string): string | undefined => {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
};

const getTrimmedString = (record: UnknownRecord, key: string): string | undefined => {
  const value = getString(record, key)?.trim();
  return value ? value : undefined;
};

const getNumber = (record: UnknownRecord, key: string): number | undefined => {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const getRecord = (record: UnknownRecord, key: string): UnknownRecord | undefined => {
  const value = record[key];
  return isRecord(value) ? value : undefined;
};

const normalizeLegacyLocation = (rawLocation: unknown): LegacyMapLocation | null => {
  if (!isRecord(rawLocation)) return null;

  const id = getTrimmedString(rawLocation, 'id');
  const name = getTrimmedString(rawLocation, 'name');
  const x = getNumber(rawLocation, 'x');
  const y = getNumber(rawLocation, 'y');
  const rawStatus = rawLocation['status'];

  if (!id || !name || x === undefined || y === undefined) return null;

  return {
    id,
    layer: getTrimmedString(rawLocation, 'layer'),
    x,
    y,
    name,
    description: getString(rawLocation, 'description'),
    status: rawStatus === 'unknown' || rawStatus === 'known' || rawStatus === 'visited' ? rawStatus : undefined,
    type: getString(rawLocation, 'type')
  };
};

export const DEFAULT_MAP_LAYER_NAME = '全体マップ';

export const DEFAULT_MAP_STATE: GraphMapState = {
  currentPos: { nodeId: 'start', layer: DEFAULT_MAP_LAYER_NAME },
  layers: {
    [DEFAULT_MAP_LAYER_NAME]: {
      direction: 'LR',
      nodes: [
        { id: 'start', label: '開始地点', kind: 'place', status: 'visited' },
        { id: 'unknown', label: '調査中', kind: 'unknown', status: 'known' }
      ],
      edges: [
        { id: 'start_unknown', source: 'start', target: 'unknown', kind: 'path', bidirectional: true }
      ]
    }
  }
};

const normalizeDirection = (rawDirection: unknown): MapDirection => {
  if (rawDirection === 'TD' || rawDirection === 'TB' || rawDirection === 'BT') {
    return 'TD';
  }
  return 'LR';
};

const normalizeCurrentPos = (rawCurrentPos: unknown): MapCurrentPos | undefined => {
  if (!isRecord(rawCurrentPos)) return undefined;

  const nodeId = getTrimmedString(rawCurrentPos, 'nodeId') || '';
  if (!nodeId) return undefined;

  return {
    nodeId,
    layer: getTrimmedString(rawCurrentPos, 'layer') || DEFAULT_MAP_LAYER_NAME
  };
};

const normalizeNode = (rawNode: unknown, index: number): GraphMapNode | null => {
  if (!isRecord(rawNode)) return null;

  const id = getTrimmedString(rawNode, 'id') || '';
  if (!id) return null;

  const label = getTrimmedString(rawNode, 'label') || getTrimmedString(rawNode, 'name') || id;

  const rawPosition = getRecord(rawNode, 'position');
  const position = rawPosition
    ? {
        x: getNumber(rawPosition, 'x') || 0,
        y: getNumber(rawPosition, 'y') || 0
      }
    : undefined;

  const rawStatus = rawNode['status'];

  return {
    id,
    label,
    kind: getString(rawNode, 'kind') || getString(rawNode, 'type') || 'place',
    description: getString(rawNode, 'description'),
    status: rawStatus === 'unknown' || rawStatus === 'known' || rawStatus === 'visited'
      ? rawStatus
      : index === 0 ? 'visited' : 'known',
    position
  };
};

const normalizeEdge = (rawEdge: unknown, index: number): GraphMapEdge | null => {
  if (!isRecord(rawEdge)) return null;

  const source = getTrimmedString(rawEdge, 'source') || getTrimmedString(rawEdge, 'from') || '';
  const target = getTrimmedString(rawEdge, 'target') || getTrimmedString(rawEdge, 'to') || '';

  if (!source || !target) return null;

  return {
    id: getTrimmedString(rawEdge, 'id') || `edge_${index}_${source}_${target}`,
    source,
    target,
    label: getString(rawEdge, 'label'),
    kind: getString(rawEdge, 'kind') || 'path',
    bidirectional: Boolean(rawEdge['bidirectional'])
  };
};

const normalizeLayer = (rawLayer: unknown): GraphMapLayer | null => {
  if (!isRecord(rawLayer)) return null;

  const rawNodes = rawLayer['nodes'];
  const nodes = Array.isArray(rawNodes)
    ? rawNodes
        .map((node: unknown, index: number) => normalizeNode(node, index))
        .filter((node): node is GraphMapNode => Boolean(node))
    : [];

  if (nodes.length === 0) return null;

  const nodeIdSet = new Set(nodes.map((node) => node.id));
  const rawEdges = rawLayer['edges'];
  const edges = Array.isArray(rawEdges)
    ? rawEdges
        .map((edge: unknown, index: number) => normalizeEdge(edge, index))
        .filter((edge: GraphMapEdge | null): edge is GraphMapEdge => Boolean(edge && nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)))
    : [];

  return {
    direction: normalizeDirection(rawLayer['direction']),
    nodes,
    edges
  };
};

export const extractMapJsonContent = (text: string) => {
  const mapMatch = text.match(/```(?:json:initial_map|json)\s*([\s\S]*?)```/);
  if (mapMatch) {
    return mapMatch[1].trim();
  }

  const startIdx = text.indexOf('{');
  const endIdx = text.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1) {
    return text.substring(startIdx, endIdx + 1);
  }

  return '';
};

const parseNodeToken = (token: string) => {
  const match = token.match(/^([A-Za-z0-9_]+)(?:\[([^\]]+)\]|\{([^}]+)\}|\(\(([^)]+)\)\)|\(([^)]+)\))?$/);
  if (!match) {
    return null;
  }

  const label = match[2] || match[3] || match[4] || match[5] || match[1];
  const shapeToken = token.includes('{') ? 'route' : token.includes('((') ? 'junction' : 'place';

  return {
    id: match[1],
    label,
    kind: shapeToken as string
  };
};

const parseMermaidLayer = (mermaid: string): GraphMapLayer | null => {
  const lines = mermaid.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const directionMatch = lines[0].match(/^graph\s+(LR|RL|TD|TB|BT)/i);
  const direction = normalizeDirection(directionMatch?.[1]);
  const nodes = new Map<string, GraphMapNode>();
  const edges: GraphMapEdge[] = [];

  lines.forEach((line) => {
    if (/^(graph|classDef|linkStyle|click)\b/i.test(line)) return;
    if (/^style\s+/i.test(line)) return;

    const nodeTokens = line.match(/[A-Za-z0-9_]+(?:\[[^\]]*\]|\{[^}]*\}|\(\([^)]*\)\)|\([^)]*\))?/g);
    if (!nodeTokens || nodeTokens.length === 0) return;

    const parsedNodes = nodeTokens
      .map((token) => parseNodeToken(token))
      .filter(Boolean) as Array<{ id: string; label: string; kind: string }>;

    parsedNodes.forEach((parsedNode, index) => {
      if (!nodes.has(parsedNode.id)) {
        nodes.set(parsedNode.id, {
          id: parsedNode.id,
          label: parsedNode.label,
          kind: parsedNode.kind,
          status: index === 0 ? 'visited' : 'known'
        });
      }
    });

    for (let index = 0; index < parsedNodes.length - 1; index += 1) {
      const source = parsedNodes[index];
      const target = parsedNodes[index + 1];
      const edgeId = `edge_${source.id}_${target.id}_${edges.length}`;
      if (!edges.some((edge) => edge.source === source.id && edge.target === target.id)) {
        edges.push({
          id: edgeId,
          source: source.id,
          target: target.id,
          kind: 'path',
          bidirectional: /---/.test(line) && !/-->/.test(line)
        });
      }
    }
  });

  if (nodes.size === 0) return null;

  return {
    direction,
    nodes: Array.from(nodes.values()),
    edges
  };
};

const buildLegacyLocationMap = (locations: LegacyMapLocation[], currentPos?: MapCurrentPos): GraphMapState => {
  const grouped = new Map<string, LegacyMapLocation[]>();

  locations.forEach((location) => {
    const layerName = location.layer || DEFAULT_MAP_LAYER_NAME;
    const bucket = grouped.get(layerName) || [];
    bucket.push(location);
    grouped.set(layerName, bucket);
  });

  const layers = Object.fromEntries(
    Array.from(grouped.entries()).map(([layerName, layerLocations]) => {
      const nodes = layerLocations.map((location) => ({
        id: location.id,
        label: location.name,
        kind: location.type || 'place',
        description: location.description,
        status: location.status || 'known',
        position: {
          x: location.x * 220,
          y: location.y * -160
        }
      }));

      return [
        layerName,
        {
          direction: 'LR' as MapDirection,
          nodes,
          edges: []
        }
      ];
    })
  );

  return { layers, currentPos };
};

export const normalizeMapPayload = (mapPayload: unknown): GraphMapState | null => {
  if (!isRecord(mapPayload)) return null;

  const currentPos = normalizeCurrentPos(mapPayload['currentPos']);

  const rawLayers = mapPayload['layers'];
  if (isRecord(rawLayers) && !Array.isArray(rawLayers)) {
    const layers = Object.fromEntries(
      Object.entries(rawLayers)
        .map(([layerName, rawLayer]) => [layerName, normalizeLayer(rawLayer)] as const)
        .filter((entry): entry is [string, GraphMapLayer] => Boolean(entry[1]))
    );

    if (Object.keys(layers).length > 0) {
      return { layers, currentPos };
    }
  }

  if (Array.isArray(mapPayload['nodes'])) {
    const layerName = currentPos?.layer || getTrimmedString(mapPayload, 'layer') || DEFAULT_MAP_LAYER_NAME;
    const layer = normalizeLayer(mapPayload);
    if (layer) {
      return {
        currentPos,
        layers: {
          [layerName]: layer
        }
      };
    }
  }

  const mermaid = getTrimmedString(mapPayload, 'mermaid');
  if (mermaid) {
    const layerName = currentPos?.layer || DEFAULT_MAP_LAYER_NAME;
    const layer = parseMermaidLayer(mermaid);
    if (layer) {
      return {
        currentPos,
        layers: {
          [layerName]: layer
        }
      };
    }
  }

  const rawLocations = mapPayload['locations'];
  if (Array.isArray(rawLocations) && rawLocations.length > 0) {
    const locations = rawLocations
      .map((location) => normalizeLegacyLocation(location))
      .filter((location): location is LegacyMapLocation => Boolean(location));

    if (locations.length > 0) {
      return buildLegacyLocationMap(locations, currentPos);
    }
  }

  return null;
};

export const parseMapState = (text: string): GraphMapState | null => {
  let jsonContent = extractMapJsonContent(text);
  if (!jsonContent) return null;

  const firstBrace = jsonContent.indexOf('{');
  if (firstBrace !== -1) {
    jsonContent = jsonContent.substring(firstBrace);
  }

  const parsed = JSON.parse(jsonContent) as unknown;
  const mapPayload = isRecord(parsed) && isRecord(parsed['map']) ? parsed['map'] : parsed;
  return normalizeMapPayload(mapPayload);
};

export const normalizeStoredMapState = (raw: unknown): GraphMapState => {
  const fallback = structuredClone(DEFAULT_MAP_STATE);

  if (!isRecord(raw)) {
    return fallback;
  }

  if (raw['mapLayers']) {
    const normalized = normalizeMapPayload({ layers: raw['mapLayers'], currentPos: raw['currentPos'] });
    if (normalized) {
      return normalized;
    }
  }

  const rawMapGraphs = raw['mapGraphs'];
  if (isRecord(rawMapGraphs)) {
    const legacyLayers = Object.fromEntries(
      Object.entries(rawMapGraphs)
        .map(([layerName, mermaid]) => [layerName, typeof mermaid === 'string' ? parseMermaidLayer(mermaid) : null] as const)
        .filter((entry): entry is [string, GraphMapLayer] => Boolean(entry[1]))
    );

    if (Object.keys(legacyLayers).length > 0) {
      return {
        currentPos: normalizeCurrentPos(raw['currentPos']) || fallback.currentPos,
        layers: legacyLayers
      };
    }
  }

  return fallback;
};

export const getMapLayerNames = (mapLayers: Record<string, GraphMapLayer>) => {
  const layerNames = Object.keys(mapLayers);
  if (layerNames.length === 0) return [DEFAULT_MAP_LAYER_NAME];
  return Array.from(new Set([DEFAULT_MAP_LAYER_NAME, ...layerNames]));
};

export const getMapNodeLabel = (mapLayers: Record<string, GraphMapLayer>, currentPos?: MapCurrentPos) => {
  if (!currentPos) return '';
  const layer = mapLayers[currentPos.layer];
  return layer?.nodes.find((node) => node.id === currentPos.nodeId)?.label || currentPos.nodeId;
};