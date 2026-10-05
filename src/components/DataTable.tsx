import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
  className?: string;
  helpHref?: (row: T) => string;
  helpLabel?: (row: T) => string;
  helpLocation?: (row: T) => string;
}

export function DataTable<T>({ columns, rows, rowKey, emptyMessage = "No hay registros para mostrar", className = "", helpHref, helpLabel, helpLocation }: DataTableProps<T>) {
  return (
    <div className={`table-scroll ${className}`}>
      <table className="data-table">
        <thead><tr>{columns.map((column) => <th key={column.key} scope="col" style={{ width: column.width }}>{column.header}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows.map((row) => (
          <tr key={rowKey(row)} data-help-id={String(rowKey(row))} data-help-href={helpHref?.(row)} data-help-label={helpLabel?.(row)} data-help-location={helpLocation?.(row)}>{columns.map((column) => <td key={column.key} data-label={column.header}>{column.render(row)}</td>)}</tr>
          )) : <tr><td colSpan={columns.length}><div className="empty-state">{emptyMessage}</div></td></tr>}
        </tbody>
      </table>
    </div>
  );
}
