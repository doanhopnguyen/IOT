"""Đo chỉ tiêu phi chức năng (đề mục 7.2) từ database dev và in bảng Markdown để dán vào docs/KET_QUA_KIEM_THU.md.

Đo:
- Độ trễ lệnh điều khiển = commands.acknowledged_at - commands.requested_at (lệnh ACKNOWLEDGED), theo loại lệnh.
- Tỷ lệ lệnh thành công / thất bại / quá hạn.
- Số cảnh báo tự sinh (DEVICE_OFFLINE, DOOR_LEFT_OPEN) và thời gian phát hiện offline.

Chỉ đọc database, không sửa gì. Ví dụ:
  python scripts/measure_nfr.py --since 2026-11-05T19:00
  python scripts/measure_nfr.py --since 2026-11-05T19:00 --device-uid ESP32-80B54EC8149C
"""
import argparse,json,math
from datetime import datetime
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1];LOCAL=ROOT/'.local'

def percentile(values,p):
    """Percentile theo nearest-rank: p95 của 1..100 là 95. Danh sách rỗng trả None."""
    if not values:return None
    ordered=sorted(values);rank=max(1,math.ceil(p/100*len(ordered)))
    return ordered[rank-1]

def summarize(latencies_ms):
    """Thống kê độ trễ (ms): n, trung bình, p50, p95, max."""
    if not latencies_ms:return {'n':0,'mean':None,'p50':None,'p95':None,'max':None}
    return {'n':len(latencies_ms),'mean':round(sum(latencies_ms)/len(latencies_ms),1),
            'p50':percentile(latencies_ms,50),'p95':percentile(latencies_ms,95),'max':max(latencies_ms)}

def latency_table(rows):
    """rows: (command_type, status, latency_ms|None). Trả bảng Markdown theo loại lệnh."""
    by_type={}
    for command_type,status,latency in rows:
        item=by_type.setdefault(command_type,{'latencies':[],'statuses':{}})
        item['statuses'][status]=item['statuses'].get(status,0)+1
        if status=='ACKNOWLEDGED' and latency is not None and latency>=0:item['latencies'].append(latency)
    lines=['| Loại lệnh | Tổng | Thành công | Thất bại | Quá hạn | n đo | TB (ms) | p50 | p95 | max |',
           '|---|---|---|---|---|---|---|---|---|---|']
    for command_type in sorted(by_type):
        item=by_type[command_type];s=summarize(item['latencies']);st=item['statuses']
        cell=lambda v:'-' if v is None else str(v)
        lines.append(f"| {command_type} | {sum(st.values())} | {st.get('ACKNOWLEDGED',0)} | {st.get('FAILED',0)} | "
                     f"{st.get('TIMEOUT',0)} | {s['n']} | {cell(s['mean'])} | {cell(s['p50'])} | {cell(s['p95'])} | {cell(s['max'])} |")
    return '\n'.join(lines)

def main():
    p=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--since',required=True,help='Mốc bắt đầu đợt thử, ví dụ 2026-11-05T19:00')
    p.add_argument('--device-uid',help='Chỉ tính một thiết bị')
    a=p.parse_args()
    since=datetime.fromisoformat(a.since)
    import pymysql  # Import muộn để test các hàm thuần không cần cài pymysql.
    cfg=json.loads((LOCAL/'runtime.json').read_text())
    db=pymysql.connect(host='127.0.0.1',user=cfg['db_user'],password=cfg['db_password'],database=cfg['db_name'])
    device_filter,params=('',[since])
    if a.device_uid:device_filter,params=(' and d.device_uid=%s',[since,a.device_uid])
    try:
        with db.cursor() as cur:
            cur.execute('select c.command_type,c.status,timestampdiff(microsecond,c.requested_at,c.acknowledged_at)/1000 '
                        'from commands c join devices d on d.device_id=c.device_id where c.requested_at>=%s'+device_filter,params)
            rows=[(t,s,None if l is None else float(l)) for t,s,l in cur.fetchall()]
            cur.execute('select e.event_type,e.alert_status,count(*) from events e join devices d on d.device_id=e.device_id '
                        'where e.occurred_at>=%s'+device_filter+' group by e.event_type,e.alert_status',params)
            alerts=cur.fetchall()
            cur.execute('select d.device_uid,count(*) from telemetry t join devices d on d.device_id=t.device_id '
                        'where t.occurred_at>=%s'+device_filter+' group by d.device_uid',params)
            telemetry=cur.fetchall()
    finally:db.close()
    print(f'## Kết quả đo từ {since:%Y-%m-%d %H:%M}\n')
    print('### Độ trễ lệnh điều khiển (gửi lệnh → nhận ACK)\n');print(latency_table(rows));print()
    print('### Cảnh báo tự sinh\n');print('| Loại | Trạng thái | Số lượng |\n|---|---|---|')
    for event_type,status,count in alerts:print(f'| {event_type} | {status} | {count} |')
    print('\n### Telemetry đã lưu\n');print('| Thiết bị | Số dòng |\n|---|---|')
    for uid,count in telemetry:print(f'| {uid} | {count} |')

if __name__=='__main__':main()
