import { describe, expect, it } from 'vitest';
import {
  computeGraphLeadWidth,
  computeGraphVisibleWindow,
  graphContentScrollTop,
  graphRefRailInset,
  graphRefRailWidth,
  graphRowHeight,
  graphRowMaxVisibleRefs,
  graphRowShowsInlineMeta,
  graphRowTemplateColumns,
} from '../../src/graph/rowLayout';

describe('graphRowTemplateColumns', () => {
  it('keeps the graph column isolated from commit metadata in comfortable density', () => {
    expect(graphRowTemplateColumns(96, 'comfortable')).toBe('240px 96px minmax(100px,1fr) 112px 80px 64px');
  });

  it('keeps a dedicated graph column in compact density', () => {
    expect(graphRowTemplateColumns(96, 'compact')).toBe('200px 96px minmax(100px,1fr) 80px');
  });

  it('uses a two-column layout in detailed density so message metadata stays stacked', () => {
    expect(graphRowTemplateColumns(120, 'detailed')).toBe('280px 120px minmax(100px,1fr)');
  });

  it('shows inline metadata only in detailed density', () => {
    expect(graphRowShowsInlineMeta('compact')).toBe(false);
    expect(graphRowShowsInlineMeta('comfortable')).toBe(false);
    expect(graphRowShowsInlineMeta('detailed')).toBe(true);
  });

  it('limits visible refs more aggressively outside detailed density', () => {
    expect(graphRowMaxVisibleRefs('compact')).toBe(2);
    expect(graphRowMaxVisibleRefs('comfortable')).toBe(2);
    expect(graphRowMaxVisibleRefs('detailed')).toBe(4);
  });

  it('keeps the graph lead area compact for small lane counts', () => {
    expect(computeGraphLeadWidth(0)).toBe(48);
    expect(computeGraphLeadWidth(1)).toBe(64);
    expect(computeGraphLeadWidth(4)).toBe(112);
  });

  it('uses a sticky-friendly ref rail width per density', () => {
    expect(graphRefRailWidth('compact')).toBe(200);
    expect(graphRefRailWidth('comfortable')).toBe(240);
    expect(graphRefRailWidth('detailed')).toBe(280);
  });

  it('keeps a consistent gutter between the sidebar edge and branch badges', () => {
    expect(graphRefRailInset('compact')).toBe(12);
    expect(graphRefRailInset('comfortable')).toBe(12);
    expect(graphRefRailInset('detailed')).toBe(12);
  });

  it('uses taller rows where wrapped refs are expected', () => {
    expect(graphRowHeight('compact')).toBe(28);
    expect(graphRowHeight('comfortable')).toBe(38);
    expect(graphRowHeight('detailed')).toBe(46);
  });

  it('computes virtual rows using zoom-adjusted scroll metrics', () => {
    expect(computeGraphVisibleWindow(760, 380, 38, 1.9, 500)).toEqual({
      firstRow: 0,
      lastRow: 70,
      visibleCount: 70,
      offsetY: 0,
    });
  });

  it('advances the virtual window after enough zoom-adjusted scroll', () => {
    expect(computeGraphVisibleWindow(3200, 760, 38, 1.6, 500)).toEqual({
      firstRow: 54,
      lastRow: 134,
      visibleCount: 80,
      offsetY: 2052,
    });
  });

  it('subtracts the synthetic WIP row before virtualizing commit rows', () => {
    expect(graphContentScrollTop(120, 38, 2, true)).toBe(44);
    expect(graphContentScrollTop(120, 38, 2, false)).toBe(120);
    expect(graphContentScrollTop(20, 38, 1, true)).toBe(0);
  });
});
