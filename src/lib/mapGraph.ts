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
  if (!rawCurrentPos || typeof rawCurrentPos !== 'object') return undefined;

  const nodeId = typeof (rawCurrentPos as any).nodeId === 'string' ? (rawCurrentPos as any).nodeId.trim() : '';
  if (!nodeId) return undefined;

  return {
    nodeId,
    layer: typeof (rawCurrentPos as any).layer === 'string' && (rawCurrentPos as any).layer.trim()
      ? (rawCurrentPos as any).layer.trim()
      : DEFAULT_MAP_LAYER_NAME
  };
};

const normalizeNode = (rawNode: unknown, index: number): GraphMapNode | null => {
  if (!rawNode || typeof rawNode !== 'object') return null;

  const id = typeof (rawNode as any).id === 'string' ? (rawNode as any).id.trim() : '';
  if (!id) return null;

  const label = typeof (rawNode as any).label === 'string' && (rawNode as any).label.trim()
    ? (rawNode as any).label.trim()
    : typeof (rawNode as any).name === 'string' && (rawNode as any).name.trim()
      ? (rawNode as any).name.trim()
      : id;

  const position = typeof (rawNode as any).position === 'object' && (rawNode as any).position
    ? {
        x: Number((rawNode as any).position.x) || 0,
        y: Number((rawNode as any).position.y) || 0
      }
    : undefined;

  return {
    id,
    label,
    kind: typeof (rawNode as any).kind === 'string' ? (rawNode as any).kind : typeof (rawNode as any).type === 'string' ? (rawNode as any).type : 'place',
    description: typeof (rawNode as any).description === 'string' ? (rawNode as any).description : undefined,
    status: (rawNode as any).status === 'unknown' || (rawNode as any).status === 'known' || (rawNode as any).status === 'visited'
      ? (rawNode as any).status
      : index === 0 ? 'visited' : 'known',
    position
  };
};

const normalizeEdge = (rawEdge: unknown, index: number): GraphMapEdge | null => {
  if (!rawEdge || typeof rawEdge !== 'object') return null;

  const source = typeof (rawEdge as any).source === 'string'
    ? (rawEdge as any).source.trim()
    : typeof (rawEdge as any).from === 'string'
      ? (rawEdge as any).from.trim()
      : '';
  const target = typeof (rawEdge as any).target === 'string'
    ? (rawEdge as any).target.trim()
    : typeof (rawEdge as any).to === 'string'
      ? (rawEdge as any).to.trim()
      : '';

  if (!source || !target) return null;

  return {
    id: typeof (rawEdge as any).id === 'string' && (rawEdge as any).id.trim() ? (rawEdge as any).id.trim() : `edge_${index}_${source}_${target}`,
    source,
    target,
    label: typeof (rawEdge as any).label === 'string' ? (rawEdge as any).label : undefined,
    kind: typeof (rawEdge as any).kind === 'string' ? (rawEdge as any).kind : 'path',
    bidirectional: Boolean((rawEdge as any).bidirectional)
  };
};

const normalizeLayer = (rawLayer: unknown): GraphMapLayer | null => {
  if (!rawLayer || typeof rawLayer !== 'object') return null;

  const nodes = Array.isArray((rawLayer as any).nodes)
    ? (rawLayer as any).nodes.map((node: unknown, index: number) => normalizeNode(node, index)).filter(Boolean) as GraphMapNode[]
    : [];

  if (nodes.length === 0) return null;

  const nodeIdSet = new Set(nodes.map((node) => node.id));
  const edges = Array.isArray((rawLayer as any).edges)
    ? (rawLayer as any).edges
        .map((edge: unknown, index: number) => normalizeEdge(edge, index))
        .filter((edge: GraphMapEdge | null): edge is GraphMapEdge => Boolean(edge && nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)))
    : [];

  return {
    direction: normalizeDirection((rawLayer as any).direction),
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

export const normalizeMapPayload = (mapPayload: any): GraphMapState | null => {
  const currentPos = normalizeCurrentPos(mapPayload.currentPos);

  if (mapPayload.layers && typeof mapPayload.layers === 'object' && !Array.isArray(mapPayload.layers)) {
    const layers = Object.fromEntries(
      Object.entries(mapPayload.layers)
        .map(([layerName, rawLayer]) => [layerName, normalizeLayer(rawLayer)] as const)
        .filter((entry): entry is [string, GraphMapLayer] => Boolean(entry[1]))
    );

    if (Object.keys(layers).length > 0) {
      return { layers, currentPos };
    }
  }

  if (Array.isArray(mapPayload.nodes)) {
    const layerName = currentPos?.layer || (typeof mapPayload.layer === 'string' && mapPayload.layer.trim() ? mapPayload.layer.trim() : DEFAULT_MAP_LAYER_NAME);
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

  if (typeof mapPayload.mermaid === 'string' && mapPayload.mermaid.trim()) {
    const layerName = currentPos?.layer || DEFAULT_MAP_LAYER_NAME;
    const layer = parseMermaidLayer(mapPayload.mermaid);
    if (layer) {
      return {
        currentPos,
        layers: {
          [layerName]: layer
        }
      };
    }
  }

  if (Array.isArray(mapPayload.locations) && mapPayload.locations.length > 0) {
    return buildLegacyLocationMap(mapPayload.locations as LegacyMapLocation[], currentPos);
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

  const parsed = JSON.parse(jsonContent);
  const mapPayload = parsed.map && typeof parsed.map === 'object' ? parsed.map : parsed;
  return normalizeMapPayload(mapPayload);
};

export const normalizeStoredMapState = (raw: any): GraphMapState => {
  const fallback = structuredClone(DEFAULT_MAP_STATE);

  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  if (raw.mapLayers) {
    const normalized = normalizeMapPayload({ layers: raw.mapLayers, currentPos: raw.currentPos });
    if (normalized) {
      return normalized;
    }
  }

  if (raw.mapGraphs && typeof raw.mapGraphs === 'object') {
    const legacyLayers = Object.fromEntries(
      Object.entries(raw.mapGraphs)
        .map(([layerName, mermaid]) => [layerName, typeof mermaid === 'string' ? parseMermaidLayer(mermaid) : null] as const)
        .filter((entry): entry is [string, GraphMapLayer] => Boolean(entry[1]))
    );

    if (Object.keys(legacyLayers).length > 0) {
      return {
        currentPos: normalizeCurrentPos(raw.currentPos) || fallback.currentPos,
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