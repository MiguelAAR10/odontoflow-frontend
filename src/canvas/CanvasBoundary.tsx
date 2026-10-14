"use client";
import { Component, type ReactNode } from "react";

export class CanvasBoundary extends Component<{ children: ReactNode; onList: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="canvas-unavailable" role="alert">
      <p>El lienzo no pudo cargar. Puedes revisar las mismas tarjetas en la lista.</p>
      <button type="button" onClick={this.props.onList}>Ver lista</button>
    </div>;
    return this.props.children;
  }
}
