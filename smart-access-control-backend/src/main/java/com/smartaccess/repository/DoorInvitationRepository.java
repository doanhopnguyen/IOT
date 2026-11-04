package com.smartaccess.repository;
import com.smartaccess.model.DoorInvitation;
import org.springframework.data.jpa.repository.*;
import jakarta.persistence.LockModeType;
import java.util.*;
public interface DoorInvitationRepository extends JpaRepository<DoorInvitation,Long> {
 List<DoorInvitation> findByRecipient_AccountIdOrderByIdDesc(Long id);
 List<DoorInvitation> findByUnit_UnitIdOrderByIdDesc(Long id);
 @Lock(LockModeType.PESSIMISTIC_WRITE)
 @org.springframework.data.jpa.repository.Query("select i from DoorInvitation i where i.id=:id")
 Optional<DoorInvitation> lock(@org.springframework.data.repository.query.Param("id") Long id);
}
