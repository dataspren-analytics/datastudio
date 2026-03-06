# xyflow Architecture Analysis

Reference implementation for how a professional React library separates UI, state, and business logic using Zustand.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│  @xyflow/system (pure logic, zero framework deps)   │
│  Algorithms, interaction controllers, types         │
├─────────────────────────────────────────────────────┤
│  Store + Hooks (React glue layer)                   │
│  State management, lifecycle, side-effects          │
├─────────────────────────────────────────────────────┤
│  Components (thin renderers)                        │
│  DOM structure, styles, delegating to user components│
└─────────────────────────────────────────────────────┘
```

Three layers with strict dependency direction: components depend on hooks/store, hooks/store depend on system. Never the reverse.

---

## Layer 1: System Package (Framework-Agnostic Logic)

Zero React imports. Only depends on d3 libraries. Shared between React and Svelte packages.

### Interaction Controllers

Factory functions that own entire interaction lifecycles via d3. Each returns `{ update, destroy }`.

| Controller | What it does |
|------------|-------------|
| `XYDrag` | Full drag interaction via d3-drag |
| `XYPanZoom` | Pan/zoom via d3-zoom |
| `XYHandle` | Connection handle pointer events |
| `XYResizer` | Node resize interaction |
| `XYMinimap` | Minimap pan interaction |

**Pattern**: Each takes a config object with a `getStoreItems` callback for lazy state reads. They never touch Zustand directly — they receive state as arguments and call provided callbacks to push results back.

```ts
// How a controller is created (in a React hook)
XYDrag({
  getStoreItems: () => store.getState(),
  onNodeMouseDown: (id) => { handleNodeClick({ id, store, nodeRef }); },
  onDragStart: () => { setDragging(true); },
  onDragStop: () => { setDragging(false); },
});
```

### Pure Computation Functions

- `adoptUserNodes()`, `updateAbsolutePositions()` — graph data transforms
- `calculateNodePosition()`, `snapPosition()` — position math
- `getNodesInside()`, `isEdgeVisible()` — viewport culling
- `getBezierPath()`, `getSmoothStepPath()` — edge path calculation
- `fitViewport()`, `panBy()` — viewport manipulation
- `addEdge()`, `reconnectEdge()` — connection utilities

### Type Definitions

Framework-agnostic base types: `NodeBase`, `InternalNodeBase`, `EdgeBase`, `Transform`, `Viewport`, `Connection`, `XYPosition`, `Rect`, lookup map type aliases.

---

## Layer 2: Zustand Store

### Single Monolithic Store Per Instance

One store holds everything: nodes, edges, viewport, selection, connection state, config flags, and event handler callbacks (~55+ fields). No slices, no split stores.

### Creation Pattern

Uses `createWithEqualityFn` from `zustand/traditional` (not standard `create()`). No middleware — no immer, no devtools, no persist. A factory function creates each store:

```ts
const createStore = ({ nodes, edges, ... }) =>
  createWithEqualityFn<ReactFlowState>((set, get) => ({
    ...getInitialState({ nodes, edges }),
    setNodes: (nodes) => {
      const { nodeLookup, parentLookup, ... } = get();
      adoptUserNodes(nodes, nodeLookup, parentLookup, { ... }); // system fn
      set({ nodes, nodesInitialized });
    },
    // ... 16 actions total, all inline
  }), Object.is);
```

### Type Separation

Clean split in a dedicated types file:

- **`ReactFlowStore<NodeType, EdgeType>`** — pure data/state shape
- **`ReactFlowActions<NodeType, EdgeType>`** — pure action method signatures
- **`ReactFlowState`** — the union: `ReactFlowStore & ReactFlowActions`

Both generic over `NodeType`/`EdgeType` with defaults.

### Actions Pattern

All actions are inline in the store. They:
- Use `get()` to read current state
- Call system package pure functions for computation
- Use `set()` to write results
- Can call other actions via `get()`

Components also use `store.setState()` directly for simple updates that don't need action logic.

### Provider Pattern (Context + Store Instance)

```ts
// Context holds the store instance, not the state
const StoreContext = createContext<ReturnType<typeof createStore> | null>(null);

