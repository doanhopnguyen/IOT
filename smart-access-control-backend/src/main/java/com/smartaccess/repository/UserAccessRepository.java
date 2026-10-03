package com.smartaccess.repository;

import com.smartaccess.model.UserAccess;
import org.springframework.data.jpa.repository.JpaRepository;
import com.smartaccess.model.UserAccessId;

public interface UserAccessRepository extends JpaRepository<UserAccess, UserAccessId> {
}
