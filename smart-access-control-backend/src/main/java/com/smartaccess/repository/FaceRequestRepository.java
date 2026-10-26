package com.smartaccess.repository;

import com.smartaccess.model.FaceRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import com.smartaccess.model.enumtype.FaceRequestStatus;

public interface FaceRequestRepository extends JpaRepository<FaceRequest, Long> {
    boolean existsByAccount_AccountIdAndAccessUnit_UnitId(Long accountId, Long unitId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from FaceRequest r where r.requestId = :id")
    Optional<FaceRequest> findForUpdate(@Param("id") Long id);

    @Query("select r.account.accountId from FaceRequest r where r.requestId = :id")
    Optional<Long> findAccountIdByRequestId(@Param("id") Long id);

    List<FaceRequest> findByAccount_AccountIdOrderByRequestedAtDesc(Long accountId);
    List<FaceRequest> findByAccessUnit_UnitIdOrderByRequestedAtDesc(Long unitId);
    List<FaceRequest> findByAccount_AccountIdAndStatusIn(Long accountId, List<FaceRequestStatus> statuses);
}
