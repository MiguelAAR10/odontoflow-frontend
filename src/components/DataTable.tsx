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
}

export function DataTable<T>({ columns, rows, rowKey, emptyMessage = "No hay registros para mostrar", className = "" }: DataTableProps<T>) {
  return (
    <div className={`table-scroll ${className}`}>
      <table className="data-table">
        <thead><tr>{columns.map((column) => <th key={column.key} style={{ width: column.width }}>{column.header}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows.map((row) => (
            <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}</tr>
          )) : <tr><td colSpan={columns.length}><div className="empty-state">{emptyMessage}</div></td></tr>}
        </tbody>
      </table>
    </div>
  );
}
