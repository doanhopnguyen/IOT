package com.smartaccess.repository;

import com.smartaccess.model.FaceRequest;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FaceRequestRepository extends JpaRepository<FaceRequest, Long> {
    boolean existsByAccount_AccountIdAndAccessUnit_UnitId(Long accountId, Long unitId);
}
