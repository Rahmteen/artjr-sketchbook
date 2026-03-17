import type { ApiSketch } from '../../api/client';
import { FileCard } from './FileCard';

interface SketchCardProps {
  sketch: ApiSketch;
  className?: string;
}

export function SketchCard({ sketch }: SketchCardProps) {
  return <FileCard to={`/sketches/${sketch.id}`} icon="audio" label={sketch.title} />;
}
