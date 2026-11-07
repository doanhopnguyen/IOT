import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch

import numpy as np
import requests

from enrollment_server import handler_for
from media_validation import MediaValidationError, MESSAGES


class EnrollmentHttpTests(unittest.TestCase):
    def setUp(self):
        self.token = 'test-processor-token-not-a-real-secret'
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), handler_for(object(), self.token))
        self.server.daemon_threads = True
        self.thread = threading.Thread(target=lambda: self.server.serve_forever(poll_interval=.02), daemon=True)
        self.thread.start()
        self.session = requests.Session()
        self.session.trust_env = False
        self.url = f'http://127.0.0.1:{self.server.server_port}/extract'

    def tearDown(self):
        self.session.close()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def post(self, token=None, media_type='image/jpeg'):
        return self.session.post(self.url, data=b'media-test-bytes', headers={
            'Authorization': 'Bearer ' + (self.token if token is None else token),
            'Content-Type': media_type}, timeout=3)

    def test_valid_media_returns_only_embedding_and_model(self):
        vector = np.zeros(512); vector[0] = 1
        with patch('enrollment_server.extract_media', return_value=vector):
            response = self.post()
        self.assertEqual(200, response.status_code)
        self.assertEqual({'model', 'embedding'}, set(response.json()))
        self.assertEqual(512, len(response.json()['embedding']))

    def test_quality_rejections_explain_the_exact_remedy_and_release_processor_lock(self):
        with patch('builtins.print') as log:
            for code in ['NO_FACE', 'MULTIPLE_FACES', 'FACE_TOO_SMALL', 'FACE_BLURRY', 'FACE_OUT_OF_FRAME', 'IMAGE_DIMENSIONS']:
                with self.subTest(code=code), patch('enrollment_server.extract_media', side_effect=MediaValidationError(code)):
                    response = self.post()
                    self.assertEqual(422, response.status_code)
                    self.assertEqual({'code': code, 'message': MESSAGES[code]}, response.json())
            self.assertEqual(6, log.call_count)
            self.assertNotIn(self.token, str(log.call_args_list))
            self.assertNotIn('media-test-bytes', str(log.call_args_list))

    def test_arbitrary_decoder_exception_does_not_expose_paths_or_private_data(self):
        with patch('enrollment_server.extract_media', side_effect=ValueError('private-file-path secret')), patch('builtins.print'):
            response = self.post()
        self.assertEqual(422, response.status_code)
        self.assertEqual('MEDIA_INVALID', response.json()['code'])
        self.assertNotIn('private-file-path', response.text)
        self.assertNotIn('secret', response.text)

    def test_unexpected_processor_failure_is_not_reported_as_bad_photo(self):
        with patch('enrollment_server.extract_media', side_effect=RuntimeError('model internals')):
            response = self.post()
        self.assertEqual(503, response.status_code)
        self.assertNotIn('model internals', response.text)

    def test_bad_authentication_and_types_never_reach_extraction(self):
        with patch('enrollment_server.extract_media') as extract:
            self.assertEqual(403, self.post(token='wrong').status_code)
            self.assertEqual(415, self.post(media_type='application/pdf').status_code)
            extract.assert_not_called()


if __name__ == '__main__':
    unittest.main()
