'use client';

import React, { useEffect, useMemo } from 'react';
import {
  Background,
  Controls,
  MiniMap,
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

const getNodeColors = (node: GraphMapNode, isCurrent: boolean) => {
  if (isCurrent) {
    return {
      background: '#f59e0b',
      border: '#9a3412',
      color: '#1f2937'
    };
  }

  switch (node.kind) {
    case 'route':
    case 'path':
    case 'road':
    case 'corridor':
      return { background: '#fef3c7', border: '#d97706', color: '#78350f' };
    case 'junction':
    case 'stairs':
      return { background: '#e0f2fe', border: '#0284c7', color: '#0f172a' };
    case 'building':
    case 'room':
    case 'place':
      return { background: '#f8fafc', border: '#475569', color: '#0f172a' };
    default:
      return { background: '#f3f4f6', border: '#6b7280', color: '#111827' };
  }
};

const buildLevels = (layer: GraphMapLayer) => {
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  layer.nodes.forEach((node) => {
    indegree.set(node.id, 0);
    adjacency.set(node.id, []);
  });

  layer.edges.forEach((edge) => {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) return;
    adjacency.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);

    if (edge.bidirectional) {
      adjacency.get(edge.target)?.push(edge.source);
      indegree.set(edge.source, (indegree.get(edge.source) || 0) + 1);
    }
  });

  const queue = layer.nodes.filter((node) => (indegree.get(node.id) || 0) === 0).map((node) => node.id);
  const levelMap = new Map<string, number>();
  const visited = new Set<string>();

  queue.forEach((nodeId) => levelMap.set(nodeId, 0));

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const nextLevel = (levelMap.get(nodeId) || 0) + 1;
    adjacency.get(nodeId)?.forEach((targetId) => {
      if (!levelMap.has(targetId) || (levelMap.get(targetId) || 0) < nextLevel) {
        levelMap.set(targetId, nextLevel);
      }
      queue.push(targetId);
    });
  }

  let fallbackLevel = Math.max(0, ...Array.from(levelMap.values()));
  layer.nodes.forEach((node) => {
    if (!levelMap.has(node.id)) {
      fallbackLevel += 1;
      levelMap.set(node.id, fallbackLevel);
    }
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
      <MiniMap
        pannable
        zoomable
        style={{ background: 'rgba(255,255,255,0.96)', border: '1px solid rgba(15, 23, 42, 0.08)' }}
        nodeColor={(node) => (node.id === currentNodeId ? '#f59e0b' : '#cbd5e1')}
      />
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