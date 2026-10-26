import { useEffect } from 'react';
import { extractEmbedding, type FaceEngine } from '../services/face/faceMath';
import { readPixels } from '../services/face/imagePixels';
import { loadFaceSessions } from '../services/face/runtime.web';

export function FaceProcessor({ onReady, onError }: { onReady: (engine: FaceEngine) => void; onError: (message: string) => void }) {
  useEffect(() => {
    let active = true;
    void loadFaceSessions().then(sessions => {
      if (active) onReady({ extract: async image => extractEmbedding(await readPixels(image), sessions) });
    }).catch(error => { if (active) onError(error instanceof Error ? error.message : 'Không tải được model.'); });
    return () => { active = false; };
  }, [onReady, onError]);
  return null;
}
