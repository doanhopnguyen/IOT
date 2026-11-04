package com.smartaccess.controller;
import com.smartaccess.service.*;
import com.smartaccess.repository.CredentialRepository;
import com.smartaccess.model.enumtype.CredentialType;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
@RestController @Transactional(readOnly=true)
public class OwnerCredentialController {
 public record View(Long id,String type,String status,String rfidUid,Short templateId){}
 private final CurrentAccountService current;private final ManagerAccessGuard guard;private final CredentialRepository credentials;
 public OwnerCredentialController(CurrentAccountService current,ManagerAccessGuard guard,CredentialRepository credentials){this.current=current;this.guard=guard;this.credentials=credentials;}
 @GetMapping("/api/manager/units/{unitId}/users/{userId}/credentials")
 public List<View> list(@PathVariable Long unitId,@PathVariable Long userId){guard.requireManagedUnit(current.requireAccount().getAccountId(),unitId);guard.requireUserOfUnit(userId,unitId);
  return credentials.findByAccount_AccountId(userId).stream().filter(c->c.getCredentialType()!=CredentialType.FACE&&c.getDevice()!=null&&c.getDevice().getAccessUnit()!=null&&c.getDevice().getAccessUnit().getUnitId().equals(unitId)).map(c->new View(c.getCredentialId(),c.getCredentialType().name(),c.getStatus().name(),c.getRfidUid(),c.getLocalTemplateId())).toList();
 }
}
