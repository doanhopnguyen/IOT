import unittest
from unittest.mock import Mock, patch
import threading
import numpy as np

from backend import Backend
from config import Config, MODEL
from matching import Match, RecognitionGate, TemplateCache, normalized
from node import LatestCamera


def vector(axis=0):
    result = np.zeros(512)
    result[axis] = 1
    return result


class RecognitionTests(unittest.TestCase):
    def test_unknown_and_ambiguous_people_are_not_forced_into_a_match(self):
        cache = TemplateCache()
        cache.replace({"model": MODEL, "templates": [
            {"credentialId": 1, "accountId": 11, "embedding": vector().tolist()},
            {"credentialId": 2, "accountId": 12, "embedding": normalized(vector() + vector(1) * .1).tolist()},
        ]})
        self.assertIsNone(cache.match(vector(2), .5, .08))
        self.assertIsNone(cache.match(vector(), .5, .08))

    def test_same_account_samples_do_not_create_false_runner_up(self):
        cache = TemplateCache()
        cache.replace({"model": MODEL, "templates": [
            {"credentialId": 1, "accountId": 11, "embedding": vector().tolist()},
            {"credentialId": 2, "accountId": 11, "embedding": vector().tolist()},
        ]})
        self.assertEqual(11, cache.match(vector(), .5, .08).account_id)

    def test_snapshot_removal_immediately_removes_cached_person(self):
        cache = TemplateCache()
        cache.replace({"model": MODEL, "templates": [
            {"credentialId": 1, "accountId": 11, "embedding": vector().tolist()}]})
        self.assertIsNotNone(cache.match(vector(), .5, .08))
        cache.replace({"model": MODEL, "templates": []})
        self.assertIsNone(cache.match(vector(), .5, .08))

    def test_backend_failure_clears_previous_snapshot(self):
        cache = TemplateCache()
        cache.replace({"model": MODEL, "templates": []})
        api = Backend(Config())
        api.call = Mock(side_effect=ConnectionError("offline"))
        with self.assertRaises(ConnectionError):
            api.sync(cache)
        self.assertFalse(cache.valid)
        self.assertEqual([], cache.templates)

    def test_invalid_vector_or_model_is_rejected(self):
        for values in ([0] * 512, [1] * 511, [float("nan")] * 512):
            with self.assertRaises(ValueError):
                normalized(values)
        with self.assertRaises(ValueError):
            TemplateCache().replace({"model": "different", "templates": []})

    def test_pad_blocks_even_when_identity_is_stable(self):
        gate = RecognitionGate(2, 10)
        match = Match(1, 11, .9)
        self.assertFalse(gate.observe(match, "SPOOF", True, now=1))
        self.assertFalse(gate.observe(match, "NOT_CHECKED", now=2))
        self.assertFalse(gate.observe(match, "LIVE", now=3))
        self.assertTrue(gate.observe(match, "LIVE", now=4))

    def test_cooldown_and_consecutive_frames_prevent_repeat_open_events(self):
        gate = RecognitionGate(2, 10)
        match = Match(1, 11, .9)
        self.assertFalse(gate.observe(match, "LIVE", now=1))
        gate.observe(None, "LIVE", now=2)
        self.assertFalse(gate.observe(match, "LIVE", now=3))
        self.assertTrue(gate.observe(match, "LIVE", now=4))
        self.assertFalse(gate.observe(match, "LIVE", now=5))
        self.assertFalse(gate.observe(match, "LIVE", now=6))
        self.assertTrue(gate.observe(match, "LIVE", now=15))

    def test_image_path_cannot_exfiltrate_device_secret(self):
        api = Backend(Config())
        for path in ("https://evil.invalid/image", "//evil.invalid/image", "/api/images/1"):
            with self.assertRaises(ValueError):
                api.call("GET", path)

    def test_camera_reconnect_discards_old_frame_before_reopening(self):
        camera = LatestCamera.__new__(LatestCamera)
        camera.lock = threading.Lock()
        camera.stopped = Mock()
        camera.stopped.is_set.side_effect = [False, False, True]
        camera.stopped.wait.return_value = False
        old_frame, new_frame = object(), object()
        camera.frame, camera.received_at, camera.serial = old_frame, 123.0, 1
        previous = Mock()
        previous.read.return_value = (False, None)
        reopened = Mock()
        reopened.read.return_value = (True, new_frame)
        camera.capture = previous

        def reopen():
            self.assertIsNone(camera.frame)
            self.assertEqual(0.0, camera.received_at)
            return reopened

        camera._open = Mock(side_effect=reopen)
        camera._read()
        previous.release.assert_called_once()
        camera._open.assert_called_once()
        self.assertIs(new_frame, camera.frame)
        self.assertEqual(2, camera.serial)
        reopened.release.assert_called_once()


if __name__ == "__main__":
    unittest.main()
