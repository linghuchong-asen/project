// ============================================================
// 语图 Modify 场景 — 增量 Patch 输出类型定义
// ============================================================
// modify 场景下，模型不再输出完整 FlowDraft，而是输出增量操作序列。
// 每个 operation 描述一个原子变更（改一个节点、加一条边等），
// 系统按序执行后合并到当前画布。
//
// 语义枚举（NodeType）与 FlowDraft 共享同一套定义，
// 保证 generate 和 modify 场景的类型词汇完全一致。

// ────────────────────────────────────────
// 1. 语义枚举（复用 FlowDraft）
// ────────────────────────────────────────

/** 节点类型 — 与 FlowDraft 共享，不单独定义 */
type NodeType = "start" | "end" | "process" | "decision" | "io" | "subprocess";

// ────────────────────────────────────────
// 2. 视觉属性（受限枚举，非自由 JSON）
// ────────────────────────────────────────

type BorderStyle = "solid" | "dashed" | "dotted";
type FontWeight = "normal" | "bold";
type MarkerType = "classic" | "diamond" | "block" | "circle" | "none";
type Direction = "top" | "bottom" | "left" | "right";

/** 节点视觉 patch — 只描述变化量，未出现的字段保持原值 */
interface NodeVisualPatch {
  fillColor?: string;
  borderColor?: string;
  borderWidth?: 1 | 2 | 3 | 4 | 5;
  borderStyle?: BorderStyle;
  borderRadius?: number;
  width?: number;
  height?: number;
  fontColor?: string;
  fontSize?: 10 | 12 | 14 | 16 | 18 | 20 | 24;
  fontWeight?: FontWeight;
  shadow?: boolean;
}

/** 边视觉 patch */
interface EdgeVisualPatch {
  strokeColor?: string;
  strokeWidth?: 1 | 2 | 3 | 4 | 5;
  strokeDasharray?: string;
  targetMarker?: MarkerType;
  sourceMarker?: MarkerType;
  labelFontColor?: string;
  labelFontSize?: 10 | 12 | 14 | 16;
}

// ────────────────────────────────────────
// 3. Target 定位（按 label 或 id）
// ────────────────────────────────────────

/** 节点定位 — label 和 id 至少提供一个 */
interface NodeTarget {
  type: "node";
  oldLabel: string;
  oldId: string;
  oldNodeType: NodeType;
}
/** 按端点 label 定位边 */
interface EdgeTarget {
  type: "edge";
  source: string;
  target: string;
}

// ────────────────────────────────────────
// 4. 相对定位（新增节点时使用）
// ────────────────────────────────────────

interface RelativePosition {
  relativeTo: { label: string };
  direction: Direction;
  offset?: number; // 间距 px，默认 150
}

// ───────────────────────────────────────
// 5. 语义 patch
// ────────────────────────────────────────

interface NodeSemanticPatch {
  label?: string;
  nodeType?: NodeType; // 复用 FlowDraft 的 NodeType
}

interface EdgeSemanticPatch {
  label?: string;
}

// ────────────────────────────────────────
// 6. Operation 联合类型
// ────────────────────────────────────────

interface ModifyNodeOp {
  op: "modify_node";
  target: NodeTarget;
  semantic?: NodeSemanticPatch;
  visual?: NodeVisualPatch;
}

interface ModifyEdgeOp {
  op: "modify_edge";
  target: EdgeTarget;
  semantic?: EdgeSemanticPatch;
  visual?: EdgeVisualPatch;
}

interface AddNodeOp {
  op: "add_node";
  semantic: { label: string; nodeType: NodeType }; // 复用 FlowDraft 的 NodeType
  visual?: NodeVisualPatch;
  position?: RelativePosition;
}

interface AddEdgeOp {
  op: "add_edge";
  semantic: {
    source: { label: string };
    target: { label: string };
    label?: string;
  };
  visual?: EdgeVisualPatch;
}

interface DeleteNodeOp {
  op: "delete_node";
  target: NodeTarget;
}
interface DeleteEdgeOp {
  op: "delete_edge";
  target: EdgeTarget;
}

interface RepositionOp {
  op: "reposition";
  target: NodeTarget;
  position: RelativePosition;
}

type Operation =
  | ModifyNodeOp
  | ModifyEdgeOp
  | AddNodeOp
  | AddEdgeOp
  | DeleteNodeOp
  | DeleteEdgeOp
  | RepositionOp;

// ───────────────────────────────────────
// 7. 顶层输出
// ────────────────────────────────────────

interface ModifyPatchOutput {
  operations: Operation[];
}
