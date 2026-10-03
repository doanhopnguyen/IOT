package com.smartaccess.repository;

import com.smartaccess.model.Device;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface DeviceRepository extends JpaRepository<Device, Long> {

    Optional<Device> findByDeviceUid(String deviceUid);
    boolean existsByDeviceUid(String deviceUid);
}
