declare module 'd3-force-3d' {
  export function forceCollide<NodeType = unknown>(): {
    radius(value: number | ((node: NodeType) => number)): {
      iterations(value: number): unknown
    }
    iterations(value: number): unknown
  }
}
