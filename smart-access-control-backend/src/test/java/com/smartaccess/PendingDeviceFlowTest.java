package com.smartaccess;

import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.NONE,properties={
 "spring.datasource.url=jdbc:h2:mem:pending;MODE=MySQL;DB_CLOSE_DELAY=-1",
 "spring.datasource.username=sa","spring.datasource.password=","spring.datasource.driver-class-name=org.h2.Driver",
 "spring.flyway.enabled=false","spring.jpa.hibernate.ddl-auto=create-drop","app.mqtt.enabled=false"})
class PendingDeviceFlowTest {
 @Autowired DeviceRepository devices;@Autowired DeviceInventoryRepository inventory;@Autowired org.springframework.transaction.support.TransactionTemplate tx;

 @Test void pendingInventoryAllowsMissingMacAndManyPendingRows(){
  long before=inventory.count();
  tx.executeWithoutResult(status->{for(String uid:new String[]{"PENDING-000000000001","PENDING-000000000002"}){
   Device d=new Device();d.setDeviceUid(uid);d.setDeviceName("Chờ nạp");d.setDeviceType(DeviceType.DOOR_CONTROLLER);
   devices.saveAndFlush(d);
   DeviceInventory i=new DeviceInventory();i.setDevice(d);i.setFactoryMac(null);i.setState(DeviceInventory.AWAITING_FLASH);
   inventory.saveAndFlush(i);
  }});
  assertThat(inventory.count()).isEqualTo(before+2);
 }
}
