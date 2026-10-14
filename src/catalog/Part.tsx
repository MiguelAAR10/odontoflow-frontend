"use client";

import { useId } from "react";
import type { z } from "zod";
import type { CellSchema, PartSchema } from "./schema";
import { Layers, Layer } from "./Layers";
import { formatMoney } from "./format";

export type PartProps = z.infer<typeof PartSchema>;
function cell(value: z.infer<typeof CellSchema>) {
  return typeof value === "object" ? formatMoney(value.amount_cents) : value;
}

export function Part(props: PartProps) {
  const titleId = useId();
  const empty = props.kind === "table" ? !props.rows.length : !props.items.length;
  return <Layers className="catalog-part" labelledBy={titleId}>
    <Layer stage="title"><h3 id={titleId}>{props.title}</h3></Layer>
    <Layer stage="data">{empty ? <p className="catalog-muted">Sin datos para mostrar.</p> : props.kind === "table"
      ? <div className="catalog-table-scroll" role="region" aria-labelledby={titleId} tabIndex={0}><table><caption className="catalog-sr">{props.title}</caption><thead><tr>{props.columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
        <tbody>{props.rows.map((row, index) => <tr key={index}>{props.columns.map(column => <td key={column.key}>{cell(row[column.key]!)}</td>)}</tr>)}</tbody></table></div>
      : props.kind === "list" ? <ul className="catalog-list">{props.items.map((item, index) => <li key={index}><span>{item.label}</span>{item.value !== undefined ? <span className="catalog-value">{cell(item.value)}</span> : null}</li>)}</ul>
      : <dl className="catalog-kpis">{props.items.map((item, index) => <div key={index}><dt>{item.label}</dt><dd>{cell(item.value)}</dd></div>)}</dl>}
    </Layer>
  </Layers>;
}
