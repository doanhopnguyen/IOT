import importlib.util
from pathlib import Path
import unittest

path=Path(__file__).resolve().parents[1]/'broker_security_check.py'
spec=importlib.util.spec_from_file_location('broker_security_check',path);sec=importlib.util.module_from_spec(spec);spec.loader.exec_module(sec)

class EvaluateTests(unittest.TestCase):
    def test_counts_pass_and_marks_failures(self):
        table,passed=sec.evaluate([('A',False,False),('B',True,True),('C',False,True)])
        self.assertEqual(passed,2)
        self.assertIn('| 3 | C | Không | Có | **KHÔNG ĐẠT** |',table)
        self.assertIn('| 1 | A | Không | Không | Đạt |',table)

    def test_rc_ok_accepts_int_and_reason_code(self):
        class Rc: value=0
        self.assertTrue(sec.rc_ok(0)); self.assertTrue(sec.rc_ok(Rc())); self.assertFalse(sec.rc_ok(5))

if __name__=='__main__':unittest.main()
