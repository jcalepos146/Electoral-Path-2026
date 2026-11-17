import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('refresh', Path(__file__).parents[1] / 'scripts/refresh_civicapi.py')
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)


class RefreshTests(unittest.TestCase):
    def test_forbidden_stops_without_retry_or_writes(self):
        error = HTTPError('https://civicapi.org', 403, 'Forbidden', {}, None)
        with patch.object(refresh.urllib.request, 'urlopen', side_effect=error), patch.object(refresh.time, 'sleep') as sleep, patch.object(refresh, 'save') as save:
            with self.assertRaisesRegex(RuntimeError, 'HTTP 403'):
                refresh.main()
            sleep.assert_not_called()
            save.assert_not_called()

    def test_incomplete_house_payload_preserves_snapshots(self):
        race = {'id': 'one', 'country': 'US', 'province': 'CA', 'district': '1', 'type': 'House of Representatives'}
        with patch.object(refresh, 'get', side_effect=[{'races': [race]}, {'candidates': [{'votes': 100}]}]), patch.object(refresh.time, 'sleep'), patch.object(refresh, 'save') as save, patch('builtins.print'):
            with self.assertRaisesRegex(RuntimeError, 'Expected 435 House districts'):
                refresh.main()
            save.assert_not_called()

    def test_missing_candidates_preserves_snapshots(self):
        races = [{'id': str(i), 'country': 'US', 'province': 'CA', 'district': str(i), 'type': 'House of Representatives'} for i in range(435)]
        def response(url):
            return {'races': races} if '/search?' in url else {'candidates': []}
        with patch.object(refresh, 'get', side_effect=response), patch.object(refresh.time, 'sleep'), patch.object(refresh, 'save') as save, patch('builtins.print'):
            with self.assertRaisesRegex(RuntimeError, 'Missing race candidates'):
                refresh.main()
            save.assert_not_called()


if __name__ == '__main__':
    unittest.main()
