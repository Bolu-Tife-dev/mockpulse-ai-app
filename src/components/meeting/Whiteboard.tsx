import { useCallback, useEffect, useRef, useState } from 'react';

type NodeKind = 'client' | 'gateway' | 'service' | 'cache' | 'queue' | 'db' | 'storage';

interface WBNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

interface WBEdge {
  id: string;
  from: string;
  to: string;
}

const PALETTE: { kind: NodeKind; label: string; color: string; glyph: string }[] = [
  { kind: 'client', label: 'Client', color: '#6c94ff', glyph: '◇' },
  { kind: 'gateway', label: 'API Gateway', color: '#38f2c6', glyph: '◈' },
  { kind: 'service', label: 'Service', color: '#4670ff', glyph: '⬢' },
  { kind: 'cache', label: 'Cache', color: '#f5b544', glyph: '⚡' },
  { kind: 'queue', label: 'Queue', color: '#c084fc', glyph: '≡' },
  { kind: 'db', label: 'Database', color: '#34d399', glyph: '⬤' },
  { kind: 'storage', label: 'Storage', color: '#94a3b8', glyph: '▣' },
];

const NODE_W = 148;
const NODE_H = 62;
const uid = () => Math.random().toString(36).slice(2, 9);

function edgeAnchor(n: WBNode, tx: number, ty: number) {
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const s = Math.min(dx !== 0 ? n.w / 2 / Math.abs(dx) : Infinity, dy !== 0 ? n.h / 2 / Math.abs(dy) : Infinity);
  return { x: cx + dx * s, y: cy + dy * s };
}

