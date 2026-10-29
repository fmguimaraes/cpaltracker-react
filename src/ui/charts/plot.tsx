import createPlotlyComponent from 'react-plotly.js/factory'
import Plotly from 'plotly.js-dist-min'
import type { PlotParams } from 'react-plotly.js'
import { chartConfig } from './use-chart-theme'

const PlotlyChart = createPlotlyComponent(Plotly)

/** Responsive Plotly wrapper with the shared config; role=img + label for a11y. */
export function Plot({ label, className, ...props }: PlotParams & { label: string }) {
  return (
    <div role="img" aria-label={label} className={className ?? 'h-64 w-full'}>
      <PlotlyChart {...props} config={chartConfig} useResizeHandler style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
