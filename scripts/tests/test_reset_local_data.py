"""The destructive reset must fail before touching an unintended database."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location("reset", Path(__file__).resolve().parents[1] / "reset_local_data.py")
reset = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reset)


class ResetScopeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.local = Path(self.directory.name)
        self.addCleanup(self.directory.cleanup)

    def configure(self, name):
        (self.local / "runtime.json").write_text(json.dumps({
            "db_name": name, "db_user": "test", "db_password": "test"}), encoding="utf-8")

    def test_wrong_database_name_never_connects(self):
        for configured, confirmed in (("smart_access", "smart_access"),
                                      ("smart_access_dev_one", "smart_access_dev_other")):
            self.configure(configured)
            with patch.object(reset, "LOCAL", self.local), patch("sys.argv", ["reset", "--confirm-database", confirmed]), \
                 patch.object(reset.pymysql, "connect") as connect, contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit):
                    reset.main()
                connect.assert_not_called()

    def test_running_service_blocks_reset_before_database_connection(self):
        self.configure("smart_access_dev_test")
        with patch.object(reset, "LOCAL", self.local), patch("sys.argv", ["reset", "--confirm-database", "smart_access_dev_test"]), \
             patch.object(reset.socket, "socket") as socket, patch.object(reset.pymysql, "connect") as connect, \
             contextlib.redirect_stderr(io.StringIO()):
            socket.return_value.__enter__.return_value.connect_ex.return_value = 0
            with self.assertRaises(SystemExit):
                reset.main()
            connect.assert_not_called()

    def test_unknown_schema_is_never_truncated(self):
        self.configure("smart_access_dev_test")
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchall.return_value = [("unexpected_table",)]
        with patch.object(reset, "LOCAL", self.local), patch("sys.argv", ["reset", "--confirm-database", "smart_access_dev_test"]), \
             patch.object(reset.socket, "socket") as socket, patch.object(reset.pymysql, "connect", return_value=connection):
            socket.return_value.__enter__.return_value.connect_ex.return_value = 1
            with self.assertRaisesRegex(RuntimeError, "Unexpected database schema"):
                reset.main()
            self.assertEqual([call.args[0] for call in cursor.execute.call_args_list], ["SHOW TABLES"])
            connection.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
