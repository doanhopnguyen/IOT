package com.smartaccess.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.io.Serializable;

@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class UserAccessId implements Serializable {
    private static final long serialVersionUID = 1L;

    @Column(name = "account_id", nullable = false)
    private Long accountId;

    @Column(name = "unit_id", nullable = false)
    private Long unitId;
}