export default function Whiteboard() {
  const [nodes, setNodes] = useState<WBNode[]>([
    { id: 'n1', kind: 'client', x: 32, y: 48, w: NODE_W, h: NODE_H, label: 'Web / Mobile client' },
    { id: 'n2', kind: 'gateway', x: 236, y: 48, w: NODE_W, h: NODE_H, label: 'API gateway' },
    { id: 'n3', kind: 'service', x: 236, y: 168, w: NODE_W, h: NODE_H, label: 'Core service' },
    { id: 'n4', kind: 'db', x: 36, y: 168, w: NODE_W, h: NODE_H, label: 'Primary DB' },
  ]);
  const [edges, setEdges] = useState<WBEdge[]>([
    { id: 'e1', from: 'n1', to: 'n2' },
    { id: 'e2', from: 'n2', to: 'n3' },
    { id: 'e3', from: 'n3', to: 'n4' },
  ]);

  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [link, setLink] = useState<{ from: string; x: number; y: number } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const cascade = useRef(0);
  const editInput = useRef<HTMLInputElement>(null);

  const toLocal = useCallback((e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const addNode = (kind: NodeKind, label: string) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const w = rect?.width ?? 640;
    const h = rect?.height ?? 480;
    const i = cascade.current++;
    const node: WBNode = {
      id: uid(),
      kind,
      label,
      w: NODE_W,
      h: NODE_H,
      x: Math.max(12, Math.min(w - NODE_W - 12, w / 2 - NODE_W / 2 + ((i % 5) - 2) * 26)),
      y: Math.max(12, Math.min(h - NODE_H - 12, h / 2 - NODE_H / 2 + ((i % 4) - 1.5) * 24)),
    };
    setNodes((n) => [...n, node]);
    setSelected(node.id);
  };

  const onSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    const nodeEl = target.closest('[data-node-id]');
    const portEl = target.closest('[data-port]');

    if (portEl && nodeEl) {
      const id = nodeEl.getAttribute('data-node-id')!;
      const p = toLocal(e);
      setLink({ from: id, x: p.x, y: p.y });
      svgRef.current?.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (nodeEl) {
      const id = nodeEl.getAttribute('data-node-id')!;
      const node = nodes.find((n) => n.id === id);
      if (!node) return;
      const p = toLocal(e);
      setSelected(id);
      dragRef.current = { id, dx: p.x - node.x, dy: p.y - node.y };
      svgRef.current?.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    setSelected(null);
    setEditing(null);
  };

  const onSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toLocal(e);
    if (link) {
      setLink({ ...link, x: p.x, y: p.y });
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    setNodes((ns) =>
      ns.map((n) =>
        n.id === drag.id
          ? {
              ...n,
              x: Math.max(4, Math.min((svgRef.current?.clientWidth ?? 1000) - n.w - 4, p.x - drag.dx)),
              y: Math.max(4, Math.min((svgRef.current?.clientHeight ?? 800) - n.h - 4, p.y - drag.dy)),
            }
          : n,
      ),
    );
  };

  const onSvgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (link) {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-node-id]');
      const toId = el?.getAttribute('data-node-id');
      if (toId && toId !== link.from) {
        setEdges((eds) =>
          eds.some((x) => (x.from === link.from && x.to === toId) || (x.from === toId && x.to === link.from))
            ? eds
            : [...eds, { id: uid(), from: link.from, to: toId }],
        );
      }
      setLink(null);
    }
    dragRef.current = null;
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    setNodes((ns) => ns.filter((n) => n.id !== selected));
    setEdges((es) => es.filter((e) => e.from !== selected && e.to !== selected));
    setSelected(null);
    setEditing(null);
  }, [selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        deleteSelected();
      }
      if (e.key === 'Escape') {
        setSelected(null);
        setLink(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected, selected]);

  useEffect(() => {
    if (editing) editInput.current?.focus();
  }, [editing]);

  const commitLabel = () => {
    if (editing) {
      const value = draftLabel.trim();
      setNodes((ns) => ns.map((n) => (n.id === editing ? { ...n, label: value || n.label } : n)));
    }
    setEditing(null);
  };

  const byId = (id: string) => nodes.find((n) => n.id === id);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* palette */}
      <div className="shrink-0 border-b border-white/8 px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Architecture whiteboard
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="btn-ghost !rounded-lg !px-2 !py-1 !text-[11px]"
              onClick={deleteSelected}
              disabled={!selected}
            >
              Delete
            </button>
            <button
              type="button"
              className="btn-ghost !rounded-lg !px-2 !py-1 !text-[11px]"
              onClick={() => {
                setNodes([]);
                setEdges([]);
                setSelected(null);
              }}
              disabled={!nodes.length}
            >
              Clear
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PALETTE.map((p) => (
            <button
              key={p.kind}
              type="button"
              onClick={() => addNode(p.kind, p.label)}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-white/25 hover:bg-white/[0.09]"
            >
              <span style={{ color: p.color }}>{p.glyph}</span>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* canvas */}
      <div className="relative min-h-0 flex-1 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px]">
        <svg
          ref={svgRef}
          className="h-full w-full touch-none select-none"
          onPointerDown={onSvgPointerDown}
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#6c94ff" />
            </marker>
          </defs>

          {edges.map((e) => {
            const a = byId(e.from);
            const b = byId(e.to);
            if (!a || !b) return null;
            const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
            const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
            const p1 = edgeAnchor(a, bc.x, bc.y);
            const p2 = edgeAnchor(b, ac.x, ac.y);
            return (
              <g key={e.id}>
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="#4670ff"
                  strokeOpacity={0.75}
                  strokeWidth={2}
                  markerEnd="url(#arrow)"
                />
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="transparent"
                  strokeWidth={12}
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    setEdges((eds) => eds.filter((x) => x.id !== e.id));
                  }}
                />
              </g>
            );
          })}

          {link && (() => {
            const a = byId(link.from);
            if (!a) return null;
            const p1 = edgeAnchor(a, link.x, link.y);
            return (
              <line
                x1={p1.x}
                y1={p1.y}
                x2={link.x}
                y2={link.y}
                stroke="#38f2c6"
                strokeWidth={2}
                strokeDasharray="6 5"
              />
            );
          })()}

          {nodes.map((n) => {
            const meta = PALETTE.find((p) => p.kind === n.kind)!;
            const isSelected = selected === n.id;
            return (
              <g key={n.id} data-node-id={n.id} style={{ cursor: 'grab' }}>
                <rect
                  x={n.x}
                  y={n.y}
                  width={n.w}
                  height={n.h}
                  rx={12}
                  fill="#0d1230"
                  fillOpacity={0.94}
                  stroke={isSelected ? '#38f2c6' : meta.color}
                  strokeWidth={isSelected ? 2.2 : 1.4}
                />
                <rect x={n.x} y={n.y} width={4} height={n.h} rx={2} fill={meta.color} />
                <text x={n.x + 16} y={n.y + 24} fill={meta.color} fontSize={13}>
                  {meta.glyph}
                </text>
                {editing === n.id ? (
                  <foreignObject x={n.x + 10} y={n.y + 30} width={n.w - 20} height={24}>
                    <input
                      ref={editInput}
                      className="w-full rounded border border-night-400/70 bg-black/70 px-1.5 py-0.5 text-[12px] text-white outline-none"
                      value={draftLabel}
                      onChange={(ev) => setDraftLabel(ev.target.value)}
                      onBlur={commitLabel}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') commitLabel();
                        if (ev.key === 'Escape') setEditing(null);
                      }}
                    />
                  </foreignObject>
                ) : (
                  <text
                    x={n.x + 14}
                    y={n.y + 47}
                    fill="#e2e8f0"
                    fontSize={12.5}
                    fontWeight={600}
                    onDoubleClick={() => {
                      setEditing(n.id);
                      setDraftLabel(n.label);
                    }}
                  >
                    {n.label.length > 20 ? `${n.label.slice(0, 19)}…` : n.label}
                  </text>
                )}

                {/* link port */}
                <circle
                  data-port="out"
                  cx={n.x + n.w}
                  cy={n.y + n.h / 2}
                  r={7}
                  fill="#0a0e24"
                  stroke={meta.color}
                  strokeWidth={2}
                  style={{ cursor: 'crosshair' }}
                />
              </g>
            );
          })}
        </svg>

        <div className="pointer-events-none absolute bottom-2.5 left-3 text-[10px] leading-relaxed text-slate-600">
          Drag blocks to move · drag from a right-hand port to connect · double-click to rename · Del to remove
        </div>
      </div>
    </div>
  );
}
