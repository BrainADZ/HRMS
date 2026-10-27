import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCw } from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Button, Loading } from './ui.jsx';

GlobalWorkerOptions.workerSrc = workerUrl;

export default function ExpensePdfPreview({ url }) {
  const [pdf, setPdf] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [width, setWidth] = useState(600);
  const [error, setError] = useState('');
  const [rendered, setRendered] = useState(false);
  const canvas = useRef(null);
  const area = useRef(null);
  useEffect(() => {
    const task = getDocument({
      url,
      withCredentials: true,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    let alive = true;
    task.promise
      .then((doc) => {
        if (alive) setPdf(doc);
      })
      .catch(() => {
        if (alive)
          setError('This PDF could not be previewed. It may be damaged or password protected.');
      });
    return () => {
      alive = false;
      task.destroy();
    };
  }, [url]);
  useEffect(() => {
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(area.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf) return;
    let alive = true,
      task;
    setRendered(false);
    pdf
      .getPage(pageNumber)
      .then((page) => {
        if (!alive) return;
        const initial = page.getViewport({ scale: 1, rotation });
        const viewport = page.getViewport({
          scale: Math.max(0.1, (width - 40) / initial.width) * zoom,
          rotation,
        });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const el = canvas.current;
        el.width = Math.floor(viewport.width * outputScale);
        el.height = Math.floor(viewport.height * outputScale);
        el.style.width = Math.floor(viewport.width) + 'px';
        el.style.height = Math.floor(viewport.height) + 'px';
        task = page.render({
          canvasContext: el.getContext('2d'),
          viewport,
          transform: [outputScale, 0, 0, outputScale, 0, 0],
        });
        return task.promise;
      })
      .then(() => {
        if (alive) setRendered(true);
      })
      .catch((e) => {
        if (alive && e.name !== 'RenderingCancelledException')
          setError('This PDF page could not be displayed.');
      });
    return () => {
      alive = false;
      task?.cancel();
    };
  }, [pdf, pageNumber, zoom, rotation, width]);
  return (
    <div className="expense-pdf-viewer">
      <div className="expense-pdf-toolbar">
        <Button
          aria-label="Previous PDF page"
          disabled={!pdf || pageNumber <= 1}
          onClick={() => setPageNumber((p) => p - 1)}
        >
          <ChevronLeft size={16} />
        </Button>
        <span>
          Page {pageNumber} / {pdf?.numPages || '…'}
        </span>
        <Button
          aria-label="Next PDF page"
          disabled={!pdf || pageNumber >= pdf.numPages}
          onClick={() => setPageNumber((p) => p + 1)}
        >
          <ChevronRight size={16} />
        </Button>
        <span className="expense-pdf-toolbar-divider" />
        <Button
          aria-label="Zoom out"
          disabled={zoom <= 0.5}
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
        >
          <Minus size={16} />
        </Button>
        <span>{Math.round(zoom * 100)}%</span>
        <Button
          aria-label="Zoom in"
          disabled={zoom >= 2.5}
          onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
        >
          <Plus size={16} />
        </Button>
        <Button aria-label="Rotate PDF" onClick={() => setRotation((r) => (r + 90) % 360)}>
          <RotateCw size={16} />
        </Button>
      </div>
      <div className="expense-pdf-pages" ref={area}>
        {error ? (
          <p role="alert" className="expense-pdf-error">
            {error}
          </p>
        ) : (
          <>
            {!pdf && <Loading text="Loading PDF…" />}
            <canvas
              ref={canvas}
              className="expense-pdf-canvas"
              data-rendered={rendered}
              aria-label={'PDF page ' + pageNumber}
            />
          </>
        )}
      </div>
    </div>
  );
}
