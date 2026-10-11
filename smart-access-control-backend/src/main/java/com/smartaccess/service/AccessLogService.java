package com.smartaccess.service;

import com.smartaccess.dto.HistoryDtos.*;
import com.smartaccess.model.*;
import com.smartaccess.model.enumtype.*;
import com.smartaccess.repository.AccessLogRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

@Service
@Transactional(readOnly = true)
public class AccessLogService {
    private final AccessLogRepository logs;
    private final CurrentAccountService current;
    public AccessLogService(AccessLogRepository logs, CurrentAccountService current) {
        this.logs = logs;
        this.current = current;
    }
    public PageResponse<Log> list(Long unitId,
            LocalDateTime from,
            LocalDateTime to,
            AccessMethod method,
            AccessResult result,
            int page,
            int size) {
        validate(from, to, page, size);
        Long accountId = current.requireAccount().getAccountId();
        Specification<AccessLog> spec = (root, query, cb) -> {
            var manager = root.join("accessUnit").join("manager", jakarta.persistence.criteria.JoinType.LEFT);
            var account = root.join("account", jakarta.persistence.criteria.JoinType.LEFT);
            return cb.or(cb.equal(manager.get("accountId"), accountId), cb.equal(account.get("accountId"), accountId));
        };
        if (unitId != null) spec = spec.and((r, q, c) -> c.equal(r.get("accessUnit").get("unitId"), unitId));
        if (from != null) spec = spec.and((r, q, c) -> c.greaterThanOrEqualTo(r.get("occurredAt"), from));
        if (to != null) spec = spec.and((r, q, c) -> c.lessThanOrEqualTo(r.get("occurredAt"), to));
        if (method != null) spec = spec.and((r, q, c) -> c.equal(r.get("method"), method));
        if (result != null) spec = spec.and((r, q, c) -> c.equal(r.get("result"), result));
        var data = logs.findAll(spec, PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "occurredAt", "accessLogId")));
        return new PageResponse<>(data.stream().map(AccessLogService::dto).toList(), page, size, data.getTotalElements(), data.hasNext());
    }
    static void validate(LocalDateTime from, LocalDateTime to, int page, int size) {
        if (page < 0 || size < 1 || size > 100 || (from != null && to != null && from.isAfter(to)))
            throw new ResponseStatusException(BAD_REQUEST, "Invalid time range or pagination (size 1..100)");
    }
    private static Log dto(AccessLog l) {
        return new Log(l.getAccessLogId(),
                new Reference(l.getAccessUnit().getUnitId(), l.getAccessUnit().getUnitName()),
                new Reference(l.getSourceDevice().getDeviceId(), l.getSourceDevice().getDeviceName()),
                l.getAccount() == null ? null : new Reference(l.getAccount().getAccountId(), l.getAccount().getFullName()),
                l.getMethod(),
                l.getResult(),
                l.getReasonCode(),
                l.getOccurredAt());
    }
}
