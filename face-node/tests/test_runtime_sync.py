import threading
import time
import unittest
from unittest.mock import Mock, patch

import numpy as np
import requests

from backend import Backend
from config import Config, MODEL
from matching import TemplateCache
from node import RuntimeSync, run


class RuntimeSyncTests(unittest.TestCase):
    def test_disconnect_discards_snapshot_and_reconnect_loads_a_new_one(self):
        sync = RuntimeSync(Config())
        api = Mock()
        api.sync.side_effect = lambda cache, **_: cache.replace({'model': MODEL, 'templates': []})
        sync.sync_once(api)
        previous, ready = sync.snapshot()
        self.assertTrue(ready); self.assertTrue(previous.valid)
        api.sync.side_effect = requests.ConnectionError('offline')
        sync.sync_once(api)
        cache, ready = sync.snapshot()
        self.assertFalse(ready); self.assertFalse(cache.valid)
        self.assertIsNot(previous, cache)
        api.sync.side_effect = lambda cache, **_: cache.replace({'model': MODEL, 'templates': []})
        sync.sync_once(api)
        self.assertTrue(sync.snapshot()[0].valid)

    def test_http_sync_cannot_load_templates_when_suspended_or_door_not_ready(self):
        for blocked in ('enabled', 'ready', 'doorOnline', 'faceEnabled'):
            with self.subTest(blocked=blocked):
                api = Backend(Config(event_transport='http'))
                state = dict(enabled=True, ready=True, doorOnline=True, faceEnabled=True)
                state[blocked] = False
                api.call = Mock(side_effect=[Mock(), Mock(json=Mock(return_value=state))])
                cache = TemplateCache(); cache.replace({'model': MODEL, 'templates': []})
                api.sync(cache)
                self.assertFalse(cache.valid)
                self.assertEqual(2, api.call.call_count)
                api.session.close()

    def test_health_reports_camera_loss_and_stale_frames_independently_of_connection(self):
        camera = Mock(); camera.frame_age.return_value = None
        sync = RuntimeSync(Config(), camera)
        self.assertEqual('NO_SIGNAL', sync.health()['cameraStatus'])
        camera.frame_age.return_value = .1
        self.assertEqual('READY', sync.health()['cameraStatus'])
        self.assertEqual('WAITING', sync.health()['recognitionStatus'])
        camera.frame_age.return_value = 100
        self.assertEqual('NO_SIGNAL', sync.health()['cameraStatus'])

    def test_preview_keeps_rendering_while_backend_request_is_blocked(self):
        entered, release = threading.Event(), threading.Event()
        api = Mock()
        def blocked(*args, **kwargs):
            entered.set(); release.wait(5)
            raise requests.ConnectionError('offline')
        api.sync.side_effect = blocked
        camera = Mock(); camera.frame_age.return_value = .01
        camera.read.side_effect = [(n, time.monotonic(), np.zeros((20, 20, 3), dtype=np.uint8)) for n in range(3)]
        cv2 = Mock(); cv2.waitKey.side_effect = lambda _: (entered.wait(2) and ord('q')) if cv2.imshow.call_count == 3 else 0
        engine = Mock()
        config = Config(device_uid='FACE-test', device_secret='x' * 32, event_transport='http')
        try:
            with patch.dict('sys.modules', {'cv2': cv2}), patch('node.LatestCamera', return_value=camera), patch('node.Backend', return_value=api):
                self.assertTrue(run(config, engine, camera=True))
            self.assertTrue(entered.is_set())
            self.assertFalse(release.is_set())
            self.assertEqual(3, cv2.imshow.call_count)
            engine.analyze.assert_not_called()
            camera.close.assert_called_once()
        finally:
            release.set()


if __name__ == '__main__': unittest.main()
