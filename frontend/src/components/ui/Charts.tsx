import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { Card, CardHeader } from './Card'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface TrendData {
  date: string
  value: number
}

interface MiniChartProps {
  data: TrendData[]
  color?: string
  height?: number
}

export function MiniLineChart({ data, color = '#4F46E5', height = 60 }: MiniChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#gradient-${color})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

interface TrendChartProps {
  title: string
  data: TrendData[]
  color?: string
  formatValue?: (value: number) => string
}

export function TrendChart({ title, data, color = '#4F46E5', formatValue }: TrendChartProps) {
  const isPositive = data.length > 1 && data[data.length - 1].value >= data[0].value
  
  return (
    <Card>
      <CardHeader
        title={title}
        icon={
          isPositive ? (
            <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
          )
        }
      />
      <div className="p-6">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="date" 
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
            />
            <YAxis 
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              tickFormatter={formatValue}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '8px 12px',
              }}
              formatter={(value: number) => formatValue ? formatValue(value) : value}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={{ fill: color, r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

interface BarChartProps {
  title: string
  data: { name: string; value: number }[]
  color?: string
  formatValue?: (value: number) => string
}

export function BarChartComponent({ title, data, color = '#4F46E5', formatValue }: BarChartProps) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="p-6">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="name" 
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
            />
            <YAxis 
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              tickFormatter={formatValue}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '8px 12px',
              }}
              formatter={(value: number) => formatValue ? formatValue(value) : value}
            />
            <Bar dataKey="value" fill={color} radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