// Provider creates store lazily (survives re-renders)
function ReactFlowProvider({ initialNodes, ... }) {
  const [store] = useState(() => createStore({ nodes, edges }));
  return <Provider value={store}>{children}</Provider>;
}
```

Auto-wrapping: `<ReactFlow>` checks if a StoreContext exists in the tree. If not, it wraps itself in `<ReactFlowProvider>`. Users can place the provider higher to share store access with sibling components.

### Multi-Instance Support

Each `<ReactFlowProvider>` creates an independent store via the factory. Context scoping ensures hooks read from the nearest provider. Multiple `<ReactFlow>` on one page each get isolated state.

---

## Layer 3: Hooks (The Glue Layer)

### Two Core Hooks for Store Access

```ts
// Reactive — re-renders on change
function useStore<StateSlice>(
  selector: (state: ReactFlowState) => StateSlice,
  equalityFn?: (a: StateSlice, b: StateSlice) => boolean
)

// Non-reactive — for event handlers, effects
function useStoreApi() // returns { getState, setState, subscribe }
```

### Hook Categories

**A) Controller lifecycles** — Create system instances, manage their React lifecycle:
```ts
// useDrag creates XYDrag, stores in ref, calls update/destroy
xyDrag.current = XYDrag({ getStoreItems: () => store.getState(), ... });
```

**B) Store selectors** — Thin typed access to specific store slices:
```ts
// useNodes, useEdges, useViewport, useInternalNode, useNodesData
useStore(s => s.nodes, shallow)
```

**C) Side-effect orchestrators** — Wire store state, DOM events, and user callbacks:
```ts
// useGlobalKeyHandler — listens for keys, reads store, dispatches changes
// useOnSelectionChange — registers callback in store handler array
// useViewportSync — syncs external viewport prop to internal state
```

**D) Imperative API builder** — `useReactFlow()` builds the full `ReactFlowInstance` using `useStoreApi()` (non-reactive), so calling methods never causes re-renders.

### Selector Optimization Patterns

1. **Module-level selectors** — defined outside components to avoid recreation
2. **`shallow` from `zustand/shallow`** — used in nearly every hook
3. **`useCallback`-wrapped selectors** — when selector depends on props
4. **Custom equality functions** — for fine-grained control (e.g., comparing only IDs)
5. **Computation inside selectors** — edge position calc runs in selector, only when deps change
6. **Component-level subscription splitting** — NodeRenderer subscribes to IDs, each NodeWrapper subscribes to its own node

---

## Layer 4: Components

### Two Architectural Roles

**`container/` — Structural shells** that compose children and set up infrastructure:

| Container | Role |
|-----------|------|
| `ReactFlow` | Auto-wraps with provider, renders `GraphView` + `StoreUpdater` |
| `GraphView` | Composes FlowRenderer > Viewport > EdgeRenderer + NodeRenderer |
| `FlowRenderer` | Composes ZoomPane > Pane, sets up keyboard handlers |
| `ZoomPane` | Instantiates `XYPanZoom` system controller |
| `Pane` | Handles selection pointer events |
| `Viewport` | CSS transform wrapper (20 lines) |
| `NodeRenderer` | Subscribes to visible node IDs, maps to `<NodeWrapper>` |
| `EdgeRenderer` | Subscribes to visible edge IDs, maps to `<EdgeWrapper>` |

**`components/` — Individual entities and leaf renderers:**

| Component | Role |
|-----------|------|
| `NodeWrapper` | Per-node subscription, drag setup via `useDrag()`, delegates to user's `NodeComponent` |
| `EdgeWrapper` | Per-edge subscription, position computation in selector, delegates to user's `EdgeComponent` |
| `Handle` | Connection point, calls `XYHandle.onPointerDown()` on interaction |
| `ConnectionLine` | Renders in-progress connection SVG path |
| `UserSelection` | Pure renderer for selection rectangle (29 lines, zero logic) |
| `StoreUpdater` | Renderless — syncs React props into Zustand store (controlled component bridge) |
| `BatchProvider` | Context provider for batching `setNodes`/`setEdges` calls |
| `SelectionListener` | Renderless — fires `onSelectionChange` callbacks |

**Distinction**: Containers compose structure and wire up infrastructure. Components render individual entities and handle entity-specific concerns.

### The Renderer/Wrapper Split

The core performance optimization. For both nodes and edges:

1. **Renderer** subscribes to the minimum: just visible entity IDs (a string array compared with `shallow`)
2. **Wrapper** subscribes to its own entity's data from a lookup Map
3. Dragging one node only re-renders that single Wrapper, not the Renderer

```ts
// NodeRenderer — subscribes only to visible IDs
const nodeIds = useVisibleNodeIds(onlyRenderVisibleElements);
// renders: nodeIds.map(id => <NodeWrapper key={id} id={id} />)

