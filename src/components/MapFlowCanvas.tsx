'use client';

import React, { useEffect, useMemo } from 'react';
import {
  Background,
  Controls,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node
} from '@xyflow/react';

import type { GraphMapEdge, GraphMapLayer, GraphMapNode, MapDirection } from '@/lib/mapGraph';

const NODE_WIDTH = 176;
const NODE_HEIGHT = 68;
const X_SPACING = 260;
const Y_SPACING = 150;

const CURRENT_NODE_COLORS = {
  background: '#f59e0b',
  border: '#9a3412',
  color: '#1f2937'
};

const ROUTE_NODE_COLORS = {
  background: '#fef3c7',
  border: '#d97706',
  color: '#78350f'
};

const TRANSIT_NODE_COLORS = {
  background: '#e0f2fe',
  border: '#0284c7',
  color: '#0f172a'
};

const PLACE_NODE_COLORS = {
  background: '#f8fafc',
  border: '#475569',
  color: '#0f172a'
};

const OTHER_NODE_COLORS = {
  background: '#f3f4f6',
  border: '#6b7280',
  color: '#111827'
};

export const MAP_NODE_LEGEND_ITEMS = [
  { key: 'current', label: '現在地', description: '今いる場所', colors: CURRENT_NODE_COLORS, pill: false },
  { key: 'route', label: '道・廊下', description: '通路や移動経路', colors: ROUTE_NODE_COLORS, pill: true },
  { key: 'transit', label: '分岐・階段', description: '接続点や上下移動', colors: TRANSIT_NODE_COLORS, pill: false },
  { key: 'place', label: '場所・部屋', description: '建物や部屋など', colors: PLACE_NODE_COLORS, pill: false },
  { key: 'other', label: 'その他', description: '分類外の地点', colors: OTHER_NODE_COLORS, pill: false },
] as const;

const getNodeColors = (node: GraphMapNode, isCurrent: boolean) => {
  if (isCurrent) {
    return CURRENT_NODE_COLORS;
  }

  switch (node.kind) {
    case 'route':
    case 'path':
    case 'road':
    case 'corridor':
      return ROUTE_NODE_COLORS;
    case 'junction':
    case 'stairs':
      return TRANSIT_NODE_COLORS;
    case 'building':
    case 'room':
    case 'place':
      return PLACE_NODE_COLORS;
    default:
      return OTHER_NODE_COLORS;
  }
};

const buildLevels = (layer: GraphMapLayer) => {
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();

  layer.nodes.forEach((node) => {
    indegree.set(node.id, 0);
    adjacency.set(node.id, new Set());
  });

  layer.edges.forEach((edge) => {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) return;
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);

    if (edge.bidirectional) {
      indegree.set(edge.source, (indegree.get(edge.source) || 0) + 1);
    }
  });

  const levelMap = new Map<string, number>();
  const visited = new Set<string>();
  let componentBaseLevel = 0;

  const traverseComponent = (startNodeId: string) => {
    if (visited.has(startNodeId)) return;

    const queue: Array<{ nodeId: string; level: number }> = [{ nodeId: startNodeId, level: componentBaseLevel }];
    visited.add(startNodeId);
    levelMap.set(startNodeId, componentBaseLevel);

    let componentMaxLevel = componentBaseLevel;

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;

      componentMaxLevel = Math.max(componentMaxLevel, current.level);

      for (const targetId of adjacency.get(current.nodeId) || []) {
        if (visited.has(targetId)) continue;

        const nextLevel = current.level + 1;
        visited.add(targetId);
        levelMap.set(targetId, nextLevel);
        componentMaxLevel = Math.max(componentMaxLevel, nextLevel);
        queue.push({ nodeId: targetId, level: nextLevel });
      }
    }

    componentBaseLevel = componentMaxLevel + 2;
  };

  const rootNodeIds = layer.nodes
    .filter((node) => (indegree.get(node.id) || 0) === 0)
    .map((node) => node.id);

  if (rootNodeIds.length === 0 && layer.nodes[0]) {
    rootNodeIds.push(layer.nodes[0].id);
  }

  rootNodeIds.forEach((nodeId) => {
    traverseComponent(nodeId);
  });

  layer.nodes.forEach((node) => {
    traverseComponent(node.id);
  });

  return levelMap;
};

