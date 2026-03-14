import { Link } from 'react-router-dom';
import {
  Upload,
  Trash2,
  FolderPlus,
  ArrowRightLeft,
  Pencil,
  Tag,
  RefreshCw,
  Layers,
} from 'lucide-react';
import type { ApiActivity } from '../api/client';

const ACTION_ICONS: Record<string, React.ElementType> = {
  upload: Upload,
  replace: RefreshCw,
  delete: Trash2,
  create: FolderPlus,
  update: Pencil,
  rename: Pencil,
  sketches_added: Layers,
  sketch_collection: ArrowRightLeft,
  tier_move: ArrowRightLeft,
  tags_updated: Tag,
};

function EntityLink({
  exists,
  entityType,
  entityId,
  label,
}: {
  exists: boolean;
  entityType: string;
  entityId: string | null;
  label: string;
}) {
  if (!entityId || !exists) {
    return <span className="text-tertiary line-through">{label}</span>;
  }
  const to =
    entityType === 'sketch'
      ? `/sketches/${entityId}`
      : entityType === 'collection'
        ? `/collections/${entityId}`
        : null;
  if (!to) return <span className="text-text">{label}</span>;
  return (
    <Link to={to} className="text-accent no-underline prose-link font-medium">
      {label}
    </Link>
  );
}

export function ActivityRow({ activity }: { activity: ApiActivity }) {
  const { type, entityType, entityId, payload, exists } = activity;
  const p = payload ?? {};
  const Icon = ACTION_ICONS[type] ?? Pencil;

  const renderContent = () => {
    switch (type) {
      case 'upload':
        if (entityType === 'sketch') {
          return (
            <>
              Uploaded sketch{' '}
              <EntityLink exists={exists} entityType="sketch" entityId={entityId} label={String(p.sketchTitle ?? 'Untitled')} />
            </>
          );
        }
        return (
          <>
            Uploaded reference{' '}
            <EntityLink exists={exists} entityType="reference_audio" entityId={entityId} label={String(p.label ?? 'audio')} />
          </>
        );

      case 'replace':
        return (
          <>
            Replaced{' '}
            <EntityLink exists={exists} entityType="sketch" entityId={entityId} label={String(p.sketchTitle ?? 'sketch')} />
          </>
        );

      case 'delete':
        if (entityType === 'sketch') {
          return (
            <>
              Deleted sketch <span className="text-tertiary line-through">{String(p.sketchTitle ?? '')}</span>
            </>
          );
        }
        if (entityType === 'collection') {
          return (
            <>
              Deleted collection <span className="text-tertiary line-through">{String(p.collectionName ?? '')}</span>
            </>
          );
        }
        return <>Deleted reference</>;

      case 'create':
        if (entityType === 'collection') {
          return (
            <>
              Created collection{' '}
              <EntityLink exists={exists} entityType="collection" entityId={entityId} label={String(p.collectionName ?? '')} />
            </>
          );
        }
        return <>Created {entityType}</>;

      case 'update':
        if (entityType === 'collection') {
          return (
            <>
              Updated collection{' '}
              <EntityLink exists={exists} entityType="collection" entityId={entityId} label={String(p.collectionName ?? '')} />
            </>
          );
        }
        return <>Updated {entityType}</>;

      case 'rename':
        if (entityType === 'sketch') {
          return (
            <>
              Renamed sketch to{' '}
              <EntityLink exists={exists} entityType="sketch" entityId={entityId} label={String(p.newTitle ?? p.sketchTitle ?? '')} />
            </>
          );
        }
        if (entityType === 'collection') {
          return (
            <>
              Renamed collection to{' '}
              <EntityLink exists={exists} entityType="collection" entityId={entityId} label={String(p.newName ?? p.collectionName ?? '')} />
            </>
          );
        }
        return <>Renamed {entityType}</>;

      case 'sketches_added': {
        let sketchLinks: React.ReactNode = null;
        if (p.sketches) {
          try {
            const arr = JSON.parse(String(p.sketches)) as { id: string; title: string }[];
            sketchLinks = arr.map((s, i) => (
              <span key={s.id}>
                {i > 0 && ', '}
                <Link to={`/sketches/${s.id}`} className="text-accent no-underline prose-link font-medium">
                  {s.title}
                </Link>
              </span>
            ));
          } catch {
            /* fallback below */
          }
        }
        return (
          <>
            Added {sketchLinks ?? `${p.count ?? '?'} sketch${Number(p.count) === 1 ? '' : 'es'}`} to{' '}
            <EntityLink exists={exists} entityType="collection" entityId={entityId} label={String(p.collectionName ?? 'collection')} />
          </>
        );
      }

      case 'tier_move':
        return (
          <>
            Moved{' '}
            <EntityLink exists={exists} entityType="sketch" entityId={entityId} label={String(p.sketchTitle ?? '')} />
            {' '}to tier {String(p.toTierLabel ?? 'Unassigned')} in{' '}
            <EntityLink
              exists={!!(p.collectionId)}
              entityType="collection"
              entityId={String(p.collectionId ?? '')}
              label={String(p.collectionName ?? 'collection')}
            />
          </>
        );

      case 'sketch_collection':
        return (
          <>
            Moved{' '}
            <EntityLink exists={exists} entityType="sketch" entityId={entityId} label={String(p.sketchTitle ?? '')} />
            {' '}to{' '}
            <span className="text-text">{String(p.collectionName ?? 'collection')}</span>
          </>
        );

      case 'tags_updated':
        return (
          <>
            Updated tags on{' '}
            <EntityLink exists={exists} entityType="sketch" entityId={entityId} label={String(p.sketchTitle ?? '')} />
          </>
        );

      default:
        return <>{type} {entityType}</>;
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="w-7 h-7 rounded-md bg-surface flex items-center justify-center shrink-0">
        <Icon size={14} className="text-tertiary" />
      </div>
      <span className="text-sm text-text leading-relaxed">{renderContent()}</span>
    </div>
  );
}
