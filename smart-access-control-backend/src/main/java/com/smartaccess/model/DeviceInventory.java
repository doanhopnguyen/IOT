package com.smartaccess.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity @Table(name="device_inventory") @Getter @Setter @NoArgsConstructor
public class DeviceInventory {
    @Id @Column(name="device_id") private Long deviceId;
    @OneToOne(fetch=FetchType.LAZY) @MapsId @JoinColumn(name="device_id") private Device device;
    @Column(name="factory_mac",nullable=false,unique=true,length=12) private String factoryMac;
    @Column(name="claim_hash",length=64,unique=true) private String claimHash;
    @Column(nullable=false,length=24) private String state="INVENTORY";
    @Column(nullable=false) private long generation=1;
    @Column(name="setup_ready",nullable=false) private boolean setupReady;
    @Column(name="door_closed") private Boolean doorClosed;
    @Column(name="latch_released") private Boolean latchReleased;
    @Column(name="recipient_id") private Long recipientId;
    @Column(name="operation_uuid",length=36) private String operationUuid;
    @Column(name="operation_generation") private Long operationGeneration;
    @Column(name="operation_actor_id") private Long operationActorId;
    @Column(name="state_updated_at") private LocalDateTime stateUpdatedAt;
}
