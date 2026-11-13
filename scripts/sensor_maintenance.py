"""Talk to the USB maintenance firmware. No success without a verified sensor ACK."""
import argparse,time
from pathlib import Path
import serial
from serial_port import resolve_port

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--port',help='COM port; auto-detected when omitted');p.add_argument('--log',type=Path)
 mode=p.add_mutually_exclusive_group(required=True);mode.add_argument('--scan',action='store_true');mode.add_argument('--erase',action='store_true',help='Erase ALL fingerprint templates, then verify count zero')
 args=p.parse_args();args.port=resolve_port(args.port);lines=[]
 with serial.Serial(args.port,115200,timeout=.25) as port:
  port.dtr=True;port.rts=False;time.sleep(.5);port.reset_input_buffer();port.write(b'SCAN\n' if args.scan else b'ERASE_FINGERPRINTS\n')
  deadline=time.monotonic()+18
  while time.monotonic()<deadline:
   line=port.readline().decode(errors='replace').strip()
   if line:print(line);lines.append(line)
   if ('DIAG_SENSOR_FOUND' in line or 'DIAG_NO_UART_RESPONSE' in line) and args.scan:break
   if args.erase and ('CLEANUP_FAILED' in line or 'RC522_RESET_RESPONDING' in line):break
 result='\n'.join(lines)
 if args.log:args.log.write_text(result+'\n',encoding='utf-8')
 if args.scan:
  if 'DIAG_SENSOR_FOUND' not in result:raise SystemExit('Sensor UART not responding; no data has been erased.')
 elif not all(s in result for s in ('CLEANUP_FINGERPRINT_EMPTY_VERIFIED','FINGERPRINT_COUNT_AFTER=0','RC522_RESET_RESPONDING')):
  raise SystemExit('Sensor erase NOT verified. Do not report the whole system clean.')
if __name__=='__main__':main()
