import React, { useMemo, useState } from 'react';
import type { CurrencyCode, SankeyGraph, SankeyLink, SankeyNode } from '../types/finance';
import { formatMoney } from './ui';

interface SankeyChartProps {
  graph: SankeyGraph;
  currency: CurrencyCode;
  privacyMask: boolean;
  onSelectCategory?: (categoryId: string) => void;
}

interface PositionedNode extends SankeyNode {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PositionedLink extends SankeyLink {
  id: string;
  sourceNode: PositionedNode;
  targetNode: PositionedNode;
  y0Top: number;
  y0Bot: number;
  y1Top: number;
  y1Bot: number;
  path: string;
}

const SVG_W = 920;
const SVG_H = 380;
const PAD_TOP = 32;
const PAD_BOT = 20;
const NODE_W = 14;
const NODE_GAP = 12;

const COLUMN_TITLES: Record<0 | 1 | 2 | 3, string> = {
  0: 'Income Sources',
  1: 'Net Pool',
  2: 'Allocation',
  3: 'Top Categories',
};

export const SankeyChart: React.FC<SankeyChartProps> = ({
  graph,
  currency,
  privacyMask,
  onSelectCategory,
}) => {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number; maxW: number } | null>(null);

  const layout = useMemo(() => {
    const validNodes = graph.nodes.filter((n) => n.value > 0);
    if (validNodes.length === 0) {
      return { nodes: [] as PositionedNode[], links: [] as PositionedLink[], activeCols: [] as Array<{ col: 0 | 1 | 2 | 3; x: number }> };
    }

    const colMap = new Map<0 | 1 | 2 | 3, SankeyNode[]>();
    ([0, 1, 2, 3] as const).forEach((c) => {
      const list = validNodes.filter((n) => n.column === c).sort((a, b) => b.value - a.value);
      if (list.length > 0) colMap.set(c, list);
    });

    const presentCols = Array.from(colMap.keys()).sort((a, b) => a - b);
    const leftMargin = 148;
    const rightMargin = 162;
    const usableW = SVG_W - leftMargin - rightMargin - NODE_W;
    const colX = new Map<number, number>();
    presentCols.forEach((col, idx) => {
      const ratio = presentCols.length > 1 ? idx / (presentCols.length - 1) : 0.5;
      colX.set(col, leftMargin + ratio * usableW);
    });

    const plotH = SVG_H - PAD_TOP - PAD_BOT;
    // Compute unified pixel-per-dollar scale so every column fits comfortably
    let pxPerDollar = Infinity;
    for (const nodes of colMap.values()) {
      const totalVal = nodes.reduce((s, n) => s + n.value, 0);
      const gaps = Math.max(0, nodes.length - 1) * NODE_GAP;
      const available = Math.max(60, plotH - gaps);
      if (totalVal > 0) {
        pxPerDollar = Math.min(pxPerDollar, available / totalVal);
      }
    }
    if (!Number.isFinite(pxPerDollar)) pxPerDollar = 1;

    const nodeLookup = new Map<string, PositionedNode>();
    const positionedNodes: PositionedNode[] = [];

    for (const col of presentCols) {
      const nodes = colMap.get(col) ?? [];
      const heights = nodes.map((n) => Math.max(10, n.value * pxPerDollar));
      const totalH = heights.reduce((a, b) => a + b, 0) + Math.max(0, nodes.length - 1) * NODE_GAP;
      // If min-heights caused slight overflow, rescale proportionally
      const shrink = totalH > plotH ? plotH / totalH : 1;
      const scaledHeights = heights.map((h) => h * shrink);
      const scaledGap = NODE_GAP * shrink;
      const finalTotalH =
        scaledHeights.reduce((a, b) => a + b, 0) + Math.max(0, nodes.length - 1) * scaledGap;

      let cursorY = PAD_TOP + (plotH - finalTotalH) / 2;
      const x = colX.get(col) ?? leftMargin;

      nodes.forEach((n, i) => {
        const h = scaledHeights[i];
        const pn: PositionedNode = {
          ...n,
          x,
          y: cursorY,
          w: NODE_W,
          h,
        };
        nodeLookup.set(n.id, pn);
        positionedNodes.push(pn);
        cursorY += h + scaledGap;
      });
    }

    // Build links sorted by target y to reduce visual crossing
    const validLinks = graph.links
      .filter((l) => l.value > 0 && nodeLookup.has(l.source) && nodeLookup.has(l.target))
      .sort((a, b) => {
        const sa = nodeLookup.get(a.source)!;
        const sb = nodeLookup.get(b.source)!;
        if (sa.y !== sb.y) return sa.y - sb.y;
        const ta = nodeLookup.get(a.target)!;
        const tb = nodeLookup.get(b.target)!;
        return ta.y - tb.y;
      });

    // Compute total outgoing/incoming value per node to scale link thickness accurately inside each node
    const outSum = new Map<string, number>();
    const inSum = new Map<string, number>();
    validLinks.forEach((l) => {
      outSum.set(l.source, (outSum.get(l.source) ?? 0) + l.value);
      inSum.set(l.target, (inSum.get(l.target) ?? 0) + l.value);
    });

    const outOffset = new Map<string, number>();
    const inOffset = new Map<string, number>();

    const positionedLinks: PositionedLink[] = validLinks.map((l, idx) => {
      const sNode = nodeLookup.get(l.source)!;
      const tNode = nodeLookup.get(l.target)!;
      const sDenom = Math.max(sNode.value, outSum.get(l.source) ?? l.value);
      const tDenom = Math.max(tNode.value, inSum.get(l.target) ?? l.value);

      const h0 = Math.max(2, (l.value / sDenom) * sNode.h);
      const h1 = Math.max(2, (l.value / tDenom) * tNode.h);

      const o0 = outOffset.get(l.source) ?? 0;
      const o1 = inOffset.get(l.target) ?? 0;
      outOffset.set(l.source, o0 + h0);
      inOffset.set(l.target, o1 + h1);

      const y0Top = sNode.y + Math.min(o0, Math.max(0, sNode.h - h0));
      const y0Bot = Math.min(sNode.y + sNode.h, y0Top + h0);
      const y1Top = tNode.y + Math.min(o1, Math.max(0, tNode.h - h1));
      const y1Bot = Math.min(tNode.y + tNode.h, y1Top + h1);

      const x0 = sNode.x + sNode.w;
      const x1 = tNode.x;
      const dx = (x1 - x0) * 0.48;

      const path = [
        `M ${x0} ${y0Top}`,
        `C ${x0 + dx} ${y0Top}, ${x1 - dx} ${y1Top}, ${x1} ${y1Top}`,
        `L ${x1} ${y1Bot}`,
        `C ${x1 - dx} ${y1Bot}, ${x0 + dx} ${y0Bot}, ${x0} ${y0Bot}`,
        'Z',
      ].join(' ');

      return {
        ...l,
        id: `${l.source}__${l.target}__${idx}`,
        sourceNode: sNode,
        targetNode: tNode,
        y0Top,
        y0Bot,
        y1Top,
        y1Bot,
        path,
      };
    });

    const activeCols = presentCols.map((col) => ({
      col,
      x: (colX.get(col) ?? 0) + NODE_W / 2,
    }));

    return { nodes: positionedNodes, links: positionedLinks, activeCols };
  }, [graph]);

