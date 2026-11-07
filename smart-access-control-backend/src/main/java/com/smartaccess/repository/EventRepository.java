package com.smartaccess.repository;

import com.smartaccess.model.Event;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventRepository extends JpaRepository<Event, Long>, org.springframework.data.jpa.repository.JpaSpecificationExecutor<Event> {
    interface DailySeverityCount {
        Integer getYear();
        Integer getMonth();
        Integer getDay();
        com.smartaccess.model.enumtype.EventSeverity getSeverity();
        long getTotal();
    }

    @org.springframework.data.jpa.repository.Query("""
            select year(e.occurredAt) as year, month(e.occurredAt) as month,
                   day(e.occurredAt) as day, e.severity as severity, count(e) as total
            from Event e join e.device d join d.accessUnit u
            where u.manager.accountId = :accountId
              and e.occurredAt >= :from and e.occurredAt < :to
              and (:severity is null or e.severity = :severity)
              and (:relatedUserId is null or exists
                  (select a.accountId from e.relatedAccounts a where a.accountId = :relatedUserId))
            group by year(e.occurredAt), month(e.occurredAt), day(e.occurredAt), e.severity
            """)
    java.util.List<DailySeverityCount> countDailyForManager(Long accountId,
            java.time.LocalDateTime from, java.time.LocalDateTime to,
            com.smartaccess.model.enumtype.EventSeverity severity, Long relatedUserId);

    @org.springframework.data.jpa.repository.Query("""
            select a from Account a where
              exists (select u.unitId from AccessUnit u where u.manager.accountId = :managerId and u.manager = a)
              or exists (select ua.id from UserAccess ua where ua.account = a and ua.accessUnit.manager.accountId = :managerId)
            order by a.fullName, a.accountId
            """)
    java.util.List<com.smartaccess.model.Account> findAlertUsers(Long managerId);

    java.util.Optional<Event> findByEventUuid(String eventUuid);

    /** Cảnh báo cùng loại của thiết bị đang mở (OPEN/ACKNOWLEDGED), dùng để không sinh trùng. */
    java.util.Optional<Event> findFirstByDevice_DeviceIdAndEventTypeAndAlertStatusIn(
            Long deviceId, String eventType, java.util.Collection<com.smartaccess.model.enumtype.AlertStatus> statuses);

    /** Cảnh báo gần nhất cùng loại của thiết bị, ở bất kỳ trạng thái nào. */
    java.util.Optional<Event> findFirstByDevice_DeviceIdAndEventTypeOrderByOccurredAtDesc(Long deviceId, String eventType);

    long countByAlertStatusIn(java.util.Collection<com.smartaccess.model.enumtype.AlertStatus> statuses);

    long countByAlertStatusInAndSeverity(java.util.Collection<com.smartaccess.model.enumtype.AlertStatus> statuses,
            com.smartaccess.model.enumtype.EventSeverity severity);
}
