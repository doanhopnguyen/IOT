package com.smartaccess.service;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.AccountStatus;
import com.smartaccess.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.util.*;
import static org.springframework.http.HttpStatus.*;
@Service @Transactional
public class InvitationService {
 public record View(Long id,Long unitId,String doorName,Long recipientId,String recipientName,String ownerName,String status,LocalDateTime expiresAt){}
 private final DoorInvitationRepository invitations;private final AccountRepository accounts;private final UserAccessRepository members;
 private final CurrentAccountService current;private final ManagerAccessGuard guard;
 public InvitationService(DoorInvitationRepository invitations,AccountRepository accounts,UserAccessRepository members,CurrentAccountService current,ManagerAccessGuard guard){this.invitations=invitations;this.accounts=accounts;this.members=members;this.current=current;this.guard=guard;}
 public View invite(Long unitId,Long userId){
  Account actor=current.requireAccount();AccessUnit u=guard.requireManagedUnit(actor.getAccountId(),unitId);
  // Lock the recipient to serialize duplicate invitations and acceptance for that account.
  Account target=accounts.findForUpdate(userId).filter(a->a.getStatus()==AccountStatus.ACTIVE).orElseThrow(()->new ResponseStatusException(NOT_FOUND,"Tài khoản người nhận chưa có hoặc không hoạt động"));
  if(target.getAccountId().equals(actor.getAccountId())||members.existsById(new UserAccessId(userId,unitId)))throw new ResponseStatusException(CONFLICT,"Đã có quyền tại cửa");
  var pending=invitations.findByUnit_UnitIdOrderByIdDesc(unitId).stream().filter(i->i.getRecipient().getAccountId().equals(userId)&&i.getStatus().equals("PENDING")&&i.getExpiresAt().isAfter(LocalDateTime.now())).findFirst();
  if(pending.isPresent())return dto(pending.get());
  DoorInvitation i=new DoorInvitation();i.setUnit(u);i.setRecipient(target);i.setExpiresAt(LocalDateTime.now().plusDays(7));return dto(invitations.saveAndFlush(i));
 }
 public List<View> mine(){return invitations.findByRecipient_AccountIdOrderByIdDesc(current.requireAccount().getAccountId()).stream().map(this::dto).toList();}
 public View respond(Long id,boolean accept){
  Account actor=current.requireAccount();accounts.findForUpdate(actor.getAccountId()).orElseThrow();
  DoorInvitation i=invitations.lock(id).orElseThrow(()->new ResponseStatusException(NOT_FOUND));
  if(!i.getRecipient().getAccountId().equals(actor.getAccountId()))throw new ResponseStatusException(FORBIDDEN);
  if(!i.getStatus().equals("PENDING"))throw new ResponseStatusException(CONFLICT,"Lời mời đã xử lý");
  if(i.getExpiresAt().isBefore(LocalDateTime.now()))throw new ResponseStatusException(CONFLICT,"Lời mời hết hạn");
  if(accept){UserAccessId key=new UserAccessId(actor.getAccountId(),i.getUnit().getUnitId());
   if(!members.existsById(key)){UserAccess m=new UserAccess();m.setAccount(actor);m.setAccessUnit(i.getUnit());members.saveAndFlush(m);}}
  i.setStatus(accept?"ACCEPTED":"DECLINED");return dto(i);
 }
 private View dto(DoorInvitation i){return new View(i.getId(),i.getUnit().getUnitId(),i.getUnit().getUnitName(),i.getRecipient().getAccountId(),i.getRecipient().getFullName(),i.getUnit().getManager()==null?"":i.getUnit().getManager().getFullName(),i.getStatus().equals("PENDING")&&i.getExpiresAt().isBefore(LocalDateTime.now())?"EXPIRED":i.getStatus(),i.getExpiresAt());}
}
