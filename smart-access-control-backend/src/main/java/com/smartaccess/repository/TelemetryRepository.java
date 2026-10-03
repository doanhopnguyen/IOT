package com.smartaccess.repository;

import com.smartaccess.model.Telemetry;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TelemetryRepository extends JpaRepository<Telemetry, Long> {
}
