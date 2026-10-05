"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DemoRequest } from "../api";
import styles from "./AppointmentPulse.module.css";

const types = [
  { key: "clinical", label: "Clínica" },
  { key: "administrative", label: "Administrativa" },
  { key: "laboratory", label: "Laboratorio" },
] as const;

export function ClinicalQueuePulse({ requests, size = "compact" }: { requests: DemoRequest[]; size?: "compact" | "large" }) {
  const active = requests.filter((request) => request.status !== "done");
  const data = types.map((type) => {
    const items = active.filter((request) => request.type === type.key);
    return {
      type: type.label,
      open: items.filter((request) => request.status === "open").length,
      inProgress: items.filter((request) => request.status === "in_progress").length,
    };
  }).filter((item) => item.open + item.inProgress > 0);
  const maxType = Math.max(1, ...data.map((item) => item.open + item.inProgress));

  return <section className={`${styles.panel} ${size === "large" ? styles.panelLarge : ""}`} aria-label="Pendientes clínicos">
    <header className={styles.heading}>
      <div><h2>Pendientes clínicos</h2><p>Por tipo y avance · datos demo</p></div>
      <Link href="/solicitudes" aria-label="Ver solicitudes">Abrir <ArrowUpRight size={13} /></Link>
    </header>
    {active.length ? <>
      <div className={`${styles.chart} ${size === "large" ? styles.chartLarge : ""}`} role="img" aria-label={`Pendientes clínicos: ${data.map((item) => `${item.type}, ${item.open} abiertas, ${item.inProgress} en progreso`).join("; ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="35%">
            <CartesianGrid horizontal={false} stroke="#E7EBEF" strokeDasharray="3 5" />
            <XAxis type="number" allowDecimals={false} domain={[0, maxType + 1]} tickLine={false} axisLine={false} tick={{ fill: "#65706F", fontSize: 10 }} />
            <YAxis type="category" dataKey="type" width={104} tickLine={false} axisLine={false} tick={{ fill: "#46514F", fontSize: 10 }} />
            <Tooltip cursor={{ fill: "#F3F7F6" }} formatter={(value, name) => [Number(value ?? 0), name === "open" ? "Abiertas" : "En progreso"]} />
            <Bar dataKey="open" name="open" stackId="requests" fill="#176A63" radius={[0, 0, 0, 0]} maxBarSize={20} />
            <Bar dataKey="inProgress" name="inProgress" stackId="requests" fill="#B98B52" radius={[0, 4, 4, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.legend} aria-hidden="true"><span><i style={{ background: "#176A63" }} />Abiertas</span><span><i style={{ background: "#B98B52" }} />En progreso</span></div>
      <details className={styles.dataTable}>
        <summary>Ver datos</summary>
        <table><thead><tr><th>Tipo</th><th>Abiertas</th><th>En progreso</th></tr></thead><tbody>{data.map((item) => <tr key={item.type}><th>{item.type}</th><td>{item.open}</td><td>{item.inProgress}</td></tr>)}</tbody></table>
      </details>
    </> : <div className={styles.empty}>Sin pendientes clínicos</div>}
  </section>;
}
