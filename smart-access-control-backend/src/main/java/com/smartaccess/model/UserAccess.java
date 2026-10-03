package com.smartaccess.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "user_access")
@Getter
@Setter
@NoArgsConstructor
public class UserAccess {

    @EmbeddedId
    private UserAccessId id = new UserAccessId();

    @MapsId("accountId")
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    @MapsId("unitId")
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "unit_id", nullable = false)
    private AccessUnit accessUnit;

    @Column(name = "allow_face", nullable = false)
    private boolean allowFace = false;

    @Column(name = "allow_fingerprint", nullable = false)
    private boolean allowFingerprint = false;

    @Column(name = "allow_rfid", nullable = false)
    private boolean allowRfid = false;

    @Column(name = "allow_remote_unlock", nullable = false)
    private boolean allowRemoteUnlock = false;
}
