"""Check that failed door attempts are reported to the backend (connected build only).

Run: python firmware/tests/test_failed_attempt_reporting.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "offline_door/offline_door.ino").read_text(encoding="utf-8")
MAIN = (ROOT / "connected_door/main.cpp").read_text(encoding="utf-8")


def between(text, start, end):
    return text.split(start, 1)[1].split(end, 1)[0]


submit = between(SOURCE, "void submitPin()", "bool adminPin=")
PIN_CALL = 'connectedRecord("PIN",false,"",-1);'
FINGER_CALL = 'connectedRecord("FINGERPRINT",false,"",-1);'


def ifdef_guarded(text, call):
    before = text[:text.index(call)]
    return before.rfind("#ifdef CONNECTED_DOOR") > before.rfind("#endif")


def wrong_pin_reports_denied():
    assert PIN_CALL in submit, "wrong PIN is not reported"
    assert ifdef_guarded(submit, PIN_CALL), "PIN report must be inside #ifdef CONNECTED_DOOR"
    deny_branch = submit.index("if (!ok)")
    assert deny_branch < submit.index(PIN_CALL) < submit.index("denyPin();"), \
        "PIN report must be in the !ok branch before denyPin()"


def blocked_keypad_does_not_report():
    blocked = next(line for line in submit.splitlines() if "if (pinBlocked)" in line)
    assert "connectedRecord" not in blocked
    assert submit.index("if (pinBlocked)") < submit.index(PIN_CALL)


def unknown_finger_reports_denied():
    # The last search is the HOME-screen one; the earlier search belongs to enrollment.
    home_search = SOURCE.rsplit("result=finger.fingerFastSearch();", 1)[1]
    block = home_search[:home_search.index("uint16_t id=finger.fingerID;")]
    assert FINGER_CALL in block, "unknown fingerprint is not reported"
    assert ifdef_guarded(block, FINGER_CALL)
    assert "result==FINGERPRINT_NOTFOUND && screen==HOME && !connectedIsEnrolling()" in block


def firmware_version_bumped():
    assert '#define FIRMWARE_VERSION "1.14.0"' in MAIN


for check in (wrong_pin_reports_denied, blocked_keypad_does_not_report, unknown_finger_reports_denied,
              firmware_version_bumped):
    check()
print("OK failed-attempt reporting")
