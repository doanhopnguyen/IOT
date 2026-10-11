package com.smartaccess.dto.account;

import com.smartaccess.model.enumtype.AccountStatus;
import jakarta.validation.constraints.NotNull;

public record AccountStatusRequest(@NotNull AccountStatus status) {}
