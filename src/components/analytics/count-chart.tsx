"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface CountDatum {
  key: string;
  label: string;
  value: number;
}

interface CountChartProps {
  title: string;
  data: CountDatum[];
  /** Optional per-key bar colours; other bars use the default. */
  colors?: Record<string, string>;
}

const DEFAULT_BAR_COLOR = "#168f95";
const ROW_HEIGHT_PIXELS = 34;

/**
 * Horizontal bar chart of counts. The count axis starts at zero and uses
 * whole numbers. The same data is rendered as a table directly below for
 * screen readers and for anyone who prefers exact figures.
 */
export function CountChart({ title, data, colors = {} }: CountChartProps) {
  const total = data.reduce((sum, datum) => sum + datum.value, 0);
  return (
    <figure>
      <div aria-hidden style={{ height: data.length * ROW_HEIGHT_PIXELS + 40 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
            <CartesianGrid horizontal={false} stroke="#d9e0e8" />
            <XAxis type="number" allowDecimals={false} domain={[0, "dataMax"]} tick={{ fontSize: 12, fill: "#51627a" }} />
            <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 12, fill: "#10233b" }} />
            <Tooltip cursor={{ fill: "#eef3f9" }} formatter={(value) => [String(value), "Incidents"]} />
            <Bar dataKey="value" isAnimationActive={false} radius={[0, 3, 3, 0]}>
              {data.map((datum) => <Cell key={datum.key} fill={colors[datum.key] ?? DEFAULT_BAR_COLOR} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{title}. Total {total}.</figcaption>
      <table className="mt-2 w-full border-collapse text-sm">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            <th scope="col" className="table-header">Group</th>
            <th scope="col" className="table-header text-right">Incidents</th>
            <th scope="col" className="table-header text-right">Share</th>
          </tr>
        </thead>
        <tbody>
          {data.map((datum) => (
            <tr key={datum.key}>
              <th scope="row" className="table-cell text-left font-normal">{datum.label}</th>
              <td className="table-cell text-right tabular-nums">{datum.value}</td>
              <td className="table-cell text-right tabular-nums">{total > 0 ? `${Math.round((datum.value / total) * 100)}%` : "n/a"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
