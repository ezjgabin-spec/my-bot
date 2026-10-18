"use client";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useId } from "react";
import { useMotion } from "./workspace";
import { useAppearance } from "./appearance-provider";
import { accentFor, appearanceColors } from "@/lib/appearance";
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
  const animate = useMotion();
  const { appearance } = useAppearance();
  const accent = accentFor(appearance);
  const palette = appearanceColors(appearance);
  const gradientId = useId().replaceAll(":", "");
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
        <ComposedChart
          data={data}
          margin={{ top: 15, right: 18, left: -22, bottom: 5 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.3} />
              <stop offset="100%" stopColor="#42e8df" stopOpacity={0} />
            </linearGradient>
          </defs>
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
                isAnimationActive={animate}
                name="Predicted grade"
                type="monotone"
                dataKey="predicted"
                stroke={accent}
                strokeWidth={2.5}
                dot={{ r: 4 }}
              />
              <Line
                isAnimationActive={animate}
                name="Actual grade"
                type="monotone"
                dataKey="actual"
                stroke={palette[1]}
                strokeWidth={2.5}
                dot={{ r: 4 }}
              />
            </>
          ) : (
            <Area
              isAnimationActive={animate}
              animationDuration={1100}
              name="Practice score"
              type="monotone"
              dataKey="practice"
              stroke={accent}
              fill={`url(#${gradientId})`}
              strokeWidth={3}
              dot={{ r: 4, fill: accent, stroke: "#07131d", strokeWidth: 2 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
