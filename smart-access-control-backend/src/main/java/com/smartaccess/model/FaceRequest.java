package com.smartaccess.model;

import com.smartaccess.model.enumtype.FaceRequestStatus;
import com.smartaccess.model.enumtype.FaceRequestType;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "face_requests")
@Getter
@Setter
@NoArgsConstructor
public class FaceRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "request_id")
    private Long requestId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "unit_id", nullable = false)
    private AccessUnit accessUnit;

    @Enumerated(EnumType.STRING)
    @Column(name = "request_type", nullable = false, length = 20)
    private FaceRequestType requestType;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private FaceRequestStatus status = FaceRequestStatus.PENDING;

    @Column(name = "requested_at", nullable = false, columnDefinition = "datetime(3)")
    private LocalDateTime requestedAt;

    @Column(name = "reviewed_at", nullable = true, columnDefinition = "datetime(3)")
    private LocalDateTime reviewedAt;

    @Column(name = "completed_at", nullable = true, columnDefinition = "datetime(3)")
    private LocalDateTime completedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        if (requestedAt == null) { requestedAt = now; }
    }
}
