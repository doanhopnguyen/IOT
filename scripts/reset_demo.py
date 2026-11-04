"""Reset ONLY the isolated demo database and issue a fresh administrator password.
Run after hardware reset is verified. Stops no processes and never touches source files.
"""
import argparse,json,secrets
from pathlib import Path
import bcrypt,pymysql
ROOT=Path(__file__).resolve().parents[1];LOCAL=ROOT/'.local'
def main():
 cfg=json.loads((LOCAL/'runtime.json').read_text());name=cfg['db_name']
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--confirm-database',required=True);a=p.parse_args()
 if a.confirm_database!=name or not name.startswith('smart_access_dev_') or not name.replace('_','').isalnum():raise SystemExit('Database scope check failed')
 password='Door!'+secrets.token_urlsafe(16)
 db=pymysql.connect(host='127.0.0.1',user=cfg['db_user'],password=cfg['db_password'],database=name)
 try:
  with db.cursor() as cur:
   cur.execute('SHOW TABLES');tables=[row[0] for row in cur.fetchall() if row[0]!='flyway_schema_history']
   if any(not t.replace('_','').isalnum() for t in tables):raise RuntimeError('Unexpected table name')
   cur.execute('SET FOREIGN_KEY_CHECKS=0')
   for table in tables:cur.execute('DELETE FROM `'+table+'`')
   cur.execute('SET FOREIGN_KEY_CHECKS=1')
   cur.execute("INSERT INTO accounts(full_name,email,password_hash,is_admin,status,created_at,updated_at) VALUES(%s,%s,%s,TRUE,'ACTIVE',NOW(3),NOW(3))",('Smart Door Admin',cfg['app_email'],bcrypt.hashpw(password.encode(),bcrypt.gensalt()).decode()))
  db.commit()
 except Exception:db.rollback();raise
 finally:db.close()
 cfg['app_password']=password;cfg.pop('account_id',None);cfg.pop('unit_id',None)
 (LOCAL/'runtime.json').write_text(json.dumps(cfg,indent=2))
 (LOCAL/'ADMIN_ACCESS.txt').write_text(f"Admin URL: http://100.111.90.116:8080/admin/index.html\nLocal URL: http://127.0.0.1:8080/admin/index.html\nEmail: {cfg['app_email']}\nPassword: {password}\n",encoding='utf-8')
 print('Isolated demo database cleared; exactly one new admin retained. Credentials saved in .local/ADMIN_ACCESS.txt.')
if __name__=='__main__':main()
