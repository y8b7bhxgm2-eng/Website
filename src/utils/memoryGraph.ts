import type { MemoryNote } from "@/types/memory";

export interface GraphNode {
  id: string;
  title: string;
  source: string;
  tags: string[];
  degree: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface MemoryGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  byId: Record<string, GraphNode>;
}

/**
 * Build an in-memory graph from a flat list of notes. The "links" array is
 * the directed edge list; backlinks are computed implicitly by inverting
 * those edges. Initial node positions are scattered on a circle so the
 * force layout has something to relax from.
 */
export function buildGraph(notes: MemoryNote[]): MemoryGraph {
  const ids = new Set(notes.map((n) => n.id));
  const edges: GraphEdge[] = [];
  const adjacency = new Map<string, Set<string>>();
  for (const note of notes) {
    for (const target of note.links) {
      if (!ids.has(target) || target === note.id) continue;
      edges.push({ from: note.id, to: target });
      if (!adjacency.has(note.id)) adjacency.set(note.id, new Set());
      if (!adjacency.has(target)) adjacency.set(target, new Set());
      adjacency.get(note.id)!.add(target);
      adjacency.get(target)!.add(note.id);
    }
  }

  const radiusBase = 6;
  const cx = 0;
  const cy = 0;
  const ringR = 240;
  const nodes: GraphNode[] = notes.map((note, i) => {
    const angle = (i / Math.max(notes.length, 1)) * Math.PI * 2;
    const degree = adjacency.get(note.id)?.size ?? 0;
    return {
      id: note.id,
      title: note.title,
      source: note.source,
      tags: note.tags,
      degree,
      x: cx + Math.cos(angle) * ringR,
      y: cy + Math.sin(angle) * ringR,
      vx: 0,
      vy: 0,
      radius: radiusBase + Math.min(degree, 6) * 1.5,
    };
  });

  const byId: Record<string, GraphNode> = {};
  for (const node of nodes) byId[node.id] = node;
  return { nodes, edges, byId };
}

interface SimOptions {
  width: number;
  height: number;
  iterations: number;
  /** Strength of the repulsive force between every pair of nodes. */
  repulsion: number;
  /** Spring constant for connected pairs. */
  springK: number;
  /** Ideal edge length. */
  springRest: number;
  /** Centering force pulling nodes toward (0, 0). */
  centerK: number;
  /** Per-tick velocity decay; lower = more damping. */
  damping: number;
}

const DEFAULT_OPTIONS: SimOptions = {
  width: 800,
  height: 520,
  iterations: 240,
  repulsion: 1800,
  springK: 0.02,
  springRest: 110,
  centerK: 0.014,
  damping: 0.78,
};

/**
 * Run a tiny force-directed layout in O(iterations * n^2). Fine for the
 * memory hub's expected node count (under a few hundred). Mutates the
 * graph's nodes in place and returns the same graph.
 */
export function relaxLayout(graph: MemoryGraph, overrides: Partial<SimOptions> = {}): MemoryGraph {
  const opts = { ...DEFAULT_OPTIONS, ...overrides };
  const { nodes, edges } = graph;
  if (!nodes.length) return graph;

  for (let step = 0; step < opts.iterations; step++) {
    // Repulsive (Coulomb-ish) pairwise.
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy + 0.01;
        const force = opts.repulsion / distSq;
        const dist = Math.sqrt(distSq);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // Spring (Hooke-ish) along each edge.
    for (const edge of edges) {
      const a = graph.byId[edge.from];
      const b = graph.byId[edge.to];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const displacement = dist - opts.springRest;
      const force = opts.springK * displacement;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // Centering pull.
    for (const node of nodes) {
      node.vx -= node.x * opts.centerK;
      node.vy -= node.y * opts.centerK;
      node.vx *= opts.damping;
      node.vy *= opts.damping;
      node.x += node.vx;
      node.y += node.vy;
    }
  }

  return graph;
}

/** Compute a viewBox that fits all nodes with some padding. */
export function viewBoxForGraph(graph: MemoryGraph, pad = 60) {
  if (!graph.nodes.length) return { x: -200, y: -150, w: 400, h: 300 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of graph.nodes) {
    if (node.x < minX) minX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.x > maxX) maxX = node.x;
    if (node.y > maxY) maxY = node.y;
  }
  const w = Math.max(maxX - minX + pad * 2, 300);
  const h = Math.max(maxY - minY + pad * 2, 200);
  return { x: minX - pad, y: minY - pad, w, h };
}
