import importlib.util
from pathlib import Path
import unittest

path=Path(__file__).resolve().parents[1]/'measure_nfr.py'
spec=importlib.util.spec_from_file_location('measure_nfr',path);nfr=importlib.util.module_from_spec(spec);spec.loader.exec_module(nfr)

class PercentileTests(unittest.TestCase):
    def test_nearest_rank(self):
        values=list(range(1,101))
        self.assertEqual(nfr.percentile(values,95),95)
        self.assertEqual(nfr.percentile(values,50),50)
        self.assertEqual(nfr.percentile([7],95),7)
        self.assertIsNone(nfr.percentile([],95))

class SummaryTests(unittest.TestCase):
    def test_summary_and_empty(self):
        self.assertEqual(nfr.summarize([100,200,300]),{'n':3,'mean':200.0,'p50':200,'p95':300,'max':300})
        self.assertEqual(nfr.summarize([])['n'],0)

    def test_table_counts_statuses_and_ignores_unacknowledged_latency(self):
        rows=[('DOOR_UNLOCK','ACKNOWLEDGED',120.0),('DOOR_UNLOCK','ACKNOWLEDGED',180.0),
              ('DOOR_UNLOCK','TIMEOUT',None),('DOOR_UNLOCK','FAILED',90.0),('PIN_SET','ACKNOWLEDGED',400.0)]
        table=nfr.latency_table(rows)
        self.assertIn('| DOOR_UNLOCK | 4 | 2 | 1 | 1 | 2 | 150.0 | 120.0 | 180.0 | 180.0 |',table)
        self.assertIn('| PIN_SET | 1 | 1 | 0 | 0 | 1 | 400.0 |',table)

if __name__=='__main__':unittest.main()
