package com.smartaccess.repository;

import com.smartaccess.model.enumtype.CredentialStatus;
import com.smartaccess.model.enumtype.CredentialType;
import java.util.List;
import com.smartaccess.model.Credential;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CredentialRepository extends JpaRepository<Credential, Long> {

    List<Credential> findByDevice_DeviceIdAndCredentialTypeAndStatus(
            Long deviceId, CredentialType type, CredentialStatus status);
}
