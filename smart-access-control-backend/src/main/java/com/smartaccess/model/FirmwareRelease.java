package com.smartaccess.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDateTime;

@Entity @Table(name="firmware_releases") @Getter @Setter
public class FirmwareRelease {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) @Column(name="release_id") private Long releaseId;
    @Column(nullable=false,length=50) private String version;
    @Column(nullable=false,length=100) private String label;
    @Column(name="hardware_version",nullable=false,length=50) private String hardwareVersion;
    @Column(nullable=false,length=2000) private String notes;
    @Column(nullable=false,length=64,columnDefinition="char(64)") private String sha256;
    @Column(name="image_size",nullable=false) private int imageSize;
    @Lob @Column(nullable=false,columnDefinition="longblob") private byte[] image;
    @Lob @Basic(fetch=FetchType.LAZY) @Column(name="factory_image",columnDefinition="longblob") private byte[] factoryImage;
    @Column(name="factory_sha256",length=64,columnDefinition="char(64)") private String factorySha256;
    @Column(name="factory_size") private Integer factorySize;
    @Column(name="published_at",nullable=false) private LocalDateTime publishedAt;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="published_by",nullable=false) private Account publishedBy;
}
