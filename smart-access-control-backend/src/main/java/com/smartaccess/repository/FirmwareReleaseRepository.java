package com.smartaccess.repository;

import com.smartaccess.model.FirmwareRelease;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface FirmwareReleaseRepository extends JpaRepository<FirmwareRelease,Long> {
    List<FirmwareRelease> findAllByOrderByReleaseIdDesc();
    List<FirmwareRelease> findByHardwareVersionOrderByReleaseIdDesc(String hardwareVersion);
    boolean existsByVersionAndHardwareVersion(String version,String hardwareVersion);
}
