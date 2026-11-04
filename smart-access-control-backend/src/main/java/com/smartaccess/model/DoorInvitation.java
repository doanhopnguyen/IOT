package com.smartaccess.model;
import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
@Entity @Table(name="door_invitations") @Getter @Setter @NoArgsConstructor
public class DoorInvitation {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="unit_id",nullable=false) private AccessUnit unit;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="recipient_id",nullable=false) private Account recipient;
 @Column(nullable=false,length=20) private String status="PENDING";
 @Column(name="expires_at",nullable=false) private LocalDateTime expiresAt;
}
