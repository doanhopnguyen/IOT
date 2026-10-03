package com.smartaccess.model;

import com.smartaccess.model.enumtype.CredentialStatus;
import com.smartaccess.model.enumtype.CredentialType;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "credentials")
@Getter
@Setter
@NoArgsConstructor
public class Credential {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "credential_id")
    private Long credentialId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    @Enumerated(EnumType.STRING)
    @Column(name = "credential_type", nullable = false, length = 30)
    private CredentialType credentialType;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private CredentialStatus status = CredentialStatus.ACTIVE;

    @Lob
    @Column(name = "face_embedding", nullable = true, columnDefinition = "blob")
    private byte[] faceEmbedding;

    @Column(name = "embedding_model", nullable = true, length = 100)
    private String embeddingModel;

    @Column(name = "rfid_uid", nullable = true, length = 64)
    private String rfidUid;

    @ManyToOne(fetch = FetchType.LAZY, optional = true)
    @JoinColumn(name = "device_id", nullable = true)
    private Device device;

    @Column(name = "local_template_id", nullable = true)
    private Short localTemplateId;

    @Column(name = "created_at", nullable = false, columnDefinition = "datetime(3)")
    private LocalDateTime createdAt;

    @Column(name = "revoked_at", nullable = true, columnDefinition = "datetime(3)")
    private LocalDateTime revokedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        if (createdAt == null) { createdAt = now; }
    }
}
