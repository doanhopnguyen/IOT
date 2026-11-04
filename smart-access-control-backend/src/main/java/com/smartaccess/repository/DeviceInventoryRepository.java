package com.smartaccess.repository;

import com.smartaccess.model.DeviceInventory;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface DeviceInventoryRepository extends JpaRepository<DeviceInventory,Long> {
    Optional<DeviceInventory> findByFactoryMac(String mac);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from DeviceInventory i join fetch i.device where i.claimHash=:hash")
    Optional<DeviceInventory> claimForUpdate(@Param("hash") String hash);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from DeviceInventory i join fetch i.device where i.deviceId=:id")
    Optional<DeviceInventory> lock(@Param("id") Long id);
}
