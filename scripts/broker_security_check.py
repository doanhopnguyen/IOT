"""Kiểm thử bảo mật broker MQTT (đề bài mục 7: xác thực + phân quyền topic). Không thay đổi cấu hình broker.

Các ca kiểm thử (mong đợi):
  1. Kết nối ẩn danh                                → bị từ chối
  2. Đúng username thiết bị nhưng sai mật khẩu     → bị từ chối
  3. Thiết bị gửi lên topic status của CHÍNH nó   → backend nhận được (ca đối chứng)
  4. Thiết bị gửi lên topic status của thiết bị khác → backend KHÔNG nhận (ACL %u)
  5. Thiết bị nghe trộm topic cmd của thiết bị khác → KHÔNG nhận được

Bản tin thử không có deviceSecret nên backend tự loại, không tác động tới cửa thật.
Mật khẩu đọc từ .local (runtime.json, broker-devices.json), không nhận qua dòng lệnh.

  python scripts/broker_security_check.py --host 172.20.10.3 --port 1884 --uid ESP32-80B54EC8149C
"""
import argparse, json, threading, time, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]; LOCAL = ROOT / '.local'
PREFIX = 'smartdoor-iot'


def rc_ok(rc):
    return getattr(rc, 'value', rc) == 0


def connect(mqtt, host, port, user=None, password=None, timeout=5):
    """Trả (client đã kết nối | None, mã lỗi)."""
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id='seccheck-' + uuid.uuid4().hex[:8])
    if user is not None: client.username_pw_set(user, password)
    done = threading.Event(); result = {}
    def on_connect(c, userdata, flags, rc, props=None):
        result['rc'] = rc; done.set()
    client.on_connect = on_connect
    try:
        client.connect(host, port, keepalive=10)
    except OSError as e:
        return None, f'không kết nối được TCP: {e}'
    client.loop_start()
    if not done.wait(timeout) or not rc_ok(result.get('rc')):
        client.loop_stop(); client.disconnect()
        return None, str(result.get('rc', 'timeout'))
    return client, 'OK'


def received(listener, topic, publisher, pub_topic, wait=3.0):
    """listener subscribe topic; publisher gửi lên pub_topic; trả True nếu listener nhận được."""
    got = threading.Event(); marker = uuid.uuid4().hex
    def on_message(c, u, msg):
        if marker.encode() in msg.payload: got.set()
    listener.on_message = on_message
    listener.subscribe(topic, qos=1); time.sleep(0.7)
    publisher.publish(pub_topic, json.dumps({'probe': marker}), qos=1)
    return got.wait(wait)


def evaluate(results):
    """results: list (tên ca, mong đợi bool, thực tế bool). Trả (bảng Markdown, số ca đạt)."""
    lines = ['| # | Ca kiểm thử | Mong đợi | Thực tế | Kết quả |', '|---|---|---|---|---|']
    passed = 0
    for i, (name, expected, actual) in enumerate(results, 1):
        ok = expected == actual; passed += ok
        yn = lambda v: 'Có' if v else 'Không'
        lines.append(f'| {i} | {name} | {yn(expected)} | {yn(actual)} | {"Đạt" if ok else "**KHÔNG ĐẠT**"} |')
    return '\n'.join(lines), passed


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--host', required=True); p.add_argument('--port', type=int, default=1884)
    p.add_argument('--uid', required=True, help='UID thiết bị đã có tài khoản MQTT trong .local/broker-devices.json')
    a = p.parse_args()
    import paho.mqtt.client as mqtt  # import muộn để test hàm thuần không cần paho
    cfg = json.loads((LOCAL / 'runtime.json').read_text())
    devices = json.loads((LOCAL / 'broker-devices.json').read_text())
    if a.uid not in devices: raise SystemExit(f'{a.uid} chưa có trong .local/broker-devices.json')
    other = 'SECCHECK-OTHER-DEVICE'
    results = []
    c, _ = connect(mqtt, a.host, a.port); results.append(('Kết nối ẩn danh được chấp nhận', False, c is not None))
    if c: c.disconnect()
    c, _ = connect(mqtt, a.host, a.port, a.uid, 'sai-mat-khau-' + uuid.uuid4().hex[:6])
    results.append(('Đăng nhập sai mật khẩu được chấp nhận', False, c is not None))
    if c: c.disconnect()
    backend, why = connect(mqtt, a.host, a.port, cfg['broker_user'], cfg['broker_password'])
    device, why2 = connect(mqtt, a.host, a.port, a.uid, devices[a.uid])
    if not backend or not device: raise SystemExit(f'Không đăng nhập được bằng tài khoản hợp lệ (backend={why}, device={why2})')
    try:
        results.append(('Thiết bị gửi status của chính nó, backend nhận', True,
                        received(backend, f'{PREFIX}/{a.uid}/status', device, f'{PREFIX}/{a.uid}/status')))
        backend.unsubscribe(f'{PREFIX}/{a.uid}/status')
        results.append(('Thiết bị giả mạo status của thiết bị khác, backend nhận', False,
                        received(backend, f'{PREFIX}/{other}/status', device, f'{PREFIX}/{other}/status')))
        results.append(('Thiết bị nghe trộm lệnh cmd của thiết bị khác', False,
                        received(device, f'{PREFIX}/{other}/cmd', backend, f'{PREFIX}/{other}/cmd')))
    finally:
        for client in (backend, device): client.loop_stop(); client.disconnect()
    table, passed = evaluate(results)
    print(f'## Kiểm thử bảo mật broker {a.host}:{a.port}\n'); print(table)
    print(f'\nĐạt {passed}/{len(results)} ca.')
    if passed != len(results): raise SystemExit(1)


if __name__ == '__main__':
    main()
