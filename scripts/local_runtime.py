"""Find the local Mosquitto installation without hardcoded machine paths."""
import os
from pathlib import Path
import re
import shutil


def mosquitto_tool(name):
    environment = "MOSQUITTO_EXE" if name == "mosquitto" else "MOSQUITTO_PASSWD_EXE"
    configured = os.environ.get(environment) or shutil.which(name)
    if configured:
        return configured
    candidates = [Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "mosquitto"]
    if os.name == "nt":
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Services\mosquitto") as key:
                command = winreg.QueryValueEx(key, "ImagePath")[0]
            match = re.match(r'^"([^"]+\.exe)"|^(.+?\.exe)', command, re.I)
            if match:
                candidates.insert(0, Path(match.group(1) or match.group(2)).parent)
        except FileNotFoundError:
            pass
    for directory in candidates:
        path = directory / (name + ".exe")
        if path.is_file():
            return str(path)
    raise FileNotFoundError(f"Install Mosquitto or set {environment}.")
