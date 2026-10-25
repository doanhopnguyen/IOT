package com.smartaccess.repository;

import com.smartaccess.model.enumtype.CredentialStatus;
import com.smartaccess.model.enumtype.CredentialType;
import java.util.List;
import java.util.Optional;
import com.smartaccess.model.Credential;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CredentialRepository extends JpaRepository<Credential, Long> {

    List<Credential> findByDevice_DeviceIdAndCredentialTypeAndStatus(
            Long deviceId, CredentialType type, CredentialStatus status);

    Optional<Credential> findFirstByDevice_DeviceIdAndCredentialTypeAndLocalTemplateIdAndStatus(
            Long deviceId, CredentialType type, Short localTemplateId, CredentialStatus status);

    boolean existsByRfidUidAndStatus(String rfidUid, CredentialStatus status);

    boolean existsByAccount_AccountIdAndCredentialTypeAndStatus(Long accountId, CredentialType type, CredentialStatus status);

    List<Credential> findByAccount_AccountId(Long accountId);
}