  // Compute highlighted path set (upstream + downstream from hovered node, or endpoints of hovered link)
  const { highlightedNodes, highlightedLinks } = useMemo(() => {
    const hNodes = new Set<string>();
    const hLinks = new Set<string>();

    if (hoveredLinkId) {
      const link = layout.links.find((l) => l.id === hoveredLinkId);
      if (link) {
        hLinks.add(link.id);
        hNodes.add(link.source);
        hNodes.add(link.target);
      }
      return { highlightedNodes: hNodes, highlightedLinks: hLinks };
    }

    if (hoveredNodeId) {
      hNodes.add(hoveredNodeId);
      // Forward traversal
      const fwdQueue = [hoveredNodeId];
      while (fwdQueue.length > 0) {
        const cur = fwdQueue.shift()!;
        for (const l of layout.links) {
          if (l.source === cur && !hLinks.has(l.id)) {
            hLinks.add(l.id);
            hNodes.add(l.target);
            fwdQueue.push(l.target);
          }
        }
      }
      // Backward traversal
      const bwdQueue = [hoveredNodeId];
      while (bwdQueue.length > 0) {
        const cur = bwdQueue.shift()!;
        for (const l of layout.links) {
          if (l.target === cur && !hLinks.has(l.id)) {
            hLinks.add(l.id);
            hNodes.add(l.source);
            bwdQueue.push(l.source);
          }
        }
      }
    }
    return { highlightedNodes: hNodes, highlightedLinks: hLinks };
  }, [hoveredNodeId, hoveredLinkId, layout.links]);

