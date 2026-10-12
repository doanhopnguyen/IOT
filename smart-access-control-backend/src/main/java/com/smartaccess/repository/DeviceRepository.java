package com.smartaccess.repository;

import com.smartaccess.model.enumtype.DeviceType;
import com.smartaccess.model.Device;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface DeviceRepository extends JpaRepository<Device, Long> {
    Optional<Device> findByDeviceUid(String deviceUid);
    boolean existsByDeviceUid(String deviceUid);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from Device d where d.deviceUid = :deviceUid")
    Optional<Device> findByDeviceUidForUpdate(@Param("deviceUid") String deviceUid);

    Optional<Device> findFirstByAccessUnit_UnitIdAndDeviceType(Long unitId, DeviceType deviceType);
}
