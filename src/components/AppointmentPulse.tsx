"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import styles from "./AppointmentPulse.module.css";

export type AppointmentPulseDay = {
  day: string;
  label: string;
  attended: number;
  upcoming: number;
  missed: number;
  cancelled: number;
};

const series = [
  { key: "attended", label: "Con visita", color: "#176A63" },
  { key: "upcoming", label: "Por atender", color: "#8FB8B1" },
  { key: "missed", label: "No-show", color: "#B77969" },
  { key: "cancelled", label: "Canceladas", color: "#A7AFB3" },
] as const;

export function AppointmentPulse({
  title,
  detail,
  days,
  visibleSeries = series.map((item) => item.key),
  size = "compact",
}: {
  title: string;
  detail: string;
  days: AppointmentPulseDay[];
  visibleSeries?: Array<(typeof series)[number]["key"]>;
  size?: "compact" | "large";
}) {
  const activeSeries = series.filter((item) => visibleSeries.includes(item.key));
  const count = days.reduce((total, day) => total + activeSeries.reduce((sum, item) => sum + day[item.key], 0), 0);
  const maxDay = Math.max(1, ...days.map((day) => activeSeries.reduce((sum, item) => sum + day[item.key], 0)));

  return <section className={`${styles.panel} ${size === "large" ? styles.panelLarge : ""}`} aria-label={title}>
    <header className={styles.heading}>
      <div><h2>{title}</h2><p>{detail}</p></div>
      <span>{count} {count === 1 ? "cita" : "citas"}</span>
    </header>
    {count ? <>
      <div className={`${styles.chart} ${size === "large" ? styles.chartLarge : ""}`} role="img" aria-label={`${title}. ${days.map((day) => `${day.label}: ${activeSeries.map((item) => `${day[item.key]} ${item.label.toLowerCase()}`).join(", ")}`).join(". ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={days} margin={{ top: 8, right: 8, left: -22, bottom: 0 }} barCategoryGap="34%">
            <CartesianGrid vertical={false} stroke="#E7EBEF" strokeDasharray="3 5" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#65706F", fontSize: 11 }} />
            <YAxis allowDecimals={false} domain={[0, Math.max(2, maxDay + 1)]} tickLine={false} axisLine={false} tick={{ fill: "#65706F", fontSize: 10 }} />
            <Tooltip
              cursor={{ fill: "#F3F7F6" }}
              formatter={(value, name) => [Number(value ?? 0), series.find((item) => item.key === name)?.label ?? name]}
              labelFormatter={(_, rows) => rows[0]?.payload?.day ?? ""}
            />
            {activeSeries.map((item) => <Bar key={item.key} dataKey={item.key} name={item.key} stackId="appointments" fill={item.color} radius={item.key === activeSeries.at(-1)?.key ? [3, 3, 0, 0] : 0} maxBarSize={38} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.legend} aria-hidden="true">{activeSeries.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>
      <details className={styles.dataTable}>
        <summary>Ver datos</summary>
        <table><thead><tr><th>Día</th>{activeSeries.map((item) => <th key={item.key}>{item.label}</th>)}</tr></thead><tbody>{days.map((day) => <tr key={day.day}><th>{day.label}</th>{activeSeries.map((item) => <td key={item.key}>{day[item.key]}</td>)}</tr>)}</tbody></table>
      </details>
    </> : <div className={styles.empty}>Sin citas en este periodo</div>}
  </section>;
}
