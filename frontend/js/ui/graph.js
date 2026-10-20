/**
 * 力导向知识图谱（vis-network）：
 * 节点=实体（颜色=实体类型，大小=提及次数），边=关系谓词（叙事实线 / 表格虚线）。
 * 选中态由视图通过 query（?t=/?n=）驱动；这里只负责物理布局与事件。
 */
import { loadVis } from './vis-loader.js';
import { typeColor, TYPE_HEX } from './components.js';

/**
 * 构建图谱。返回 {network, legendTypes, destroy()}。
 * onSelect({type:'edge'|'node', id})；onDeselect() 点空白触发。
 */
export async function buildGraph(container, result, { onSelect, onDeselect } = {}) {
  const vis = await loadVis();
  if (!vis) return null; // 降级：调用方渲染空态

  const entities = result.entities || [];
  const triples = result.triples || [];

  // 实体图例类型（按实际类型动态生成）
  const types = [...new Set([
    ...entities.map((e) => e.entity_type),
    ...triples.flatMap((t) => [t.head.type, t.tail.type]),
  ])].filter(Boolean);

  const mentions = new Map(entities.map((e) => [e.normalized_name, e.mentions || 1]));
  const sizeOf = (name) => {
    const m = mentions.get(name) || 1;
    return 10 + Math.min(m, 6) * 2.5;
  };

  const nodeIds = new Set();
  const nodes = [];
  const ensureNode = (name, type) => {
    if (nodeIds.has(name)) return;
    nodeIds.add(name);
    nodes.push({
      id: name,
      label: name.length > 14 ? name.slice(0, 13) + '…' : name,
      title: `${name} · ${type}`,
      size: sizeOf(name),
      color: {
        background: TYPE_HEX[type] || TYPE_HEX.unknown,
        border: '#FFFFFF',
        highlight: { background: TYPE_HEX[type] || TYPE_HEX.unknown, border: '#1B2A3A' },
      },
      // shape=dot 的标签绘制在节点下方，用墨蓝色而非白字
      font: { color: '#1B2A3A', size: 11, face: 'PingFang SC, sans-serif', strokeWidth: 3, strokeColor: '#EFF2F5' },
      shape: 'dot',
    });
  };
  for (const t of triples) {
    ensureNode(t.head.name, t.head.type);
    ensureNode(t.tail.name, t.tail.type);
  }

  const edges = triples.map((t, i) => ({
    id: t.triple_id,
    from: t.head.name,
    to: t.tail.name,
    label: t.predicate,
    triplePath: t.provenance.path,
    font: { size: 10, color: '#6E7E8E', face: 'SF Mono, monospace', strokeWidth: 0 },
    color: { color: t.provenance.path === 'narrative' ? '#2B5D8C' : '#2E7D46', highlight: '#C4442E', hover: '#1E4668' },
    dashes: t.provenance.path !== 'narrative',
    arrows: 'to',
    smooth: { enabled: true, type: 'curvedCW', roundness: 0.15 + (i % 4) * 0.05 },
  }));

  const data = { nodes, edges };
  const options = {
    physics: {
      solver: 'forceAtlas2Based',
      forceAtlas2Based: { gravitationalConstant: -45, centralGravity: 0.012, springLength: 110, springConstant: 0.05, avoidOverlap: 0.4 },
      stabilization: { iterations: window.innerWidth < 768 ? 60 : 160, fit: true },
    },
    interaction: {
      hover: true,
      selectConnectedEdges: false,
      navigationButtons: false,
    },
    nodes: { borderWidth: 2, shadow: false },
    edges: { selectionWidth: 2 },
  };

  const network = new vis.Network(container, data, options);

  network.on('click', (params) => {
    if (params.edges.length) {
      onSelect && onSelect({ type: 'edge', id: edges[params.edges[0]].id });
    } else if (params.nodes.length) {
      const node = nodes.find((n) => n.id === params.nodes[0]);
      onSelect && onSelect({ type: 'node', id: params.nodes[0], label: node ? node.title : '' });
    } else {
      onDeselect && onDeselect();
    }
  });

  // 选中态同步（视图 query 变化时调用）
  const syncSelection = ({ tripleId, entityName }) => {
    if (tripleId) network.selectEdges([tripleId]);
    else if (entityName) network.selectNodes([entityName]);
    else network.unselectAll();
  };

  return {
    network,
    legendTypes: types,
    syncSelection,
    destroy: () => network.destroy(),
  };
}