const layoutNodes = (nodes: GraphMapNode[], edges: GraphMapEdge[], direction: MapDirection) => {
  const layer: GraphMapLayer = { nodes, edges, direction };
  const levelMap = buildLevels(layer);
  const grouped = new Map<number, GraphMapNode[]>();

  nodes.forEach((node) => {
    const level = levelMap.get(node.id) || 0;
    const bucket = grouped.get(level) || [];
    bucket.push(node);
    grouped.set(level, bucket);
  });

  return Object.fromEntries(
    Array.from(grouped.entries()).flatMap(([level, levelNodes]) => {
      return levelNodes.map((node, index) => {
        const x = direction === 'LR' ? level * X_SPACING : index * X_SPACING;
        const y = direction === 'LR' ? index * Y_SPACING : level * Y_SPACING;
        return [node.id, { x, y }];
      });
    })
  ) as Record<string, { x: number; y: number }>;
};

const buildReactFlowState = (layer: GraphMapLayer, currentNodeId?: string) => {
  const positions = layoutNodes(layer.nodes, layer.edges, layer.direction);

  const nodes: Node[] = layer.nodes.map((node) => {
    const isCurrent = node.id === currentNodeId;
    const colors = getNodeColors(node, isCurrent);
    const position = node.position || positions[node.id] || { x: 0, y: 0 };

    return {
      id: node.id,
      position,
      data: {
        label: (
          <div title={node.description || node.label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <strong style={{ fontSize: '0.92rem' }}>{node.label}</strong>
            {node.description ? <span style={{ fontSize: '0.72rem', opacity: 0.72 }}>{node.description}</span> : null}
          </div>
        )
      },
      sourcePosition: layer.direction === 'LR' ? Position.Right : Position.Bottom,
      targetPosition: layer.direction === 'LR' ? Position.Left : Position.Top,
      draggable: false,
      selectable: false,
      style: {
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        borderRadius: node.kind === 'route' || node.kind === 'road' || node.kind === 'corridor' ? 999 : 18,
        border: `2px solid ${colors.border}`,
        background: colors.background,
        color: colors.color,
        boxShadow: isCurrent ? '0 0 0 4px rgba(245, 158, 11, 0.25), 0 10px 20px rgba(0,0,0,0.15)' : '0 10px 20px rgba(15,23,42,0.08)',
        padding: '12px 14px',
        fontSize: '0.85rem'
      }
    };
  });

  const edges: Edge[] = layer.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: 'smoothstep',
    animated: edge.source === currentNodeId || edge.target === currentNodeId,
    selectable: false,
    style: {
      stroke: edge.kind === 'stairs' ? '#0284c7' : edge.kind === 'route' || edge.kind === 'road' ? '#d97706' : '#64748b',
      strokeWidth: edge.kind === 'route' || edge.kind === 'road' ? 2.5 : 2
    },
    labelStyle: {
      fill: '#475569',
      fontSize: 12,
      fontWeight: 600
    }
  }));

  return { nodes, edges };
};

const MapFlowInner = ({ layer, currentNodeId }: { layer: GraphMapLayer; currentNodeId?: string }) => {
  const { fitView } = useReactFlow();
  const { nodes, edges } = useMemo(() => buildReactFlowState(layer, currentNodeId), [layer, currentNodeId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fitView({ padding: 0.24, duration: 300, maxZoom: 1.2 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [nodes, edges, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      minZoom={0.2}
      maxZoom={1.6}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
      zoomOnPinch
      proOptions={{ hideAttribution: true }}
      style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)' }}
    >
      <Controls showInteractive={false} />
      <Background gap={24} size={1} color="rgba(100, 116, 139, 0.15)" />
    </ReactFlow>
  );
};

export default function MapFlowCanvas({ layer, currentNodeId }: { layer: GraphMapLayer; currentNodeId?: string }) {
  return (
    <ReactFlowProvider>
      <div style={{ width: '100%', height: '100%' }}>
        <MapFlowInner layer={layer} currentNodeId={currentNodeId} />
      </div>
    </ReactFlowProvider>
  );
}