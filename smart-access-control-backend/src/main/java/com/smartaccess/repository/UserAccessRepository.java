package com.smartaccess.repository;

import com.smartaccess.model.UserAccess;
import com.smartaccess.model.UserAccessId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface UserAccessRepository extends JpaRepository<UserAccess, UserAccessId> {
    @Query("select ua from UserAccess ua join fetch ua.account where ua.accessUnit.unitId = :unitId order by ua.account.accountId")
    List<UserAccess> findMembersByUnitId(@Param("unitId") Long unitId);
}
