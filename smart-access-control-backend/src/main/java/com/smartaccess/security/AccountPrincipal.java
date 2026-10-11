package com.smartaccess.security;

import java.io.Serializable;
import java.security.Principal;

/** Contains only identity; account status and authorities are refreshed on each request. */
public record AccountPrincipal(Long accountId) implements Principal, Serializable {
    @Override public String getName() { return accountId.toString(); }
}
