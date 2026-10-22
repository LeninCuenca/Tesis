import { Component, type ReactNode } from "react";

export class AnalysisBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="panel prediction-error" role="alert">
          <div>
            <h2>No se pudo abrir el análisis</h2>
            <p>
              Los archivos de la aplicación pueden haberse actualizado. Recarga
              para obtener la versión actual.
            </p>
          </div>
          <button
            className="outline-button"
            onClick={() => window.location.reload()}
          >
            Recargar aplicación
          </button>
        </div>
      );
    return this.props.children;
  }
}
