"""Read-only operational checks; does not actuate a door or seed sample data."""
import json
from pathlib import Path
import requests
ROOT=Path(__file__).resolve().parents[1]
cfg=json.loads((ROOT/'.local/runtime.json').read_text())
base='http://127.0.0.1:8080';session=requests.Session()
health=session.get(base+'/api/health',timeout=10);health.raise_for_status()
assert health.json()=={'application':'smart-door','apiVersion':1,'status':'READY'}
csrf=session.get(base+'/api/auth/csrf',timeout=10).json()
login=session.post(base+'/api/auth/login',json={'identifier':cfg['app_email'],'password':cfg['app_password']},headers={csrf['headerName']:csrf['token']},timeout=10)
login.raise_for_status();assert login.json()['admin']
print('PASS: backend health, CSRF and current admin login.')
for endpoint in ('/api/admin/inventory','/api/admin/accounts'):
 response=session.get(base+endpoint,timeout=10);response.raise_for_status();rows=response.json()
 assert isinstance(rows,list)
 assert all(not any('secret' in k.lower() or 'password' in k.lower() for k in row) for row in rows)
 print(endpoint,':',len(rows),'records; no secret/hash fields exposed.')
for path in ('/admin/index.html','/admin/app.js','/admin/style.css'):
 response=session.get(base+path,timeout=10);response.raise_for_status();assert len(response.content)>100
print('PASS: admin page, script and stylesheet served by backend.')
print('Admin credentials: .local/ADMIN_ACCESS.txt. Hardware verification is separate; see docs/KET_QUA_KIEM_THU.md.')
