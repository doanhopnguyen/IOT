package com.smartaccess.repository;

import com.smartaccess.model.Event;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventRepository extends JpaRepository<Event, Long>, org.springframework.data.jpa.repository.JpaSpecificationExecutor<Event> {
    java.util.Optional<Event> findByEventUuid(String eventUuid);

    /** Cảnh báo cùng loại của thiết bị đang mở (OPEN/ACKNOWLEDGED), dùng để không sinh trùng. */
    java.util.Optional<Event> findFirstByDevice_DeviceIdAndEventTypeAndAlertStatusIn(
            Long deviceId, String eventType, java.util.Collection<com.smartaccess.model.enumtype.AlertStatus> statuses);

    long countByAlertStatusIn(java.util.Collection<com.smartaccess.model.enumtype.AlertStatus> statuses);

    long countByAlertStatusInAndSeverity(java.util.Collection<com.smartaccess.model.enumtype.AlertStatus> statuses,
            com.smartaccess.model.enumtype.EventSeverity severity);
}
