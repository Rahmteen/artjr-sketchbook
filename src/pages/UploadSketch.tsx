import { useState, useRef } from 'react';
import { useNavigate, useSearchParams, Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, Upload } from 'lucide-react';
import { uploadApi } from '../api/client';
import { useSketchStore } from '../stores/sketchStore';
import { useGateStore } from '../stores/gateStore';
import { EASE_OUT_EXPO } from '../components/ui/Motion';

export function UploadSketch() {
  const checkValid = useGateStore((s) => s.checkValid);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const replaceId = searchParams.get('replace');
  const versionOfId = searchParams.get('version');
  const { addSketch, updateSketch } = useSketchStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bpm, setBpm] = useState('');
  const [key, setKey] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragover, setDragover] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReplace = Boolean(replaceId);
  const isNewVersion = Boolean(versionOfId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError('Please add an audio file'); return; }
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title || file.name);
    if (description) formData.append('description', description);
    if (bpm) formData.append('bpm', bpm);
    if (key) formData.append('key', key);
    try {
      if (isReplace && replaceId) {
        const updated = await uploadApi.replaceSketch(replaceId, formData);
        updateSketch(replaceId, updated);
        navigate(`/sketches/${replaceId}`);
        return;
      }
      if (isNewVersion && versionOfId) formData.append('parentSketchId', versionOfId);
      const sketch = await uploadApi.sketch(formData);
      addSketch(sketch);
      navigate(`/sketches/${sketch.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragover(false);
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith('audio/')) setFile(f);
  };

  const modalTitle = isReplace ? 'Replace audio' : isNewVersion ? 'New version' : 'New sketch';

  if (!checkValid()) {
    return <Navigate to="/" replace />;
  }

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm z-[100]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      onClick={() => navigate(-1)}
    >
      <motion.div
        className="modal w-full max-w-[480px] max-h-[90vh] overflow-y-auto p-8"
        role="dialog"
        aria-labelledby="upload-modal-title"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: EASE_OUT_EXPO, delay: 0.04 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <Link
            to="/sketches"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-secondary bg-transparent transition-colors hover:text-text hover:bg-hover no-underline"
            aria-label="Back to sketches"
          >
            <ChevronLeft size={18} />
          </Link>
          <h1 id="upload-modal-title" className="m-0 text-lg font-bold text-text">
            {modalTitle}
          </h1>
        </div>

        {!isReplace && !isNewVersion && (
          <p className="m-0 mb-6 text-sm text-secondary leading-relaxed">
            Upload an audio file to add a new sketch
          </p>
        )}

        {error && <p className="text-danger text-sm mb-4">{error}</p>}

        <form onSubmit={submit} className="space-y-5">
          <div
            className={`flex flex-col items-center justify-center gap-3 min-h-[160px] p-8 rounded-md border-2 border-dashed cursor-pointer transition-all ${
              dragover ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:border-accent/50 hover:bg-accent/[0.075]'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
            onDragLeave={() => setDragover(false)}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              aria-label="Add audio file"
              className="sr-only"
            />
            <Upload size={24} className="text-tertiary" />
            <span className="text-sm font-medium text-text">
              {file ? file.name : 'Drop audio file here'}
            </span>
            <span className="text-xs text-tertiary">MP3, WAV, M4A, FLAC or other audio files</span>
          </div>

          <div>
            <label className="block mb-1.5 text-xs font-medium text-tertiary">Title</label>
            <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sketch title" />
          </div>

          <div>
            <label className="block mb-1.5 text-xs font-medium text-tertiary">
              Description <span className="font-normal text-tertiary/70">Optional</span>
            </label>
            <textarea
              className="form-input min-h-[80px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes, version note, etc."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block mb-1.5 text-xs font-medium text-tertiary">BPM</label>
              <input type="number" className="form-input" value={bpm} onChange={(e) => setBpm(e.target.value)} placeholder="120" />
            </div>
            <div>
              <label className="block mb-1.5 text-xs font-medium text-tertiary">Key</label>
              <input className="form-input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Cm" />
            </div>
          </div>

          <button type="submit" className="btn btn-primary w-full py-3" disabled={loading}>
            {loading ? 'Uploading...' : isReplace ? 'Replace' : isNewVersion ? 'Create version' : 'Continue'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