// NodeWrapper — subscribes only to its own node
const { node, internals } = useStore(s => ({
  node: s.nodeLookup.get(id)!,
  internals: s.nodeLookup.get(id)!.internals,
}), shallow);
```

### StoreUpdater — Controlled/Uncontrolled Bridge

A renderless component that syncs React props into Zustand. Runs a `useEffect` comparing each tracked prop against previous values, dispatches to dedicated store setters. This means the store is always the single source of truth whether the user manages state externally or lets the library manage it internally.

---

## Complete Data Flow: Node Drag Example

Shows all layers working together:

```
1. Mouse event on node DOM
   └─> d3-drag handler in XYDrag (system package)
       ├─> getStoreItems() reads current state
       ├─> calculateNodePosition() computes position (system fn)
       ├─> snapPosition() applies grid snap (system fn)
       └─> calls back: updateNodePositions(dragItems)

2. Store action updateNodePositions (store)
   ├─> generates NodeChange[] objects
   ├─> runs middleware chain (onNodesChangeMiddlewareMap)
   └─> triggerNodeChanges(changes)
       ├─> uncontrolled: applyNodeChanges() + setNodes()
       └─> controlled: onNodesChange?.(changes) -> user code

3. setNodes() in store
   ├─> adoptUserNodes() computes internals (system fn)
   └─> set({ nodes }) triggers Zustand subscribers

4. NodeWrapper re-renders (component)
   ├─> selector reads nodeLookup.get(id) -> updated position
   └─> renders <div style={{ transform: translate(...) }}>
```

---

## Key Design Decisions Summary

| Decision | xyflow's Choice |
|----------|----------------|
| Store count | 1 monolithic store per instance |
| Creation API | `createWithEqualityFn` from `zustand/traditional` |
| Middleware | None |
| State/actions types | Separate interfaces, merged into union type |
| Provider | React Context holds store instance; factory creates it |
| Consumption | `useStore(selector, eq)` for reactive, `useStoreApi()` for imperative |
| Re-render optimization | `shallow`, custom equality fns, component splitting |
| Business logic | Pure functions in system package, store actions compose them |
| Multi-instance | Yes, via Context scoping |
| Prop sync | `StoreUpdater` renderless component |
| Batch updates | Separate `BatchProvider` with layout effect queue |
| Event handlers | Stored as state fields in Zustand, set via `StoreUpdater` |
| Interaction handling | System package controllers (d3-based), React hooks manage lifecycle |

---

## Principles to Apply

1. **Pure logic in a separate layer** — algorithms and computations should be framework-free functions that receive state as args and return results
2. **Store as orchestrator** — actions compose pure functions and write results, not contain algorithms
3. **Hooks as glue** — manage controller lifecycles, provide typed store access, orchestrate side-effects
4. **Components as thin renderers** — subscribe to narrow slices, delegate logic to hooks, render DOM
5. **Selector discipline** — module-level selectors, `shallow` equality, `useCallback` for prop-dependent selectors, computation inside selectors when possible
6. **Renderer/Wrapper split** — parent subscribes to IDs, children subscribe to individual entities
7. **Context-based store distribution** — enables multi-instance support and external store access
8. **Controlled/uncontrolled bridge** — a renderless `StoreUpdater` syncs props to store, making the store always the source of truth
