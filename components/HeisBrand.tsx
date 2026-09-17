/** The approved integrated H wordmark. Choose the actual surface theme explicitly. */
export default function HeisBrand({ theme = 'dark', symbol = false, height = 28, className = '' }: {
  theme?: 'light' | 'dark'; symbol?: boolean; height?: number; className?: string;
}) {
  return <img
    src={`/brand/heis-${symbol ? 'symbol' : 'wordmark'}-${theme}.svg`}
    alt="Heis"
    className={`heis-brand ${className}`}
    height={height}
    style={{ height, width: 'auto', display: 'block', flexShrink: 0 }}
    draggable={false}
  />;
}