  const hasHover = hoveredNodeId !== null || hoveredLinkId !== null;
  const denom = Math.max(graph.totalIncome, graph.totalAllocated, 1);

  const hoveredInfo = useMemo(() => {
    if (hoveredNodeId) {
      const n = layout.nodes.find((item) => item.id === hoveredNodeId);
      if (!n) return null;
      return {
        title: n.label,
        subtitle:
          n.filterType === 'category'
            ? 'Click to filter transactions'
            : COLUMN_TITLES[n.column],
        value: n.value,
        pct: (n.value / denom) * 100,
        color: n.color,
      };
    }
    if (hoveredLinkId) {
      const l = layout.links.find((item) => item.id === hoveredLinkId);
      if (!l) return null;
      return {
        title: `${l.sourceNode.label} → ${l.targetNode.label}`,
        subtitle: 'Cashflow Stream',
        value: l.value,
        pct: (l.value / denom) * 100,
        color: l.color,
      };
    }
    return null;
  }, [hoveredNodeId, hoveredLinkId, layout.nodes, layout.links, denom]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      maxW: rect.width,
    });
  };

  if (layout.nodes.length === 0) {
    return (
      <div className="tactile-well h-[260px] flex flex-col items-center justify-center text-center px-6">
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          Not enough cashflow data for this period
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm">
          Log income and expenses to watch your money flow from paycheck to categories.
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative w-full min-w-0 select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        setHoveredNodeId(null);
        setHoveredLinkId(null);
        setTooltipPos(null);
      }}
    >
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="Interactive cashflow Sankey diagram"
      >
        <defs>
          {layout.links.map((l) => (
            <linearGradient
              key={`grad-${l.id}`}
              id={`sankey-grad-${l.id}`}
              gradientUnits="userSpaceOnUse"
              x1={l.sourceNode.x + l.sourceNode.w}
              x2={l.targetNode.x}
              y1={0}
              y2={0}
            >
              <stop offset="0%" stopColor={l.sourceNode.color} />
              <stop offset="100%" stopColor={l.targetNode.color} />
            </linearGradient>
          ))}
        </defs>

        {/* Subtle Column Tracks & Headers */}
        {layout.activeCols.map(({ col, x }) => (
          <g key={`hdr-${col}`}>
            <line
              x1={x}
              y1={PAD_TOP - 4}
              x2={x}
              y2={SVG_H - PAD_BOT + 4}
              stroke="var(--border-hairline)"
              strokeWidth={1}
              strokeDasharray="2 4"
              opacity={0.7}
            />
            <text
              x={x}
              y={15}
              textAnchor="middle"
              fill="var(--text-muted)"
              className="text-[11px] font-semibold"
            >
              {COLUMN_TITLES[col]}
            </text>
          </g>
        ))}

        {/* Flow Ribbons */}
        <g>
          {layout.links.map((l) => {
            const isHighlighted = !hasHover || highlightedLinks.has(l.id);
            const opacity = hasHover ? (isHighlighted ? 0.72 : 0.1) : 0.36;
            return (
              <path
                key={l.id}
                d={l.path}
                fill={`url(#sankey-grad-${l.id})`}
                fillOpacity={opacity}
                className="transition-[fill-opacity] duration-200 cursor-pointer"
                onMouseEnter={() => {
                  setHoveredNodeId(null);
                  setHoveredLinkId(l.id);
                }}
                onMouseLeave={() => setHoveredLinkId(null)}
                onClick={() => {
                  if (l.targetNode.filterType === 'category' && l.targetNode.filterId && onSelectCategory) {
                    onSelectCategory(l.targetNode.filterId);
                  }
                }}
              />
            );
          })}
        </g>

        {/* Nodes & Labels */}
        <g>
          {layout.nodes.map((n) => {
            const isHighlighted = !hasHover || highlightedNodes.has(n.id);
            const isClickable = n.filterType === 'category' && Boolean(n.filterId) && Boolean(onSelectCategory);
            const isLeftLabel = n.column === 0;
            const isRightLabel = n.column === 3 || n.column === 2;
            const labelX = isLeftLabel
              ? n.x - 10
              : isRightLabel
              ? n.x + n.w + 10
              : n.x + n.w / 2;
            const anchor = isLeftLabel ? 'end' : isRightLabel ? 'start' : 'middle';
            const labelY = n.column === 1 ? n.y - 8 : n.y + n.h / 2;
            const pct = Math.round((n.value / denom) * 100);

            return (
              <g
                key={n.id}
                className={`transition-opacity duration-200 ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
                opacity={isHighlighted ? 1 : 0.32}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                aria-label={
                  isClickable
                    ? `Filter transactions by ${n.label}: ${formatMoney(n.value, currency)} (${pct}%)`
                    : undefined
                }
                onMouseEnter={() => {
                  setHoveredLinkId(null);
                  setHoveredNodeId(n.id);
                }}
                onMouseLeave={() => setHoveredNodeId(null)}
                onFocus={() => {
                  if (isClickable) {
                    setHoveredLinkId(null);
                    setHoveredNodeId(n.id);
                  }
                }}
                onBlur={() => {
                  if (isClickable) setHoveredNodeId(null);
                }}
                onClick={() => {
                  if (isClickable && n.filterId && onSelectCategory) {
                    onSelectCategory(n.filterId);
                  }
                }}
                onKeyDown={(e) => {
                  if (isClickable && n.filterId && onSelectCategory && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSelectCategory(n.filterId);
                  }
                }}
              >
                <rect
                  x={n.x}
                  y={n.y}
                  width={n.w}
                  height={n.h}
                  rx={4}
                  fill={n.color}
                  stroke="var(--bg-surface)"
                  strokeWidth={1.5}
                  className="transition-transform duration-150"
                />
                {n.column === 1 ? (
                  <g>
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor="middle"
                      fill="var(--text-primary)"
                      className="text-[11px] font-semibold"
                    >
                      {n.label}
                    </text>
                  </g>
                ) : (
                  <g>
                    <text
                      x={labelX}
                      y={n.h >= 24 ? labelY - 3 : labelY + 3.5}
                      textAnchor={anchor}
                      fill="var(--text-primary)"
                      className="text-[11.5px] font-medium"
                    >
                      {n.label.length > 18 ? `${n.label.slice(0, 17)}…` : n.label}
                    </text>
                    {n.h >= 24 && (
                      <text
                        x={labelX}
                        y={labelY + 11}
                        textAnchor={anchor}
                        fill="var(--text-muted)"
                        className={`text-[10px] tabular-nums ${
                          privacyMask ? 'privacy-blur' : ''
                        }`}
                      >
                        {formatMoney(n.value, currency, { compact: true })} · {pct}%
                      </text>
                    )}
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Floating Hover Tooltip */}
      {hoveredInfo && tooltipPos && (
        <div
          className="tactile-card-elevated pointer-events-none absolute z-30 px-3 py-2.5 text-xs min-w-[185px] max-w-[260px]"
          style={{
            left: Math.max(8, Math.min(tooltipPos.x + 14, Math.max(8, tooltipPos.maxW - 210))),
            top: Math.max(8, tooltipPos.y - 72),
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: hoveredInfo.color }}
              aria-hidden="true"
            />
            <span className="font-semibold text-[var(--text-primary)] truncate">
              {hoveredInfo.title}
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-4">
            <span
              className={`font-semibold text-sm tabular-nums text-[var(--text-primary)] ${
                privacyMask ? 'privacy-blur' : ''
              }`}
            >
              {formatMoney(hoveredInfo.value, currency)}
            </span>
            <span className="text-[var(--text-secondary)] tabular-nums font-medium">
              {hoveredInfo.pct.toFixed(1)}%
            </span>
          </div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{hoveredInfo.subtitle}</div>
        </div>
      )}
    </div>
  );
};
