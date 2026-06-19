import { describe, expect, it } from 'vitest';
import { computeGraphLeadWidth, computeGraphVisibleWindow, graphRefRailWidth, graphRowHeight, graphRowMaxVisibleRefs, graphRowShowsInlineMeta, graphRowTemplateColumns } from '../../src/graph/rowLayout';

describe('graphRowTemplateColumns', () => {
  it('keeps the graph column isolated from commit metadata in comfortable density', () => {
    expect(graphRowTemplateColumns(96, 'comfortable')).toBe('220px 96px minmax(420px,1fr) 112px 80px 64px');
  });

  it('keeps a dedicated graph column in compact density', () => {
    expect(graphRowTemplateColumns(96, 'compact')).toBe('180px 96px minmax(280px,1fr) 80px');
  });

  it('uses a two-column layout in detailed density so message metadata stays stacked', () => {
    expect(graphRowTemplateColumns(120, 'detailed')).toBe('260px 120px minmax(420px,1fr)');
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
    expect(graphRefRailWidth('compact')).toBe(180);
    expect(graphRefRailWidth('comfortable')).toBe(220);
    expect(graphRefRailWidth('detailed')).toBe(260);
  });

  it('uses taller rows where wrapped refs are expected', () => {
    expect(graphRowHeight('compact')).toBe(28);
    expect(graphRowHeight('comfortable')).toBe(38);
    expect(graphRowHeight('detailed')).toBe(46);
  });

  it('computes virtual rows using zoom-adjusted scroll metrics', () => {
    expect(computeGraphVisibleWindow(760, 380, 38, 1.9, 500)).toEqual({
      firstRow: 0,
      lastRow: 66,
      visibleCount: 66,
      offsetY: 0,
    });
  });

  it('advances the virtual window after enough zoom-adjusted scroll', () => {
    expect(computeGraphVisibleWindow(3200, 760, 38, 1.6, 500)).toEqual({
      firstRow: 22,
      lastRow: 95,
      visibleCount: 73,
      offsetY: 836,
    });
  });
});
