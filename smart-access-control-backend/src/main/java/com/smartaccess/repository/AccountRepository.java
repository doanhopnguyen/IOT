package com.smartaccess.repository;

import com.smartaccess.model.Account;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AccountRepository extends JpaRepository<Account, Long> {
    Optional<Account> findByEmail(String email);
    Optional<Account> findByEmailIgnoreCase(String email);
    Optional<Account> findByPhone(String phone);
    boolean existsByEmail(String email);
    boolean existsByPhone(String phone);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Account a where a.accountId = :id")
    Optional<Account> findForUpdate(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Account a where lower(a.email) = lower(:email)")
    Optional<Account> findByEmailForUpdate(@Param("email") String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Account a where a.phone = :phone")
    Optional<Account> findByPhoneForUpdate(@Param("phone") String phone);
}
