package com.smartaccess.repository;

import com.smartaccess.model.AccessLog;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccessLogRepository extends JpaRepository<AccessLog, Long>, org.springframework.data.jpa.repository.JpaSpecificationExecutor<AccessLog> {
    java.util.Optional<AccessLog> findByAccessUuid(String accessUuid);
    boolean existsByAccount_AccountId(Long accountId);

    long countByAccessUnit_UnitIdAndResultAndOccurredAtGreaterThanEqual(
            Long unitId, com.smartaccess.model.enumtype.AccessResult result, java.time.LocalDateTime from);

    java.util.List<AccessLog> findByAccessUnit_UnitIdAndOccurredAtBetweenOrderByOccurredAtAsc(
            Long unitId, java.time.LocalDateTime from, java.time.LocalDateTime to);

    long countByResultAndOccurredAtGreaterThanEqual(com.smartaccess.model.enumtype.AccessResult result,
            java.time.LocalDateTime from);
}
