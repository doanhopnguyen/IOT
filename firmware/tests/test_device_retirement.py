"""Check retire / suspend / owner-lockdown wiring in the connected firmware source.

Run: python firmware/tests/test_device_retirement.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "offline_door/offline_door.ino").read_text(encoding="utf-8")
NETWORK = (ROOT / "connected_door/network.h").read_text(encoding="utf-8")
MAIN = (ROOT / "connected_door/main.cpp").read_text(encoding="utf-8")


def between(text, start, end):
    assert start in text, f"missing {start!r}"
    return text.split(start, 1)[1].split(end, 1)[0]


def guarded(text, call):
    before = text[:text.index(call)]
    return before.rfind("#ifdef CONNECTED_DOOR") > before.rfind("#endif")


def retire_flag_written_before_wipe():
    body = between(NETWORK, "void retireDevice(", "\n}\n")
    flag = body.index('putBool("retired",true)')
    assert flag < body.index("retireWipe("), "retired flag must be persisted before wiping"
    wipe = between(NETWORK, "bool retireWipe(", "\n}\n")
    for call in ("emptyDatabase()", "nvs.clear()", "eventPrefs.clear()", "networkPrefs.clear()", "factoryPrefs.clear()"):
        assert call in wipe, f"retireWipe must call {call}"
    assert "retirePrefs.clear()" not in NETWORK and "doorretire" in NETWORK


def retired_boot_checked_first():
    setup = between(SOURCE, "void setup() {", "\nvoid loop()")
    check = setup.index("connectedRetired()")
    assert guarded(setup, "connectedRetired()")
    assert check < setup.index("loadConfig();") and check < setup.index("connectedSetup();")
    assert check > setup.index("fpSerial.begin("), "fingerprint UART is needed to finish the wipe"


def retired_boot_resumes_wipe():
    body = between(NETWORK, "void connectedRetiredBoot(", "\n}\n")
    assert "retireWipe(" in body and "WiFi.begin" not in body and "for(;;)" in body


def decommission_bypasses_generation_and_ttl():
    handler = between(NETWORK, 'if(incomingTopic!=topic("cmd"))return;', "void connectedSetup()")
    assert handler.index('type=="DEVICE_DECOMMISSION"') < handler.index("GENERATION_MISMATCH")


def local_paths_gated():
    rfid = between(SOURCE, "if (connectedCaptureCard(cardName(card))) return;", "if (!adminSession) return;")
    finger = between(SOURCE, "uint16_t id=finger.fingerID;", "if (!adminSession) return;")
    pin = between(SOURCE, "void submitPin()", "bool adminPin=")
    for text, call in ((rfid, "connectedAllowsCard("), (finger, "connectedAllowsFinger("), (pin, "connectedAllowsPin()")):
        assert call in text, f"{call} missing"
        assert guarded(text, call), f"{call} must be inside #ifdef CONNECTED_DOOR"
    assert '"LOCKDOWN"' in rfid and '"LOCKDOWN"' in finger, "lockdown refusals carry reason for alerts"


def lockdown_commands_handled():
    handler = between(NETWORK, 'if(incomingTopic!=topic("cmd"))return;', "void connectedSetup()")
    for text in ('"DOOR_LOCKDOWN"', '"DOOR_RELEASE"', '"LOCKDOWN_ON"', '"LOCKDOWN_OFF"'):
        assert text in handler, f"{text} missing"
    unlock = between(handler, 'if(type=="DOOR_UNLOCK"){', "}\n")
    assert "allowRemote(" in unlock


def suspended_config_before_claimed():
    config = between(NETWORK, 'if(incomingTopic==topic("config")) {', 'if(incomingTopic!=topic("cmd"))return;')
    assert config.index('doc["lifecycle"]') < config.index('claimed=doc["claimed"]')
    assert config.index('doc["lifecycle"]') < config.index("generationMismatch")
    assert '"ownerRfid"' in config and '"ownerFingerprints"' in config and '"lockdown"' in config


def actuator_blocked_when_suspended_or_retired():
    open_fn = between(SOURCE, "bool requestOpen(uint32_t durationMs=0) {", "\n}\n")
    assert "connectedOpenBlocked()" in open_fn and guarded(open_fn, "connectedOpenBlocked()")
    blocked = between(NETWORK, "bool connectedOpenBlocked(){", "}\n")
    assert "SUSPENDED" in blocked and "RETIRED" in blocked and "LOCKDOWN" not in blocked


def firmware_version():
    assert 'FIRMWARE_VERSION "1.18.0"' in MAIN


for check in (retire_flag_written_before_wipe, retired_boot_checked_first, retired_boot_resumes_wipe,
              decommission_bypasses_generation_and_ttl, local_paths_gated, lockdown_commands_handled,
              suspended_config_before_claimed, actuator_blocked_when_suspended_or_retired, firmware_version):
    check()
print("PASS: retire flag first, boot stays retired, decommission bypass, gated local opens, lockdown commands")
