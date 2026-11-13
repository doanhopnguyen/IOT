"""Tự dò cổng COM của ESP32 thay vì ghi cứng (COM3/5/7... tùy máy).

Thứ tự: --port nếu truyền vào > biến môi trường SMARTDOOR_PORT > dò tự động.
Dò tự động chỉ chọn khi có đúng một cổng USB-serial khớp; nhiều cổng thì báo danh sách
để người dùng chọn bằng --port, tránh ghi nhầm sang thiết bị khác.
"""
import os

from serial.tools import list_ports

# Espressif native USB, Silicon Labs CP210x, WCH CH340/CH9102, FTDI.
KNOWN_VIDS = {0x303A, 0x10C4, 0x1A86, 0x0403}


def resolve_port(port=None):
    if port:
        return port
    if os.environ.get('SMARTDOOR_PORT'):
        return os.environ['SMARTDOOR_PORT']
    ports = list(list_ports.comports())
    matches = [p for p in ports if p.vid in KNOWN_VIDS] or [p for p in ports if p.vid is not None]
    if len(matches) == 1:
        print(f'Using {matches[0].device} ({matches[0].description})')
        return matches[0].device
    if not matches:
        raise SystemExit('No USB serial port found. Plug in the ESP32 with a data cable, then retry.')
    listing = ', '.join(f'{p.device} ({p.description})' for p in matches)
    raise SystemExit(f'Several serial ports found: {listing}. Choose one with --port.')
