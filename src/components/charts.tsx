"use client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
export function PerformanceChart({
  data,
  actual = false,
}: {
  data: {
    name: string;
    practice?: number;
    predicted?: number;
    actual?: number;
  }[];
  actual?: boolean;
}) {
  return (
    <div
      className="chart"
      role="img"
      aria-label={
        actual
          ? "Predicted and actual school grades over time; values are also listed in the table below"
          : "Practice scores over time; values are also listed in recent practice sessions"
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 15, right: 18, left: -22, bottom: 5 }}
        >
          <CartesianGrid
            stroke="#263049"
            strokeDasharray="4 6"
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tick={{ fill: "#9aa8c2", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "#9aa8c2", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#151e32",
              border: "1px solid #35415f",
              borderRadius: 12,
              color: "#f4f7ff",
            }}
            labelStyle={{ color: "#cbd5e1" }}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12, paddingTop: 15 }}
          />
          {actual ? (
            <>
              <Line
                name="Predicted grade"
                type="monotone"
                dataKey="predicted"
                stroke="#a99bff"
                strokeWidth={2.5}
                dot={{ r: 4 }}
              />
              <Line
                name="Actual grade"
                type="monotone"
                dataKey="actual"
                stroke="#55d9b0"
                strokeWidth={2.5}
                dot={{ r: 4 }}
              />
            </>
          ) : (
            <Line
              name="Practice score"
              type="monotone"
              dataKey="practice"
              stroke="#9a8bff"
              strokeWidth={3}
              dot={{ r: 4, fill: "#9a8bff" }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
