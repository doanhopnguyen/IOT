import test from 'node:test';
import assert from 'node:assert/strict';
import { firmwareUpdateState, type FirmwareStatus, firmwareService } from '../src/services/api/firmwareService';
import { setApiBaseUrl } from '../src/services/api/client';
const status: FirmwareStatus = { currentVersion:'1.13.0', hardwareVersion:'esp32s3-n16r8',online:true,capable:true,available:[],update:null,targetVersion:'2.0.0-demo' };
test('OTA completion needs both new boot acknowledgement and matching reported firmware', () => {
  assert.equal(firmwareUpdateState(status),'IDLE');
  for(const state of ['PENDING','SENT'] as const)assert.equal(firmwareUpdateState({...status,update:{commandUuid:'ota',status:state,resultMessage:null}}),'UPDATING');
  const done={...status,update:{commandUuid:'ota',status:'ACKNOWLEDGED' as const,resultMessage:'FIRMWARE_UPDATED:2.0.0-demo'}};
  assert.equal(firmwareUpdateState(done),'RECONNECTING');
  assert.equal(firmwareUpdateState({...done,currentVersion:'2.0.0-demo'}),'COMPLETE');
  for(const state of ['FAILED','TIMEOUT'] as const)assert.equal(firmwareUpdateState({...status,update:{commandUuid:'ota',status:state,resultMessage:null}}),'FAILED');
});
test('owner confirmation submits selected release and explicit consent, never the firmware binary', async () => {
  setApiBaseUrl('http://ota.test');const old=globalThis.fetch;const calls:{path:string;init?:RequestInit}[]=[];
  globalThis.fetch=(async(path,init)=>{calls.push({path:String(path),init});return new Response(JSON.stringify(String(path).endsWith('/csrf')?{token:'csrf'}:{commandUuid:'ota',status:'SENT',resultMessage:null}));}) as typeof fetch;
  try {
    await firmwareService.install(7,3);const sent=calls.find(c=>c.path.endsWith('/units/7/firmware'))!;
    assert.equal(sent.init?.method,'POST');assert.deepEqual(JSON.parse(String(sent.init?.body)),{releaseId:3,consent:true});
  }finally{globalThis.fetch=old;}
});
