import type { GraphEdgeSegment, GraphNode, GraphRow } from './layout';

export type GraphDensity = 'compact' | 'comfortable' | 'detailed';

export const GRAPH_LANE_WIDTH = 16;
export const GRAPH_LANE_PADDING = 12;
export const GRAPH_BUFFER_ROWS = 30;
export const GRAPH_WIDTH_PERCENTILE = 0.75;
export const GRAPH_WIDTH_HYSTERESIS_LANES = 1;
export const GRAPH_REF_RAIL_INSET = 12;

type LaneUsageRow = Pick<GraphRow, 'sha' | 'activeLanes' | 'edges'> & {
  node: Pick<GraphNode, 'lane'>;
};

export interface GraphWidthPolicyOptions {
  minimumLaneCount?: number;
  percentile?: number;
  selectedSha?: string | null;
}

export interface GraphWidthStabilizationState {
  renderLaneCount: number;
  pendingShrinkLaneCount: number | null;
}

export interface GraphWidthStabilizationInput extends GraphWidthStabilizationState {
  targetLaneCount: number;
  hysteresisLanes?: number;
}

export interface GraphVisibleWindow {
  firstRow: number;
  lastRow: number;
  visibleCount: number;
  offsetY: number;
}

export function computeGraphLeadWidth(maxLane: number): number {
  return 48 + Math.max(0, maxLane) * GRAPH_LANE_WIDTH;
}

export function computeGraphLeadWidthForLaneCount(laneCount: number): number {
  return computeGraphLeadWidth(Math.max(0, laneCount - 1));
}

export function graphRowLaneCount(row: LaneUsageRow): number {
  let maxLane = row.node.lane;

  for (const lane of row.activeLanes) {
    if (lane > maxLane) maxLane = lane;
  }

  for (const edge of row.edges) {
    maxLane = maxLaneIndex(maxLane, edge);
  }

  return Math.max(1, maxLane + 1);
}

export function computeVisibleGraphLaneCount(
  rows: readonly LaneUsageRow[],
  options: GraphWidthPolicyOptions = {},
): number {
  const minimumLaneCount = Math.max(1, options.minimumLaneCount ?? 1);
  if (rows.length === 0) return minimumLaneCount;

  const laneCounts = rows.map(graphRowLaneCount).sort((a, b) => a - b);
  const percentile = clampPercentile(options.percentile ?? GRAPH_WIDTH_PERCENTILE);
  const percentileIndex = Math.floor((laneCounts.length - 1) * percentile);
  let laneCount = Math.max(minimumLaneCount, laneCounts[percentileIndex] ?? minimumLaneCount);

  if (options.selectedSha) {
    const selectedRow = rows.find((row) => row.sha === options.selectedSha);
    if (selectedRow) {
      laneCount = Math.max(laneCount, graphRowLaneCount(selectedRow));
    }
  }

  return laneCount;
}

export function updateGraphWidthStabilization(
  input: GraphWidthStabilizationInput,
): GraphWidthStabilizationState {
  const hysteresisLanes = Math.max(0, input.hysteresisLanes ?? GRAPH_WIDTH_HYSTERESIS_LANES);
  const renderLaneCount = Math.max(1, input.renderLaneCount);
  const targetLaneCount = Math.max(1, input.targetLaneCount);

  if (targetLaneCount >= renderLaneCount) {
    return {
      renderLaneCount: targetLaneCount,
      pendingShrinkLaneCount: null,
    };
  }

  if (renderLaneCount - targetLaneCount <= hysteresisLanes) {
    return {
      renderLaneCount,
      pendingShrinkLaneCount: null,
    };
  }

  return {
    renderLaneCount,
    pendingShrinkLaneCount: targetLaneCount,
  };
}

export function applyPendingGraphWidthShrink(
  state: GraphWidthStabilizationState,
): GraphWidthStabilizationState {
  if (state.pendingShrinkLaneCount === null) return state;

  return {
    renderLaneCount: state.pendingShrinkLaneCount,
    pendingShrinkLaneCount: null,
  };
}

export function graphRefRailWidth(density: GraphDensity): number {
  switch (density) {
    case 'compact':
      return 200;
    case 'detailed':
      return 280;
    case 'comfortable':
    default:
      return 240;
  }
}

export function graphRefRailInset(_density: GraphDensity): number {
  return GRAPH_REF_RAIL_INSET;
}

export function graphRowTemplateColumns(graphWidth: number, density: GraphDensity): string {
  const refRailWidth = graphRefRailWidth(density);
  switch (density) {
    case 'compact':
      return `${refRailWidth}px ${graphWidth}px minmax(100px,1fr) 80px`;
    case 'detailed':
      return `${refRailWidth}px ${graphWidth}px minmax(100px,1fr)`;
    case 'comfortable':
    default:
      return `${refRailWidth}px ${graphWidth}px minmax(100px,1fr) 112px 80px 64px`;
  }
}

export function graphRowShowsInlineMeta(density: GraphDensity): boolean {
  return density === 'detailed';
}

export function graphRowHeight(density: GraphDensity): number {
  switch (density) {
    case 'compact':
      return 28;
    case 'detailed':
      return 46;
    case 'comfortable':
    default:
      return 38;
  }
}

export function graphRowMaxVisibleRefs(density: GraphDensity): number {
  switch (density) {
    case 'compact':
      return 2;
    case 'comfortable':
      return 2;
    case 'detailed':
    default:
      return 4;
  }
}

export function computeGraphVisibleWindow(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  _zoom: number,
  rowCount: number,
  bufferRows: number = GRAPH_BUFFER_ROWS,
): GraphVisibleWindow {
  const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight) - bufferRows);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + bufferRows * 2;
  const lastRow = Math.min(rowCount, firstRow + visibleCount);
  return {
    firstRow,
    lastRow,
    visibleCount,
    offsetY: firstRow * rowHeight,
  };
}

export function graphContentScrollTop(
  scrollTop: number,
  rowHeight: number,
  zoom: number,
  hasWip: boolean,
): number {
  return Math.max(0, scrollTop - (hasWip ? rowHeight * Math.max(zoom, 0) : 0));
}

function clampPercentile(percentile: number): number {
  if (!Number.isFinite(percentile)) return GRAPH_WIDTH_PERCENTILE;
  return Math.min(1, Math.max(0, percentile));
}

function maxLaneIndex(maxLane: number, edge: Pick<GraphEdgeSegment, 'fromLane' | 'toLane'>): number {
  return Math.max(maxLane, edge.fromLane, edge.toLane);
}
