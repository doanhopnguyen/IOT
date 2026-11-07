package com.smartaccess.repository;

import com.smartaccess.model.AccessLog;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccessLogRepository extends JpaRepository<AccessLog, Long>, org.springframework.data.jpa.repository.JpaSpecificationExecutor<AccessLog> {
    java.util.Optional<AccessLog> findByAccessUuid(String accessUuid);
    boolean existsByAccount_AccountId(Long accountId);

    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query("update AccessLog l set l.credential = null where l.credential.credentialId in :ids")
    int detachCredentials(@org.springframework.data.repository.query.Param("ids") java.util.List<Long> ids);

    /** Lượt của cửa theo phương thức/kết quả xảy ra sau mốc after; dùng cho quy tắc cảnh báo thử sai nhiều lần. */
    java.util.List<AccessLog> findByAccessUnit_UnitIdAndMethodInAndResultAndOccurredAtAfter(Long unitId,
            java.util.Collection<com.smartaccess.model.enumtype.AccessMethod> methods,
            com.smartaccess.model.enumtype.AccessResult result, java.time.LocalDateTime after);

    java.util.List<AccessLog> findByAccessUnit_UnitIdAndOccurredAtBetweenOrderByOccurredAtAsc(
            Long unitId, java.time.LocalDateTime from, java.time.LocalDateTime to);

    long countByResultAndOccurredAtGreaterThanEqual(com.smartaccess.model.enumtype.AccessResult result,
            java.time.LocalDateTime from);
}
