package com.smartaccess.repository;

import com.smartaccess.model.AccessUnit;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface AccessUnitRepository extends JpaRepository<AccessUnit, Long> {
    boolean existsByManager_AccountId(Long accountId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from AccessUnit u where u.unitId = :unitId")
    Optional<AccessUnit> findForUpdate(@Param("unitId") Long unitId);
}
