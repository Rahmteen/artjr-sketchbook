import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Gate } from './pages/Gate';
import { AppLayout } from './pages/AppLayout';
import { Home } from './pages/Home';
import { Timeline } from './pages/Timeline';
import { Collections } from './pages/Collections';
import { CollectionDetail } from './pages/CollectionDetail';
import { Sketches } from './pages/Sketches';
import { SketchDetail } from './pages/SketchDetail';
import { UploadSketch } from './pages/UploadSketch';
import { ShareView } from './pages/ShareView';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Gate />} />
        <Route element={<AppLayout />}>
          <Route path="home" element={<Home />} />
          <Route path="timeline" element={<Timeline />} />
          <Route path="collections" element={<Collections />} />
          <Route path="collections/:id" element={<CollectionDetail />} />
          <Route path="sketches" element={<Sketches />} />
          <Route path="sketches/:id" element={<SketchDetail />} />
        </Route>
        <Route path="sketches/upload" element={<UploadSketch />} />
        <Route path="s/:token" element={<ShareView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
