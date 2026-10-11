package com.smartaccess.repository;

import com.smartaccess.model.AccessLog;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccessLogRepository extends JpaRepository<AccessLog, Long>, org.springframework.data.jpa.repository.JpaSpecificationExecutor<AccessLog> {}
