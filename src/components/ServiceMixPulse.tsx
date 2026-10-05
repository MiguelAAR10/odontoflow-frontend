"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DemoAppointment } from "../api";
import styles from "./AppointmentPulse.module.css";

export function ServiceMixPulse({ appointments, title, detail, size = "compact" }: {
  appointments: DemoAppointment[];
  title: string;
  detail: string;
  size?: "compact" | "large";
}) {
  const data = appointments.reduce<Array<{ service: string; count: number }>>((items, appointment) => {
    if (appointment.state !== "confirmed") return items;
    const current = items.find((item) => item.service === appointment.serviceName);
    if (current) current.count += 1;
    else items.push({ service: appointment.serviceName, count: 1 });
    return items;
  }, []).sort((left, right) => right.count - left.count || left.service.localeCompare(right.service));
  const maxCount = Math.max(1, ...data.map((item) => item.count));
  const count = data.reduce((sum, item) => sum + item.count, 0);

  return <section className={`${styles.panel} ${size === "large" ? styles.panelLarge : ""}`} aria-label={title}>
    <header className={styles.heading}>
      <div><h2>{title}</h2><p>{detail}</p></div>
      <span>{count} {count === 1 ? "cita" : "citas"}</span>
    </header>
    {count ? <>
      <div className={`${styles.chart} ${size === "large" ? styles.chartLarge : ""}`} role="img" aria-label={`${title}: ${data.map((item) => `${item.service}, ${item.count} ${item.count === 1 ? "cita" : "citas"}`).join("; ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="35%">
            <CartesianGrid horizontal={false} stroke="#E7EBEF" strokeDasharray="3 5" />
            <XAxis type="number" allowDecimals={false} domain={[0, maxCount + 1]} tickLine={false} axisLine={false} tick={{ fill: "#65706F", fontSize: 10 }} />
            <YAxis type="category" dataKey="service" width={120} tickLine={false} axisLine={false} tick={{ fill: "#46514F", fontSize: 10 }} />
            <Tooltip cursor={{ fill: "#F3F7F6" }} formatter={(value) => [Number(value ?? 0), "Citas"]} />
            <Bar dataKey="count" name="Citas" fill="#176A63" radius={[0, 4, 4, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className={styles.dataTable}>
        <summary>Ver datos</summary>
        <table><thead><tr><th>Servicio</th><th>Citas</th></tr></thead><tbody>{data.map((item) => <tr key={item.service}><th>{item.service}</th><td>{item.count}</td></tr>)}</tbody></table>
      </details>
    </> : <div className={styles.empty}>Sin citas confirmadas</div>}
  </section>;
}
